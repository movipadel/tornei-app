begin;

create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), endpoint text not null unique,
 p256dh text not null, auth text not null,
 public_user_id uuid references public.users(id) on delete cascade,
 staff_user_id uuid references public.staff_users(id) on delete cascade,
 is_active boolean not null default true, revoked_at timestamptz,
 last_seen_at timestamptz, user_agent text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint push_subscription_owner check(num_nonnulls(public_user_id,staff_user_id)=1),
 constraint push_subscription_revocation check(not is_active or revoked_at is null),
 constraint push_endpoint_shape check(length(endpoint)<=2048 and endpoint like 'https://%'),
 constraint push_keys_shape check(length(p256dh) between 86 and 88 and length(auth) between 22 and 24)
);
create index push_public_owner_idx on public.push_subscriptions(public_user_id) where is_active;
create index push_staff_owner_idx on public.push_subscriptions(staff_user_id) where is_active;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.push_subscriptions to service_role;

-- Authorized re-enrollment cutover: retain history, never infer ownership.
update public.admin_push_subscriptions
set is_active = false, updated_at = now()
where is_active = true;
comment on table public.admin_push_subscriptions is 'Deprecated: disabled by Foundation cutover. Audit history only; never reactivate, copy endpoints or infer ownership. Explicit canonical re-enrollment required.';

alter table public.user_notification_preferences add column transactional_push_enabled boolean not null default false;
create table public.staff_notification_responsibilities (
 staff_user_id uuid not null references public.staff_users(id) on delete cascade,
 responsibility_key text not null check(responsibility_key in ('requests_gioca','requests_allenati','moviback','store')),
 is_active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(staff_user_id,responsibility_key)
);
alter table public.staff_notification_responsibilities enable row level security;
revoke all on public.staff_notification_responsibilities from public,anon,authenticated;
grant select,insert,update,delete on public.staff_notification_responsibilities to service_role;

-- Existing events remain customer/email-only. This adds no business producer.
alter table public.notification_events alter column recipient_user_id drop not null;
alter table public.notification_events add column recipient_staff_user_id uuid references public.staff_users(id) on delete cascade;
alter table public.notification_events add constraint notification_event_owner check(num_nonnulls(recipient_user_id,recipient_staff_user_id)=1);
alter table public.notification_deliveries drop constraint notification_deliveries_channel_check;
alter table public.notification_deliveries add constraint notification_deliveries_channel_check check(channel in ('email','push'));
alter table public.notification_deliveries drop constraint notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check check(status in ('pending','processing','retry','delivered','accepted','skipped','failed'));
alter table public.notification_deliveries add constraint notification_delivery_channel_status check(status<>'accepted' or channel='push');

create table public.push_delivery_targets (
 id uuid primary key default gen_random_uuid(),
 delivery_id uuid not null references public.notification_deliveries(id) on delete cascade,
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','processing','retry','accepted','failed','skipped')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 next_attempt_at timestamptz,locked_at timestamptz,locked_by text,
 provider_accepted_at timestamptz,error_code text,error_message text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(delivery_id,subscription_id),
 check((status='accepted')=(provider_accepted_at is not null))
);
alter table public.push_delivery_targets enable row level security;
revoke all on public.push_delivery_targets from public,anon,authenticated;
grant select,insert,update,delete on public.push_delivery_targets to service_role;
create index push_targets_due_idx on public.push_delivery_targets(delivery_id,status,next_attempt_at);

