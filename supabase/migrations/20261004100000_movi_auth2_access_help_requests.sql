-- MOVI Auth 2.0: pre-Auth access help and conservative legacy-profile lookup.
-- Additive only. This migration never links, merges, or changes a business profile.

create table public.user_access_help_requests (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique check (length(request_key) between 32 and 128),
  kind text not null check (kind in ('email_inaccessible','name_mismatch','multiple_profiles')),
  status text not null default 'open' check (status in ('open','resolved','cancelled')),
  public_user_id uuid references public.users(id) on delete set null,
  duplicate_group_id uuid references public.user_duplicate_review_groups(id) on delete set null,
  submitted_name_normalized text,
  submitted_phone_normalized text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by_staff_id uuid references public.staff_users(id) on delete set null,
  resolution_note text,
  check (
    (status = 'open' and closed_at is null and closed_by_staff_id is null)
    or (status in ('resolved','cancelled') and closed_at is not null)
  ),
  check (submitted_name_normalized is null or length(submitted_name_normalized) <= 160),
  check (submitted_phone_normalized is null or length(submitted_phone_normalized) <= 20),
  check (resolution_note is null or length(resolution_note) <= 1000)
);

create index user_access_help_requests_open_idx
  on public.user_access_help_requests(created_at desc) where status = 'open';
create index user_access_help_requests_public_user_idx
  on public.user_access_help_requests(public_user_id) where public_user_id is not null;

alter table public.user_access_help_requests enable row level security;
revoke all on table public.user_access_help_requests from public, anon, authenticated;
grant select, insert, update on table public.user_access_help_requests to service_role;

