-- MOVI Auth 2.0 final prerelease remediation.
-- M-02: bounded duplicate-dashboard reference counts.
-- M-03: durable, privacy-preserving legacy-login throttling.

create function public.duplicate_user_reference_counts(p_user_ids uuid[])
returns table(user_id uuid, reference_counts jsonb)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with requested as (
    select distinct value as user_id
    from unnest(coalesce(p_user_ids, array[]::uuid[])) as input(value)
    limit 1000
  ), domain_counts as (
    select s.user_id, 'communications'::text as label, count(*)::bigint as total
      from public.communication_user_states s join requested r on r.user_id=s.user_id group by s.user_id
    union all
    select s.actor_user_id, 'league_audit_events', count(*)::bigint
      from public.league_audit_events s join requested r on r.user_id=s.actor_user_id group by s.actor_user_id
    union all
    select s.submitted_by_user_id, 'lineups_submitted', count(*)::bigint
      from public.league_lineups s join requested r on r.user_id=s.submitted_by_user_id group by s.submitted_by_user_id
    union all
    select s.opened_by_user_id, 'contests_opened', count(*)::bigint
      from public.league_result_contests s join requested r on r.user_id=s.opened_by_user_id group by s.opened_by_user_id
    union all
    select s.submitted_by_user_id, 'results_submitted', count(*)::bigint
      from public.league_result_submissions s join requested r on r.user_id=s.submitted_by_user_id group by s.submitted_by_user_id
    union all
    select s.user_id, 'league_rosters', count(*)::bigint
      from public.league_team_players s join requested r on r.user_id=s.user_id group by s.user_id
    union all
    select s.user_id, 'moviback_memberships', count(*)::bigint
      from public.loyalty_memberships s join requested r on r.user_id=s.user_id group by s.user_id
    union all
    select s.user_id, 'medical_certificates', count(*)::bigint
      from public.medical_certificates s join requested r on r.user_id=s.user_id group by s.user_id
    union all
    select s.user_id, 'store_orders', count(*)::bigint
      from public.store_orders s join requested r on r.user_id=s.user_id group by s.user_id
    union all
    select s.user_id, 'open_store_orders', count(*)::bigint
      from public.store_orders s join requested r on r.user_id=s.user_id
     where s.status not in ('delivered','cancelled') group by s.user_id
    union all
    select s.user_id, 'tournament_registrations', count(*)::bigint
      from public.tournament_registrations s join requested r on r.user_id=s.user_id group by s.user_id
    union all
    select s.user_id, 'tournament_participants', count(*)::bigint
      from public.tournament_run_participants s join requested r on r.user_id=s.user_id group by s.user_id
  )
  select r.user_id,
    jsonb_build_object(
      'communications', coalesce(sum(d.total) filter (where d.label='communications'),0),
      'league_audit_events', coalesce(sum(d.total) filter (where d.label='league_audit_events'),0),
      'lineups_submitted', coalesce(sum(d.total) filter (where d.label='lineups_submitted'),0),
      'contests_opened', coalesce(sum(d.total) filter (where d.label='contests_opened'),0),
      'results_submitted', coalesce(sum(d.total) filter (where d.label='results_submitted'),0),
      'league_rosters', coalesce(sum(d.total) filter (where d.label='league_rosters'),0),
      'moviback_memberships', coalesce(sum(d.total) filter (where d.label='moviback_memberships'),0),
      'medical_certificates', coalesce(sum(d.total) filter (where d.label='medical_certificates'),0),
      'store_orders', coalesce(sum(d.total) filter (where d.label='store_orders'),0),
      'open_store_orders', coalesce(sum(d.total) filter (where d.label='open_store_orders'),0),
      'tournament_registrations', coalesce(sum(d.total) filter (where d.label='tournament_registrations'),0),
      'tournament_participants', coalesce(sum(d.total) filter (where d.label='tournament_participants'),0)
    ) as reference_counts
  from requested r
  left join domain_counts d on d.user_id=r.user_id
  group by r.user_id;
$$;

revoke all on function public.duplicate_user_reference_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.duplicate_user_reference_counts(uuid[]) to service_role;

comment on function public.duplicate_user_reference_counts(uuid[]) is
  'Bounded Stage 4 queue aggregation. One set-based RPC replaces per-user/per-domain count requests.';

