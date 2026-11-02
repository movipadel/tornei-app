begin;

create table public.user_media_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  scope text not null check (scope='recognizable_image_video_social_promotional'),
  status text not null check (status in ('granted','not_granted','revoked')),
  effective_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('signup','profile','admin_assisted','paper_import')),
  actor_user_id uuid references public.users(id),
  actor_staff_id uuid references public.staff_users(id),
  policy_version text not null check (btrim(policy_version)<>''),
  evidence_reference text,
  notes text,
  created_at timestamptz not null default clock_timestamp(),
  check ((actor_user_id is null) <> (actor_staff_id is null)),
  check (status<>'granted' or source not in ('admin_assisted','paper_import') or
    nullif(btrim(coalesce(evidence_reference,'')),'') is not null or nullif(btrim(coalesce(notes,'')),'') is not null)
);
create index user_media_consent_events_current_idx
  on public.user_media_consent_events(user_id,scope,effective_at desc,id desc);
alter table public.user_media_consent_events enable row level security;
revoke all on public.user_media_consent_events from public,anon,authenticated;
grant select,insert on public.user_media_consent_events to service_role;

create function public.prevent_media_consent_event_change()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'MEDIA_CONSENT_APPEND_ONLY' using errcode='23514'; end; $$;
create trigger user_media_consent_events_no_update_delete
before update or delete on public.user_media_consent_events
for each row execute function public.prevent_media_consent_event_change();

-- Source users remain in the merge ledger. Their events stay immutable and are
-- included when the canonical account's current consent is read.
create function public.current_user_media_consent(p_user_id uuid)
returns table(status text,effective_at timestamptz,source text,event_id uuid)
language sql stable security definer set search_path=pg_catalog,public as $$
  with recursive lineage(id) as (
    select p_user_id union all
    select u.id from public.users u join lineage l on u.merged_into_user_id=l.id
  )
  select e.status,e.effective_at,e.source,e.id
    from public.user_media_consent_events e
    join lineage l on l.id=e.user_id
   where e.scope='recognizable_image_video_social_promotional'
   order by e.effective_at desc,e.id desc limit 1;
$$;