-- Atomic same-owner upsert: endpoint knowledge never transfers ownership, even if revoked.
create function public.manage_push_subscription(p_action text,p_endpoint text,p_public_user_id uuid,p_staff_user_id uuid,p_p256dh text default null,p_auth text default null,p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.push_subscriptions%rowtype;
begin
 if num_nonnulls(p_public_user_id,p_staff_user_id)<>1 or p_action not in ('subscribe','revoke','status') then raise exception 'PUSH_INVALID'; end if;
 if p_public_user_id is not null then
  perform 1 from public.users where id=p_public_user_id and identity_status='active' for update;
 else
  perform 1 from public.staff_users where id=p_staff_user_id and is_active for update;
 end if;
 if not found then raise exception 'PUSH_IDENTITY_INELIGIBLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('push:'||p_endpoint,0));
 select * into s from public.push_subscriptions where endpoint=p_endpoint for update;
 if s.id is not null and (s.public_user_id is distinct from p_public_user_id or s.staff_user_id is distinct from p_staff_user_id) then
  return jsonb_build_object('state','ownership_conflict');
 end if;
 if p_action='status' then return jsonb_build_object('state',case when s.is_active then 'active' else 'inactive' end,'id',s.id); end if;
 if p_action='revoke' then
  update public.push_subscriptions set is_active=false,revoked_at=now(),updated_at=now() where id=s.id;
  return jsonb_build_object('state','inactive');
 end if;
 insert into public.push_subscriptions(endpoint,p256dh,auth,public_user_id,staff_user_id,user_agent,last_seen_at)
 values(p_endpoint,p_p256dh,p_auth,p_public_user_id,p_staff_user_id,left(p_user_agent,512),now())
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,is_active=true,revoked_at=null,last_seen_at=now(),updated_at=now(),user_agent=excluded.user_agent returning id into s.id;
 return jsonb_build_object('state','active','id',s.id);
end $$;

-- Merge is part of the same transaction as the existing canonical merge engine.
-- Endpoint uniqueness means conflicting duplicate rows cannot exist, even across owners.
create function public.merge_owned_push_subscriptions() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.identity_status='merged' and old.identity_status is distinct from 'merged' then
  perform 1 from public.users where id=new.merged_into_user_id and identity_status='active' for update;
  if not found then raise exception 'PUSH_MERGE_CANONICAL_INVALID'; end if;
  update public.push_subscriptions set public_user_id=new.merged_into_user_id,updated_at=now() where public_user_id=new.id;
  -- Pending old-recipient deliveries are skipped by eligibility; do not replay historical events.
 end if;
 return new;
end $$;
create trigger users_merge_owned_push after update of identity_status,merged_into_user_id on public.users for each row execute function public.merge_owned_push_subscriptions();

create or replace function public.claim_notification_deliveries(p_worker_id text,p_limit integer default 25)
returns table(delivery_id uuid,event_id uuid,event_type text,domain text,recipient_user_id uuid,payload jsonb,attempts integer)
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 if p_worker_id is null or btrim(p_worker_id)='' or p_limit<1 or p_limit>100 then raise exception 'NOTIFICATION_CLAIM_INVALID'; end if;
 return query with candidates as (
 select d.id from public.notification_deliveries d where d.channel='email' and ((d.status in ('pending','retry') and coalesce(d.next_attempt_at,d.created_at)<=now()) or (d.status='processing' and d.locked_at<now()-interval '15 minutes')) and d.attempts<5
 order by coalesce(d.next_attempt_at,d.created_at),d.id for update skip locked limit p_limit
 ), claimed as (
 update public.notification_deliveries d set status='processing',attempts=d.attempts+1,locked_at=now(),locked_by=p_worker_id,updated_at=now() from candidates c where d.id=c.id returning d.id,d.event_id,d.attempts
 ) select c.id,c.event_id,e.event_type,e.domain,e.recipient_user_id,e.payload,c.attempts from claimed c join public.notification_events e on e.id=c.event_id;
end $$;

-- Future pilot must explicitly opt in by calling this hook; existing enqueue stays unchanged.
create function public.enqueue_push_delivery(p_event_id uuid,p_enabled boolean default false) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
 if not p_enabled then return null; end if;
 insert into public.notification_deliveries(event_id,channel,next_attempt_at) values(p_event_id,'push',now()) on conflict(event_id,channel) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.notification_deliveries where event_id=p_event_id and channel='push'; end if;
 return v_id;
end $$;

create function public.push_subscription_eligible(p_subscription_id uuid,p_event_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.push_subscriptions s join public.notification_events e on e.id=p_event_id
 where s.id=p_subscription_id and s.is_active and s.revoked_at is null and (
 (s.public_user_id=e.recipient_user_id and exists(select 1 from public.users u join public.user_notification_preferences p on p.user_id=u.id where u.id=s.public_user_id and u.identity_status='active' and p.transactional_push_enabled))
 or (s.staff_user_id=e.recipient_staff_user_id and exists(select 1 from public.staff_users u where u.id=s.staff_user_id and u.is_active and (
 (u.role='admin' and e.payload->>'responsibility_key'='admin') or exists(
 select 1 from public.staff_notification_responsibilities r where r.staff_user_id=u.id and r.is_active and r.responsibility_key=e.payload->>'responsibility_key'
 and public.operator_has_permission(u.id,case r.responsibility_key when 'requests_gioca' then 'requests.manage' when 'requests_allenati' then 'requests.manage' when 'moviback' then 'moviback.manage' when 'store' then 'store.manage' end)
 ))))));
$$;

create function public.claim_push_deliveries(p_worker_id text,p_limit integer default 25) returns setof public.notification_deliveries language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if coalesce(btrim(p_worker_id),'')='' or p_limit not between 1 and 100 then raise exception 'PUSH_CLAIM_INVALID'; end if;
 return query with candidates as (
 select id from public.notification_deliveries where channel='push' and ((status in ('pending','retry') and coalesce(next_attempt_at,created_at)<=now()) or (status='processing' and locked_at<now()-interval '15 minutes')) order by created_at,id for update skip locked limit p_limit
 ) update public.notification_deliveries d set status='processing',attempts=least(d.attempts+1,5),locked_at=now(),locked_by=p_worker_id,updated_at=now() from candidates c where d.id=c.id returning d.*;
end $$;

create function public.claim_push_targets(p_delivery_id uuid,p_worker_id text) returns setof public.push_delivery_targets language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.notification_deliveries%rowtype;
begin
 select * into d from public.notification_deliveries where id=p_delivery_id and channel='push' and status='processing' and locked_by=p_worker_id for update;
 if d.id is null then raise exception 'PUSH_LOCK_LOST'; end if;
 -- Freeze fan-out on first claim. New devices must not receive old notifications.
 if not exists(select 1 from public.push_delivery_targets where delivery_id=d.id) then
 insert into public.push_delivery_targets(delivery_id,subscription_id,next_attempt_at)
 select d.id,s.id,now() from public.push_subscriptions s where public.push_subscription_eligible(s.id,d.event_id) on conflict do nothing;
 end if;
 update public.push_delivery_targets t set status='skipped',error_code='recipient_ineligible',locked_at=null,locked_by=null,updated_at=now()
 where t.delivery_id=d.id and t.status in ('pending','retry','processing') and not public.push_subscription_eligible(t.subscription_id,d.event_id);
 update public.push_delivery_targets set status='failed',error_code='attempts_exhausted',locked_at=null,locked_by=null,updated_at=now()
 where delivery_id=d.id and status='processing' and attempts>=5 and locked_at<now()-interval '15 minutes';
 return query update public.push_delivery_targets t set status='processing',attempts=t.attempts+1,locked_at=now(),locked_by=p_worker_id,updated_at=now()
 where t.delivery_id=d.id and t.attempts<5 and ((t.status in ('pending','retry') and coalesce(t.next_attempt_at,t.created_at)<=now()) or (t.status='processing' and t.locked_at<now()-interval '15 minutes')) returning t.*;
end $$;

create function public.finish_push_target(p_target_id uuid,p_worker_id text,p_status text,p_error_code text default null,p_stale boolean default false) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.push_delivery_targets%rowtype;
begin
 select * into t from public.push_delivery_targets where id=p_target_id and status='processing' and locked_by=p_worker_id for update;
 if t.id is null then raise exception 'PUSH_TARGET_LOCK_LOST'; end if;
 perform 1 from public.notification_deliveries where id=t.delivery_id and channel='push' and status='processing' and locked_by=p_worker_id for update;
 if not found then raise exception 'PUSH_LOCK_LOST'; end if;
 if p_status not in ('accepted','retry','failed','skipped') or (p_stale and p_status<>'failed') then raise exception 'PUSH_RESULT_INVALID'; end if;
 if p_stale then
 update public.push_subscriptions set is_active=false,revoked_at=now(),updated_at=now() where id=t.subscription_id;
 if not found then raise exception 'PUSH_STALE_UPDATE_FAILED'; end if;
 end if;
 update public.push_delivery_targets set status=case when p_status='retry' and t.attempts>=5 then 'failed' else p_status end,
 provider_accepted_at=case when p_status='accepted' then now() else null end,
 next_attempt_at=case when p_status='retry' and t.attempts<5 then now()+make_interval(mins=> (array[5,30,120,360])[t.attempts]) else null end,
 error_code=left(p_error_code,120),error_message=case when p_error_code is not null then 'Push transport outcome; no provider payload stored' else null end,
 locked_at=null,locked_by=null,updated_at=now() where id=t.id;
end $$;

create function public.finish_push_delivery(p_delivery_id uuid,p_worker_id text) returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_status text; v_next timestamptz;
begin
 perform 1 from public.notification_deliveries where id=p_delivery_id and channel='push' and status='processing' and locked_by=p_worker_id for update;
 if not found then raise exception 'PUSH_LOCK_LOST'; end if;
 select case when count(*) filter(where status in ('pending','retry','processing'))>0 then 'retry' when count(*) filter(where status='failed')>0 then 'failed' when count(*) filter(where status='accepted')>0 then 'accepted' else 'skipped' end,
 min(coalesce(next_attempt_at,locked_at+interval '15 minutes',now())) filter(where status in ('pending','retry','processing')) into v_status,v_next
 from public.push_delivery_targets where delivery_id=p_delivery_id;
 update public.notification_deliveries set status=v_status,next_attempt_at=v_next,locked_at=null,locked_by=null,updated_at=now(),last_error_code=case when v_status='failed' then 'push_target_failure' else null end where id=p_delivery_id;
 return v_status;
end $$;

-- Explicit function ACLs, including functions callable through PostgREST.
revoke all on function public.manage_push_subscription(text,text,uuid,uuid,text,text,text),public.merge_owned_push_subscriptions(),public.enqueue_push_delivery(uuid,boolean),public.push_subscription_eligible(uuid,uuid),public.claim_push_deliveries(text,integer),public.claim_push_targets(uuid,text),public.finish_push_target(uuid,text,text,text,boolean),public.finish_push_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.manage_push_subscription(text,text,uuid,uuid,text,text,text),public.enqueue_push_delivery(uuid,boolean),public.push_subscription_eligible(uuid,uuid),public.claim_push_deliveries(text,integer),public.claim_push_targets(uuid,text),public.finish_push_target(uuid,text,text,text,boolean),public.finish_push_delivery(uuid,text) to service_role;
commit;
