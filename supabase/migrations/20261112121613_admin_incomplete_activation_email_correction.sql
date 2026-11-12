-- Admin-only, resumable correction of an unconfirmed legacy activation.
-- Auth deletion is performed by GoTrue Admin API between prepare and finish.
create table public.account_activation_email_repair_operations (
  id uuid primary key,
  public_user_id uuid not null references public.users(id) on delete restrict,
  old_auth_user_id uuid not null,
  actor_staff_id uuid not null references public.staff_users(id) on delete restrict,
  old_email text not null,
  new_email text not null,
  reason text not null check (char_length(btrim(reason)) between 8 and 1000),
  state text not null check (state in ('prepared','completed','cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index account_activation_email_repair_one_open
  on public.account_activation_email_repair_operations(public_user_id) where state='prepared';

create table public.account_activation_email_repair_events (
  id bigint generated always as identity primary key,
  operation_id uuid not null references public.account_activation_email_repair_operations(id) on delete restrict,
  actor_staff_id uuid not null references public.staff_users(id) on delete restrict,
  public_user_id uuid not null references public.users(id) on delete restrict,
  old_auth_user_id uuid not null,
  event_type text not null check (event_type in
    ('ACCOUNT_ACTIVATION_EMAIL_CORRECTION_PREPARED','ACCOUNT_ACTIVATION_EMAIL_CORRECTION_CANCELLED',
     'ACCOUNT_ACTIVATION_EMAIL_CORRECTED')),
  old_email text not null,
  new_email text not null,
  previous_auth_state text not null,
  resulting_auth_state text not null,
  previous_onboarding_state text not null,
  resulting_onboarding_state text not null,
  previous_migration_state text not null,
  resulting_migration_state text not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  unique(operation_id,event_type)
);
create trigger account_activation_email_repair_events_immutable
  before update or delete on public.account_activation_email_repair_events
  for each row execute function public.prevent_user_auth_link_event_mutation();

alter table public.account_activation_email_repair_operations enable row level security;
alter table public.account_activation_email_repair_events enable row level security;
revoke all on public.account_activation_email_repair_operations, public.account_activation_email_repair_events
  from public, anon, authenticated;
grant select on public.account_activation_email_repair_operations, public.account_activation_email_repair_events to service_role;

-- A confirmation callback may race the Admin API. It must never link the old
-- Auth identity while a prepared repair exists.
create function public.guard_account_activation_email_repair_link()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.auth_user_id is not null and old.auth_user_id is distinct from new.auth_user_id
     and exists(select 1 from public.account_activation_email_repair_operations r
                where r.public_user_id=new.id and r.state='prepared') then
    raise exception 'ACCOUNT_ACTIVATION_REPAIR_IN_PROGRESS' using errcode='55000';
  end if;
  return new;
end $$;
create trigger users_guard_account_activation_email_repair_link
  before update of auth_user_id on public.users
  for each row execute function public.guard_account_activation_email_repair_link();

create function public.account_activation_repair_email_conflict(
  p_public_user_id uuid, p_old_auth_user_id uuid, p_email text
) returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth as $$
  select exists(select 1 from public.users u
                where u.id<>p_public_user_id and public.normalize_user_email(u.email)=p_email)
      or exists(select 1 from auth.users a
                where a.id<>p_old_auth_user_id
                  and (public.normalize_user_email(a.email)=p_email
                    or public.normalize_user_email(a.email_change)=p_email))
      or exists(select 1 from auth.identities i
                where i.user_id<>p_old_auth_user_id
                  and (public.normalize_user_email(i.email)=p_email
                    or public.normalize_user_email(i.identity_data->>'email')=p_email))
      or exists(select 1 from public.user_auth_onboarding o
                where o.auth_user_id<>p_old_auth_user_id and o.state<>'linked'
                  and public.normalize_user_email(o.normalized_email)=p_email)
      or exists(select 1 from public.player_identity_email_evidence e
                join public.player_identities pi on pi.id=e.player_identity_id
                where pi.account_user_id is distinct from p_public_user_id
                  and public.normalize_user_email(e.normalized_email)=p_email);
$$;

create function public.admin_prepare_incomplete_activation_email_repair(
  p_public_user_id uuid, p_actor_staff_id uuid, p_new_email text,
  p_reason text, p_operation_id uuid, p_dry_run boolean default true
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,storage as $$
declare
  v_user public.users%rowtype;
  v_auth_id uuid;
  v_auth auth.users%rowtype;
  v_draft public.user_auth_onboarding%rowtype;
  v_count integer;
  v_player_id uuid;
  v_new_email text := public.normalize_user_email(p_new_email);
  v_operation public.account_activation_email_repair_operations%rowtype;
begin
  if not p_dry_run then
    if p_operation_id is null or p_actor_staff_id is null
       or not exists(select 1 from public.staff_users s where s.id=p_actor_staff_id
                     and s.role='admin' and s.is_active) then
      raise exception 'ACCOUNT_REPAIR_ADMIN_REQUIRED' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('account-email-repair:'||p_public_user_id::text,0));
    perform 1 from public.users where id=p_public_user_id for update;
  end if;
  select * into v_operation from public.account_activation_email_repair_operations
    where public_user_id=p_public_user_id and state='prepared' limit 1;
  if found then
    if p_dry_run or p_operation_id=v_operation.id then
      return jsonb_build_object('state','prepared','operation_id',v_operation.id,
        'auth_user_id',v_operation.old_auth_user_id,'current_email',v_operation.old_email,
        'new_email',v_operation.new_email);
    end if;
    return jsonb_build_object('state','blocked','reason','repair_in_progress');
  end if;
  if p_operation_id is not null then
    select * into v_operation from public.account_activation_email_repair_operations where id=p_operation_id;
    if found then
      return jsonb_build_object('state',case when v_operation.public_user_id=p_public_user_id
        and v_operation.state='completed' then 'completed' else 'blocked' end);
    end if;
  end if;
  select * into v_user from public.users where id=p_public_user_id;
  if not found then return jsonb_build_object('state','blocked','reason','profile_missing'); end if;
  if v_user.identity_status<>'active' or v_user.merged_into_user_id is not null
     or v_user.auth_user_id is not null or v_user.auth_migration_state<>'activation_pending'
     or public.normalize_user_email(v_user.email) is null then
    return jsonb_build_object('state','blocked','reason','profile_not_incomplete');
  end if;
  select count(*),min(o.auth_user_id::text)::uuid into v_count,v_auth_id
  from public.user_auth_onboarding o join auth.users a on a.id=o.auth_user_id
  where o.flow='activation' and o.state='pending_verification'
    and o.linked_public_user_id is null
    and public.normalize_user_email(o.normalized_email)=public.normalize_user_email(v_user.email)
    and public.normalize_user_email(a.email)=public.normalize_user_email(v_user.email)
    and o.normalized_phone=public.normalize_user_mobile_e164(v_user.phone)
    and public.normalize_user_person_name(o.full_name)=public.normalize_user_person_name(v_user.full_name);
  if v_count<>1 then return jsonb_build_object('state','blocked','reason','onboarding_ambiguous'); end if;
  select * into v_auth from auth.users where id=v_auth_id;
  select * into v_draft from public.user_auth_onboarding where auth_user_id=v_auth_id;
  if v_auth.email_confirmed_at is not null or v_auth.confirmed_at is not null
     or v_auth.phone_confirmed_at is not null or nullif(v_auth.email_change,'') is not null
     or v_auth.last_sign_in_at is not null
     or exists(select 1 from auth.sessions where user_id=v_auth_id)
     or exists(select 1 from storage.objects where owner_id=v_auth_id::text)
     or exists(select 1 from public.users where auth_user_id=v_auth_id)
     or (select count(*) from auth.users a
         where public.normalize_user_email(a.email)=public.normalize_user_email(v_user.email))<>1
     or (select count(*) from auth.identities i where i.user_id=v_auth_id)<>1
     or not exists(select 1 from auth.identities i where i.user_id=v_auth_id
         and public.normalize_user_email(i.email)=public.normalize_user_email(v_user.email))
     or exists(select 1 from public.users u where u.id<>v_user.id
         and u.identity_status='active' and u.merged_into_user_id is null
         and (public.normalize_user_email(u.email)=public.normalize_user_email(v_user.email)
           or public.normalize_user_mobile_e164(u.phone)=public.normalize_user_mobile_e164(v_user.phone))) then
    return jsonb_build_object('state','blocked','reason','auth_or_identity_conflict');
  end if;
  select count(*),min(id::text)::uuid into v_count,v_player_id from public.player_identities
    where account_user_id=v_user.id and status='active';
  if v_count>1
     or exists(select 1 from public.player_identity_cases c
       where c.status in ('open','in_review')
         and (v_user.id=any(c.account_ids) or v_player_id=any(c.player_ids)))
     or exists(select 1 from public.user_duplicate_review_members m
       join public.user_duplicate_review_groups g on g.id=m.group_id
       where m.user_id=v_user.id and m.included
         and g.state in ('pending_review','conflict','manual_only')) then
    return jsonb_build_object('state','blocked','reason','identity_review_required');
  end if;
  if p_dry_run then
    return jsonb_build_object('state','eligible','auth_user_id',v_auth_id,
      'current_email',v_user.email,'email_confirmed',false);
  end if;
  if v_new_email is null or char_length(v_new_email)>254
     or v_new_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or v_new_email=public.normalize_user_email(v_user.email)
     or char_length(btrim(coalesce(p_reason,''))) not between 8 and 1000 then
    return jsonb_build_object('state','blocked','reason','invalid_input');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('movi-auth-email:'||v_new_email,0));
  if public.account_activation_repair_email_conflict(v_user.id,v_auth_id,v_new_email) then
    return jsonb_build_object('state','blocked','reason','target_email_conflict');
  end if;
  insert into public.account_activation_email_repair_operations(
    id,public_user_id,old_auth_user_id,actor_staff_id,old_email,new_email,reason,state)
  values(p_operation_id,v_user.id,v_auth_id,p_actor_staff_id,v_user.email,v_new_email,btrim(p_reason),'prepared');
  update public.users set auth_migration_state='review_required',updated_at=now() where id=v_user.id;
  insert into public.account_activation_email_repair_events(
    operation_id,actor_staff_id,public_user_id,old_auth_user_id,event_type,old_email,new_email,
    previous_auth_state,resulting_auth_state,previous_onboarding_state,resulting_onboarding_state,
    previous_migration_state,resulting_migration_state,reason)
  values(p_operation_id,p_actor_staff_id,v_user.id,v_auth_id,
    'ACCOUNT_ACTIVATION_EMAIL_CORRECTION_PREPARED',v_user.email,v_new_email,
    'unconfirmed','unconfirmed','pending_verification','pending_verification',
    'activation_pending','review_required',btrim(p_reason));
  return jsonb_build_object('state','prepared','operation_id',p_operation_id,
    'auth_user_id',v_auth_id,'current_email',v_user.email,'new_email',v_new_email);
end $$;

create function public.admin_incomplete_activation_repair_deletion_ready(p_operation_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth,storage as $$
  select exists(
    select 1 from public.account_activation_email_repair_operations r
    join public.users u on u.id=r.public_user_id
    join auth.users a on a.id=r.old_auth_user_id
    join public.user_auth_onboarding o on o.auth_user_id=a.id
    where r.id=p_operation_id and r.state='prepared'
      and u.identity_status='active' and u.auth_user_id is null
      and u.auth_migration_state='review_required'
      and public.normalize_user_email(u.email)=public.normalize_user_email(r.old_email)
      and a.email_confirmed_at is null and a.confirmed_at is null
      and a.phone_confirmed_at is null and nullif(a.email_change,'') is null
      and a.last_sign_in_at is null
      and o.flow='activation' and o.state='pending_verification'
      and not exists(select 1 from auth.sessions s where s.user_id=a.id)
      and not exists(select 1 from storage.objects x where x.owner_id=a.id::text)
      and not public.account_activation_repair_email_conflict(r.public_user_id,r.old_auth_user_id,r.new_email)
  );
$$;

-- The old Auth account still exists at this point. If its state changes before
-- deletion, release the prepared profile so normal activation can continue.
create function public.admin_cancel_incomplete_activation_email_repair(
  p_operation_id uuid, p_actor_staff_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare
  v_op public.account_activation_email_repair_operations%rowtype;
  v_user public.users%rowtype;
begin
  if not exists(select 1 from public.staff_users s where s.id=p_actor_staff_id
                and s.role='admin' and s.is_active) then
    raise exception 'ACCOUNT_REPAIR_ADMIN_REQUIRED' using errcode='42501';
  end if;
  select * into v_op from public.account_activation_email_repair_operations where id=p_operation_id for update;
  if not found then return jsonb_build_object('state','blocked','reason','operation_missing'); end if;
  if v_op.state='cancelled' then return jsonb_build_object('state','cancelled'); end if;
  if v_op.state<>'prepared' or not exists(select 1 from auth.users where id=v_op.old_auth_user_id) then
    return jsonb_build_object('state','blocked','reason','auth_already_removed');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account-email-repair:'||v_op.public_user_id::text,0));
  select * into v_user from public.users where id=v_op.public_user_id for update;
  if v_user.identity_status<>'active' or v_user.auth_user_id is not null
     or v_user.auth_migration_state<>'review_required'
     or public.normalize_user_email(v_user.email)<>public.normalize_user_email(v_op.old_email) then
    return jsonb_build_object('state','blocked','reason','profile_changed');
  end if;
  update public.users set auth_migration_state='activation_pending',updated_at=now() where id=v_op.public_user_id;
  update public.account_activation_email_repair_operations set state='cancelled' where id=p_operation_id;
  insert into public.account_activation_email_repair_events(
    operation_id,actor_staff_id,public_user_id,old_auth_user_id,event_type,old_email,new_email,
    previous_auth_state,resulting_auth_state,previous_onboarding_state,resulting_onboarding_state,
    previous_migration_state,resulting_migration_state,reason)
  values(v_op.id,p_actor_staff_id,v_op.public_user_id,v_op.old_auth_user_id,
    'ACCOUNT_ACTIVATION_EMAIL_CORRECTION_CANCELLED',v_op.old_email,v_op.new_email,
    'unconfirmed_or_changed','preserved','pending_verification','preserved',
    'review_required','activation_pending',v_op.reason);
  return jsonb_build_object('state','cancelled');
end $$;

create function public.admin_finish_incomplete_activation_email_repair(
  p_operation_id uuid, p_actor_staff_id uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare
  v_op public.account_activation_email_repair_operations%rowtype;
  v_user public.users%rowtype;
begin
  if not exists(select 1 from public.staff_users s where s.id=p_actor_staff_id
                and s.role='admin' and s.is_active) then
    raise exception 'ACCOUNT_REPAIR_ADMIN_REQUIRED' using errcode='42501';
  end if;
  select * into v_op from public.account_activation_email_repair_operations where id=p_operation_id for update;
  if not found then return jsonb_build_object('state','blocked','reason','operation_missing'); end if;
  if v_op.state='completed' then return jsonb_build_object('state','completed'); end if;
  perform pg_advisory_xact_lock(hashtextextended('account-email-repair:'||v_op.public_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('movi-auth-email:'||v_op.new_email,0));
  select * into v_user from public.users where id=v_op.public_user_id for update;
  if v_user.identity_status<>'active' or v_user.auth_user_id is not null
     or v_user.auth_migration_state<>'review_required'
     or public.normalize_user_email(v_user.email)<>public.normalize_user_email(v_op.old_email)
     or exists(select 1 from auth.users where id=v_op.old_auth_user_id)
     or exists(select 1 from public.user_auth_onboarding where auth_user_id=v_op.old_auth_user_id)
     or public.account_activation_repair_email_conflict(v_op.public_user_id,v_op.old_auth_user_id,v_op.new_email) then
    return jsonb_build_object('state','blocked','reason','finalization_conflict');
  end if;
  update public.users set email=v_op.new_email,auth_migration_state='legacy',updated_at=now()
    where id=v_op.public_user_id;
  update public.account_activation_email_repair_operations
    set state='completed',completed_at=now() where id=p_operation_id;
  insert into public.account_activation_email_repair_events(
    operation_id,actor_staff_id,public_user_id,old_auth_user_id,event_type,old_email,new_email,
    previous_auth_state,resulting_auth_state,previous_onboarding_state,resulting_onboarding_state,
    previous_migration_state,resulting_migration_state,reason)
  values(v_op.id,p_actor_staff_id,v_op.public_user_id,v_op.old_auth_user_id,
    'ACCOUNT_ACTIVATION_EMAIL_CORRECTED',v_op.old_email,v_op.new_email,
    'unconfirmed','removed','pending_verification','removed',
    'activation_pending','legacy',v_op.reason);
  return jsonb_build_object('state','completed');
end $$;

revoke all on function public.guard_account_activation_email_repair_link() from public,anon,authenticated;
revoke all on function public.account_activation_repair_email_conflict(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.admin_prepare_incomplete_activation_email_repair(uuid,uuid,text,text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.admin_incomplete_activation_repair_deletion_ready(uuid) from public,anon,authenticated;
revoke all on function public.admin_cancel_incomplete_activation_email_repair(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_finish_incomplete_activation_email_repair(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_prepare_incomplete_activation_email_repair(uuid,uuid,text,text,uuid,boolean) to service_role;
grant execute on function public.admin_incomplete_activation_repair_deletion_ready(uuid) to service_role;
grant execute on function public.admin_cancel_incomplete_activation_email_repair(uuid,uuid) to service_role;
grant execute on function public.admin_finish_incomplete_activation_email_repair(uuid,uuid) to service_role;
