begin;
-- Refuse to guess how pre-existing category assignments map to individual events.
do $$ begin if exists(select 1 from public.staff_notification_responsibilities) then raise exception 'STAFF_ROUTING_REQUIRES_EMPTY_CATEGORY_RULES'; end if; end $$;
alter table public.staff_notification_responsibilities drop constraint staff_notification_responsibilities_responsibility_key_check;
alter table public.staff_notification_responsibilities rename column responsibility_key to event_key;
alter table public.staff_notification_responsibilities add constraint staff_push_event_key_valid check(event_key in (
 'requests.gioca.received','requests.allenati.received','moviback.membership.requested','moviback.reward.requested','store.order.received','tournament.registration.created','tournament.reserve.created','tournament.registration.cancelled','tournament.reserve.promoted'));

create function public.resolve_staff_push_recipients(p_event_key text) returns table(staff_user_id uuid)
language sql stable security definer set search_path=pg_catalog,public as $$
 select r.staff_user_id from public.staff_notification_responsibilities r join public.staff_users s on s.id=r.staff_user_id
 where r.event_key=p_event_key and r.is_active and s.is_active and s.role in ('admin','staff') order by r.staff_user_id;
$$;

create function public.admin_set_staff_push_rules(p_actor uuid,p_staff_user_id uuid,p_event_keys text[]) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform 1 from public.staff_users where id=p_actor and is_active and role='admin' for update;
 if not found then raise exception 'STAFF_PUSH_FORBIDDEN'; end if;
 perform 1 from public.staff_users where id=p_staff_user_id and role in ('admin','staff') and (is_active or cardinality(p_event_keys)=0) for update;
 if not found or p_event_keys is null then raise exception 'STAFF_PUSH_INVALID_RECIPIENT'; end if;
 if exists(select 1 from unnest(p_event_keys) k where k is null or k not in ('requests.gioca.received','requests.allenati.received','moviback.membership.requested','moviback.reward.requested','store.order.received','tournament.registration.created','tournament.reserve.created','tournament.registration.cancelled','tournament.reserve.promoted')) then raise exception 'STAFF_PUSH_INVALID_EVENT'; end if;
 update public.staff_notification_responsibilities set is_active=false,updated_at=now() where staff_user_id=p_staff_user_id and is_active;
 insert into public.staff_notification_responsibilities(staff_user_id,event_key,is_active)
 select p_staff_user_id,k,true from (select distinct unnest(p_event_keys) k) keys
 on conflict(staff_user_id,event_key) do update set is_active=true,updated_at=now();
end $$;

create function public.enqueue_staff_push_event(p_event_key text,p_aggregate_id text,p_domain text,p_display jsonb) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare recipient uuid; event_id uuid; delivery_id uuid; total integer:=0;
begin
 if p_event_key not in ('requests.gioca.received','requests.allenati.received','moviback.membership.requested','moviback.reward.requested','store.order.received','tournament.registration.created','tournament.reserve.created','tournament.registration.cancelled','tournament.reserve.promoted') or p_event_key is null or coalesce(btrim(p_aggregate_id),'')='' or length(p_aggregate_id)>200 then raise exception 'STAFF_PUSH_INVALID_EVENT'; end if;
 if p_display->>'url' not in ('/admin/requests','/admin/moviback/requests','/admin/moviback','/admin/store-orders','/admin/tournaments') or p_display->>'url' is null then raise exception 'STAFF_PUSH_INVALID_URL'; end if;
 for recipient in select staff_user_id from public.resolve_staff_push_recipients(p_event_key) loop
  event_id:=null;
  insert into public.notification_events(event_type,domain,aggregate_type,aggregate_id,recipient_staff_user_id,idempotency_key,payload)
  values(p_event_key,p_domain,'staff_operation',p_aggregate_id,recipient,'staff-push:'||p_event_key||':'||p_aggregate_id||':'||recipient,jsonb_build_object('push',p_display))
  on conflict(idempotency_key) do nothing returning id into event_id;
  if event_id is not null then
   insert into public.notification_deliveries(event_id,channel,status,last_error_code)
   values(event_id,'push',case when exists(select 1 from public.push_subscriptions where staff_user_id=recipient and is_active and revoked_at is null) then 'pending' else 'skipped' end,
   case when not exists(select 1 from public.push_subscriptions where staff_user_id=recipient and is_active and revoked_at is null) then 'no_active_subscription' end) returning id into delivery_id;
   total:=total+1;
  end if;
 end loop;
 return total;
end $$;

create or replace function public.push_subscription_eligible(p_subscription_id uuid,p_event_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.push_subscriptions s join public.notification_events e on e.id=p_event_id where s.id=p_subscription_id and s.is_active and s.revoked_at is null and (
 (s.public_user_id=e.recipient_user_id and exists(select 1 from public.users u join public.user_notification_preferences p on p.user_id=u.id where u.id=s.public_user_id and u.identity_status='active' and p.transactional_push_enabled))
 or (s.staff_user_id=e.recipient_staff_user_id and exists(select 1 from public.resolve_staff_push_recipients(e.event_type) r where r.staff_user_id=s.staff_user_id))));
$$;
revoke all on function public.resolve_staff_push_recipients(text),public.admin_set_staff_push_rules(uuid,uuid,text[]),public.enqueue_staff_push_event(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.resolve_staff_push_recipients(text),public.admin_set_staff_push_rules(uuid,uuid,text[]),public.enqueue_staff_push_event(text,text,text,jsonb) to service_role;
commit;