create function public.normalize_user_person_name(p_name text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select nullif(regexp_replace(
    translate(lower(btrim(p_name)),
      'àáâäãåèéêëìíîïòóôöõùúûüýÿ’`',
      'aaaaaaeeeeiiiiooooouuuuyy  '),
    '[^a-z0-9]+', ' ', 'g'), '');
$$;

create function public.lookup_legacy_profile_for_activation(p_full_name text, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_phone text := public.normalize_user_mobile_e164(p_phone);
  v_name text := public.normalize_user_person_name(p_full_name);
  v_count integer := 0;
  v_user public.users%rowtype;
begin
  if v_phone is null or v_name is null then
    return jsonb_build_object('state','not_found');
  end if;

  select count(*) into v_count
  from public.users u
  where u.identity_status = 'active'
    and u.merged_into_user_id is null
    and public.normalize_user_mobile_e164(u.phone) = v_phone;

  if v_count = 0 then return jsonb_build_object('state','not_found'); end if;
  if v_count > 1 then
    return jsonb_build_object('state','multiple_profiles','normalized_name',v_name,'normalized_phone',v_phone);
  end if;

  select * into v_user from public.users u
  where u.identity_status = 'active' and u.merged_into_user_id is null
    and public.normalize_user_mobile_e164(u.phone) = v_phone;

  if public.normalize_user_person_name(v_user.full_name) <> v_name then
    return jsonb_build_object('state','name_mismatch','public_user_id',v_user.id,
      'normalized_name',v_name,'normalized_phone',v_phone);
  end if;
  if v_user.auth_user_id is not null then
    return jsonb_build_object('state','already_linked');
  end if;
  if v_user.auth_migration_state not in ('legacy','activation_pending') then
    return jsonb_build_object('state','assistance_required');
  end if;

  return jsonb_build_object('state','found','public_user_id',v_user.id,
    'normalized_name',v_name,'normalized_phone',v_phone);
end;
$$;

create function public.new_user_profile_preflight(p_phone text, p_email text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object('state', case when exists (
    select 1 from public.users u
    where u.identity_status = 'active' and u.merged_into_user_id is null
      and (
        public.normalize_user_mobile_e164(u.phone) = public.normalize_user_mobile_e164(p_phone)
        or public.normalize_user_email(u.email) = public.normalize_user_email(p_email)
      )
  ) then 'existing_profile' else 'clear' end);
$$;

create function public.validate_legacy_activation_context(p_auth_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_draft public.user_auth_onboarding%rowtype;
  v_lookup jsonb;
  v_auth_email text;
  v_profile_email text;
begin
  select * into v_draft from public.user_auth_onboarding
    where auth_user_id=p_auth_user_id and flow='activation';
  select public.normalize_user_email(email) into v_auth_email from auth.users
    where id=p_auth_user_id and email_confirmed_at is not null;
  if v_draft.auth_user_id is null or v_draft.full_name is null
     or v_draft.normalized_phone is null or v_auth_email is null then
    return jsonb_build_object('state','invalid');
  end if;
  v_lookup:=public.lookup_legacy_profile_for_activation(v_draft.full_name,v_draft.normalized_phone);
  if v_lookup->>'state'<>'found' then return jsonb_build_object('state','invalid'); end if;
  select public.normalize_user_email(email) into v_profile_email from public.users
    where id=(v_lookup->>'public_user_id')::uuid and identity_status='active'
      and merged_into_user_id is null and auth_user_id is null;
  return jsonb_build_object('state',case when v_profile_email=v_auth_email then 'valid' else 'invalid' end);
end;
$$;

create function public.create_user_access_help_request(
  p_request_key text,
  p_kind text,
  p_public_user_id uuid default null,
  p_duplicate_group_id uuid default null,
  p_submitted_name_normalized text default null,
  p_submitted_phone_normalized text default null
)
returns public.user_access_help_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row public.user_access_help_requests%rowtype;
begin
  if p_kind not in ('email_inaccessible','name_mismatch','multiple_profiles')
     or p_request_key !~ '^[a-f0-9]{64}$' then
    raise exception 'MOVI_ACCESS_HELP_INVALID_REQUEST' using errcode='22023';
  end if;
  if p_public_user_id is not null and not exists (
    select 1 from public.users u where u.id=p_public_user_id
      and u.identity_status='active' and u.merged_into_user_id is null
  ) then raise exception 'MOVI_ACCESS_HELP_INVALID_PROFILE' using errcode='22023'; end if;

  insert into public.user_access_help_requests(
    request_key,kind,public_user_id,duplicate_group_id,
    submitted_name_normalized,submitted_phone_normalized
  ) values (
    p_request_key,p_kind,p_public_user_id,p_duplicate_group_id,
    case when p_public_user_id is null then nullif(btrim(p_submitted_name_normalized),'') end,
    case when p_public_user_id is null then public.normalize_user_mobile_e164(p_submitted_phone_normalized) end
  ) on conflict(request_key) do nothing;

  select * into v_row from public.user_access_help_requests where request_key=p_request_key;
  return v_row;
end;
$$;

create function public.close_user_access_help_request(
  p_request_id uuid, p_action text, p_actor_staff_id uuid, p_note text default null
)
returns public.user_access_help_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row public.user_access_help_requests%rowtype;
begin
  if p_action not in ('resolved','cancelled') then
    raise exception 'MOVI_ACCESS_HELP_INVALID_ACTION' using errcode='22023';
  end if;
  if not exists(select 1 from public.staff_users s where s.id=p_actor_staff_id and s.is_active and s.role='admin') then
    raise exception 'MOVI_ACCESS_HELP_ADMIN_REQUIRED' using errcode='42501';
  end if;
  select * into v_row from public.user_access_help_requests where id=p_request_id for update;
  if not found then raise exception 'MOVI_ACCESS_HELP_NOT_FOUND' using errcode='P0002'; end if;
  if v_row.status = p_action then return v_row; end if;
  if v_row.status <> 'open' then raise exception 'MOVI_ACCESS_HELP_ALREADY_CLOSED' using errcode='55000'; end if;
  update public.user_access_help_requests set status=p_action, closed_at=now(),
    closed_by_staff_id=p_actor_staff_id, resolution_note=nullif(btrim(p_note),''), updated_at=now()
    where id=p_request_id returning * into v_row;
  return v_row;
end;
$$;

create function public.prevent_user_access_help_identity_mutation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.request_key<>old.request_key or new.kind<>old.kind
     or new.public_user_id is distinct from old.public_user_id
     or new.duplicate_group_id is distinct from old.duplicate_group_id
     or new.submitted_name_normalized is distinct from old.submitted_name_normalized
     or new.submitted_phone_normalized is distinct from old.submitted_phone_normalized then
    raise exception 'MOVI_ACCESS_HELP_IDENTITY_IMMUTABLE' using errcode='55000';
  end if;
  return new;
end;
$$;
create trigger user_access_help_identity_immutable before update on public.user_access_help_requests
for each row execute function public.prevent_user_access_help_identity_mutation();

revoke all on function public.normalize_user_person_name(text) from public,anon,authenticated;
revoke all on function public.lookup_legacy_profile_for_activation(text,text) from public,anon,authenticated;
revoke all on function public.new_user_profile_preflight(text,text) from public,anon,authenticated;
revoke all on function public.validate_legacy_activation_context(uuid) from public,anon,authenticated;
revoke all on function public.create_user_access_help_request(text,text,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.close_user_access_help_request(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.prevent_user_access_help_identity_mutation() from public,anon,authenticated;
grant execute on function public.normalize_user_person_name(text) to service_role;
grant execute on function public.lookup_legacy_profile_for_activation(text,text) to service_role;
grant execute on function public.new_user_profile_preflight(text,text) to service_role;
grant execute on function public.validate_legacy_activation_context(uuid) to service_role;
grant execute on function public.create_user_access_help_request(text,text,uuid,uuid,text,text) to service_role;
grant execute on function public.close_user_access_help_request(uuid,text,uuid,text) to service_role;

comment on table public.user_access_help_requests is
  'Service-only pre-Auth assistance queue. Rows never prove ownership or authorize linking, merging, or privileges.';