create table public.legacy_login_rate_limits (
  bucket_key text primary key check (bucket_key ~ '^[0-9a-f]{64}$'),
  bucket_scope text not null check (bucket_scope in ('client','client_identity')),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  updated_at timestamptz not null default now()
);

create index legacy_login_rate_limits_window_idx
  on public.legacy_login_rate_limits(window_started_at);

alter table public.legacy_login_rate_limits enable row level security;
revoke all on table public.legacy_login_rate_limits from public, anon, authenticated, service_role;

create function public.consume_legacy_login_rate_limit(
  p_client_key text,
  p_identity_key text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window constant interval := interval '15 minutes';
  v_client_limit constant integer := 30;
  v_identity_limit constant integer := 8;
  v_client_count integer;
  v_identity_count integer;
  v_client_start timestamptz;
  v_identity_start timestamptz;
  v_allowed boolean;
  v_retry_after integer := 0;
begin
  if p_client_key !~ '^[0-9a-f]{64}$'
     or p_identity_key !~ '^[0-9a-f]{64}$'
     or p_client_key = p_identity_key then
    raise exception 'MOVI_AUTH_INVALID_RATE_LIMIT_KEY' using errcode='22023';
  end if;

  -- Stable lock ordering makes threshold decisions atomic across workers.
  perform pg_advisory_xact_lock(hashtextextended('movi-legacy-rate:' || least(p_client_key,p_identity_key),0));
  perform pg_advisory_xact_lock(hashtextextended('movi-legacy-rate:' || greatest(p_client_key,p_identity_key),0));

  insert into public.legacy_login_rate_limits as bucket(
    bucket_key,bucket_scope,window_started_at,attempt_count,updated_at
  ) values(p_client_key,'client',p_now,1,p_now)
  on conflict(bucket_key) do update set
    bucket_scope='client',
    window_started_at=case when bucket.window_started_at <= p_now-v_window then p_now else bucket.window_started_at end,
    attempt_count=case when bucket.window_started_at <= p_now-v_window then 1 else bucket.attempt_count+1 end,
    updated_at=p_now
  returning attempt_count,window_started_at into v_client_count,v_client_start;

  insert into public.legacy_login_rate_limits as bucket(
    bucket_key,bucket_scope,window_started_at,attempt_count,updated_at
  ) values(p_identity_key,'client_identity',p_now,1,p_now)
  on conflict(bucket_key) do update set
    bucket_scope='client_identity',
    window_started_at=case when bucket.window_started_at <= p_now-v_window then p_now else bucket.window_started_at end,
    attempt_count=case when bucket.window_started_at <= p_now-v_window then 1 else bucket.attempt_count+1 end,
    updated_at=p_now
  returning attempt_count,window_started_at into v_identity_count,v_identity_start;

  v_allowed := v_client_count <= v_client_limit and v_identity_count <= v_identity_limit;
  if not v_allowed then
    v_retry_after := greatest(1,ceil(extract(epoch from greatest(
      case when v_client_count > v_client_limit then v_client_start+v_window else p_now end,
      case when v_identity_count > v_identity_limit then v_identity_start+v_window else p_now end
    )-p_now))::integer);
  end if;

  -- Bounded opportunistic retention: no scheduler or external service required.
  delete from public.legacy_login_rate_limits
   where bucket_key in (
     select bucket_key from public.legacy_login_rate_limits
      where window_started_at < p_now-interval '1 day'
      order by window_started_at
      limit 64
   );

  return jsonb_build_object(
    'allowed',v_allowed,
    'retry_after_seconds',v_retry_after,
    'window_seconds',900,
    'client_limit',v_client_limit,
    'identity_limit',v_identity_limit,
    'client_attempts',v_client_count,
    'identity_attempts',v_identity_count
  );
end;
$$;

revoke all on function public.consume_legacy_login_rate_limit(text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.consume_legacy_login_rate_limit(text,text,timestamptz) to service_role;

comment on table public.legacy_login_rate_limits is
  'Private durable legacy-login throttling. Keys are server HMACs; no raw phone, email, IP, password, cookie or token is stored.';
comment on function public.consume_legacy_login_rate_limit(text,text,timestamptz) is
  'Atomically consumes 15-minute client and client+identity attempt buckets for Stage 5B legacy login.';