create function public.record_user_media_consent(
  p_user_id uuid,p_status text,p_source text,p_actor_user_id uuid,
  p_actor_staff_id uuid,p_policy_version text,p_evidence_reference text default null,p_notes text default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid; v_user public.users%rowtype;
begin
  select * into v_user from public.users where id=p_user_id for update;
  if not found or v_user.identity_status<>'active' then raise exception 'MEDIA_CONSENT_USER_INVALID' using errcode='22023'; end if;
  if p_status not in ('granted','not_granted','revoked') then raise exception 'MEDIA_CONSENT_STATUS_INVALID' using errcode='22023'; end if;
  if p_source in ('signup','profile') then
    if p_actor_user_id is distinct from p_user_id or p_actor_staff_id is not null then
      raise exception 'MEDIA_CONSENT_ACTOR_INVALID' using errcode='42501'; end if;
  elsif p_source in ('admin_assisted','paper_import') then
    if p_actor_user_id is not null or p_actor_staff_id is null or not exists
      (select 1 from public.staff_users where id=p_actor_staff_id and role='admin' and is_active) then
      raise exception 'MEDIA_CONSENT_ACTOR_INVALID' using errcode='42501'; end if;
  else raise exception 'MEDIA_CONSENT_SOURCE_INVALID' using errcode='22023'; end if;
  if p_status='granted' and v_user.age_confirmed_at is null then
    raise exception 'MEDIA_CONSENT_ADULT_CONFIRMATION_REQUIRED' using errcode='22023'; end if;
  if p_status='granted' and p_source in ('admin_assisted','paper_import') and
     nullif(btrim(coalesce(p_evidence_reference,'')),'') is null and nullif(btrim(coalesce(p_notes,'')),'') is null then
    raise exception 'MEDIA_CONSENT_EVIDENCE_REQUIRED' using errcode='22023'; end if;
  insert into public.user_media_consent_events(user_id,scope,status,source,actor_user_id,actor_staff_id,policy_version,evidence_reference,notes)
    values(p_user_id,'recognizable_image_video_social_promotional',p_status,p_source,p_actor_user_id,p_actor_staff_id,
      p_policy_version,nullif(btrim(coalesce(p_evidence_reference,'')),''),nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_id;
  return v_id;
end; $$;

revoke all on function public.current_user_media_consent(uuid) from public,anon,authenticated;
grant execute on function public.current_user_media_consent(uuid) to service_role;

create view public.user_media_consent_current with (security_invoker=true) as
  with recursive lineage(id,root_id) as (
    select id,id from public.users where merged_into_user_id is null
    union all
    select u.id,l.root_id from public.users u join lineage l on u.merged_into_user_id=l.id
  )
  select distinct on (l.root_id)
    l.root_id as user_id,e.status,e.effective_at,e.source,e.id as event_id
  from public.user_media_consent_events e
  join lineage l on l.id=e.user_id
  where e.scope='recognizable_image_video_social_promotional'
  order by l.root_id,e.effective_at desc,e.id desc;
revoke all on public.user_media_consent_current from public,anon,authenticated;
grant select on public.user_media_consent_current to service_role;
revoke all on function public.record_user_media_consent(uuid,text,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_user_media_consent(uuid,text,text,uuid,uuid,text,text,text) to service_role;

-- Signup intent is separate from an Auth draft and can be consumed only after
-- the canonical public.users row exists. It contains no marketing semantics.
create table public.user_media_signup_intents (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  grant_requested boolean not null,
  created_at timestamptz not null default now()
);
alter table public.user_media_signup_intents enable row level security;
revoke all on public.user_media_signup_intents from public,anon,authenticated;
grant select,insert,update,delete on public.user_media_signup_intents to service_role;

create function public.consume_user_media_signup_intent(p_auth_user_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_intent public.user_media_signup_intents%rowtype; v_user_id uuid;
begin
  select * into v_intent from public.user_media_signup_intents where auth_user_id=p_auth_user_id for update;
  if not found then return false; end if;
  select id into v_user_id from public.users where auth_user_id=p_auth_user_id and identity_status='active';
  if v_user_id is null then raise exception 'MEDIA_CONSENT_PROFILE_NOT_LINKED' using errcode='22023'; end if;
  if v_intent.grant_requested then
    perform public.record_user_media_consent(v_user_id,'granted','signup',v_user_id,null,'v1');
  end if;
  delete from public.user_media_signup_intents where auth_user_id=p_auth_user_id;
  return v_intent.grant_requested;
end; $$;
revoke all on function public.consume_user_media_signup_intent(uuid) from public,anon,authenticated;
grant execute on function public.consume_user_media_signup_intent(uuid) to service_role;

-- Merge previews must become stale if consent history changes before execution.
create or replace function public.user_merge_fingerprint(p_source_user_id uuid,p_canonical_user_id uuid)
returns text language sql stable security definer set search_path=pg_catalog,public as $$
  select md5(jsonb_build_object(
    'source',jsonb_build_object('id',s.id,'updated_at',s.updated_at,'auth',s.auth_user_id,'status',s.identity_status),
    'canonical',jsonb_build_object('id',c.id,'updated_at',c.updated_at,'auth',c.auth_user_id,'status',c.identity_status),
    'counts',jsonb_build_object(
      'idem',(select count(*) from public.business_operation_idempotency x where x.user_id in(s.id,c.id)),
      'comm_state',(select count(*) from public.communication_user_states x where x.user_id in(s.id,c.id)),
      'communications',(select count(*) from public.communications x where x.recipient_user_id in(s.id,c.id)),
      'roster',(select count(*) from public.league_team_players x where x.user_id in(s.id,c.id)),
      'league_notifications',(select count(*) from public.league_notification_events x where x.recipient_user_id in(s.id,c.id)),
      'memberships',(select count(*) from public.loyalty_memberships x where x.user_id in(s.id,c.id)),
      'medical',(select count(*) from public.medical_certificates x where x.user_id in(s.id,c.id)),
      'media_consent',(select count(*) from public.user_media_consent_events x where x.user_id in(s.id,c.id)),
      'orders',(select count(*) from public.store_orders x where x.user_id in(s.id,c.id)),
      'registrations',(select count(*) from public.tournament_registrations x where x.user_id in(s.id,c.id)),
      'participants',(select count(*) from public.tournament_run_participants x where x.user_id in(s.id,c.id))
    ),
    'conflict_keys',jsonb_build_object(
      'same_team',(select count(*) from public.league_team_players a join public.league_team_players b on b.team_id=a.team_id where a.user_id=s.id and b.user_id=c.id),
      'same_tournament',(select count(*) from public.tournament_registrations a join public.tournament_registrations b on b.tournament_id=a.tournament_id where a.user_id=s.id and b.user_id=c.id),
      'same_run',(select count(*) from public.tournament_run_participants a join public.tournament_run_participants b on b.run_id=a.run_id where a.user_id=s.id and b.user_id=c.id),
      'idempotency_divergence',(select count(*) from public.business_operation_idempotency a join public.business_operation_idempotency b
        on b.operation=a.operation and b.idempotency_key=a.idempotency_key where a.user_id=s.id and b.user_id=c.id
          and (a.request_hash,a.status,coalesce(a.result,'{}'::jsonb)) is distinct from
              (b.request_hash,b.status,coalesce(b.result,'{}'::jsonb))),
      'alias_relationships',(select count(*) from public.user_identity_aliases where source_user_id in(s.id,c.id) or canonical_user_id=s.id)
    )
  )::text)
  from public.users s cross join public.users c
  where s.id=p_source_user_id and c.id=p_canonical_user_id;
$$;

commit;
