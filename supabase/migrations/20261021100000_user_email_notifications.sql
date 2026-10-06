begin;

create table public.user_notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  transactional_email_enabled boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_notification_preferences(user_id,transactional_email_enabled)
select id,true from public.users on conflict (user_id) do nothing;

create function public.ensure_user_notification_preferences()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.user_notification_preferences(user_id) values(new.id)
  on conflict (user_id) do nothing;
  return new;
end; $$;

create trigger users_notification_preferences_default
after insert on public.users for each row
execute function public.ensure_user_notification_preferences();

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (btrim(event_type) <> ''),
  domain text not null check (domain in ('requests','tournaments','store','moviback','monday_league')),
  aggregate_type text,
  aggregate_id text,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  idempotency_key text not null unique check (btrim(idempotency_key) <> ''),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  channel text not null check (channel = 'email'),
  status text not null default 'pending' check (status in ('pending','processing','retry','delivered','skipped','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  delivered_at timestamptz,
  provider_message_id text,
  last_error_code text,
  last_error_message text,
  destination_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,channel),
  constraint notification_delivery_state_valid check (
    (status = 'delivered' and delivered_at is not null)
    or (status <> 'delivered' and delivered_at is null)
  )
);

create index notification_deliveries_due_idx
on public.notification_deliveries(status,next_attempt_at,created_at)
where status in ('pending','retry','processing');
create index notification_events_recipient_idx
on public.notification_events(recipient_user_id,created_at desc);

alter table public.user_notification_preferences enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;
revoke all on public.user_notification_preferences from public,anon,authenticated;
revoke all on public.notification_events from public,anon,authenticated;
revoke all on public.notification_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.user_notification_preferences to service_role;
grant select,insert,update,delete on public.notification_events to service_role;
grant select,insert,update,delete on public.notification_deliveries to service_role;

create function public.enqueue_user_notification(
  p_event_type text,
  p_domain text,
  p_recipient_user_id uuid,
  p_idempotency_key text,
  p_aggregate_type text default null,
  p_aggregate_id text default null,
  p_payload jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
) returns uuid language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_event_id uuid; v_enabled boolean;
begin
  if p_recipient_user_id is null then return null; end if;
  if p_domain not in ('requests','tournaments','store','moviback','monday_league') then
    raise exception 'NOTIFICATION_DOMAIN_INVALID' using errcode='22023';
  end if;
  insert into public.notification_events(event_type,domain,aggregate_type,aggregate_id,recipient_user_id,idempotency_key,payload,occurred_at)
  values(p_event_type,p_domain,p_aggregate_type,p_aggregate_id,p_recipient_user_id,p_idempotency_key,coalesce(p_payload,'{}'::jsonb),p_occurred_at)
  on conflict(idempotency_key) do nothing returning id into v_event_id;
  if v_event_id is null then
    select id into v_event_id from public.notification_events where idempotency_key=p_idempotency_key;
  end if;
  insert into public.user_notification_preferences(user_id) values(p_recipient_user_id)
  on conflict(user_id) do nothing;
  select transactional_email_enabled into v_enabled
  from public.user_notification_preferences where user_id=p_recipient_user_id;
  insert into public.notification_deliveries(event_id,channel,status,next_attempt_at,last_error_code)
  values(v_event_id,'email',case when v_enabled then 'pending' else 'skipped' end,
    case when v_enabled then now() else null end,
    case when v_enabled then null else 'preferences_disabled' end)
  on conflict(event_id,channel) do nothing;
  return v_event_id;
end; $$;

create function public.enqueue_movi_request_notification()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_event text;
begin
  if tg_op='INSERT' then v_event:='request_received';
  elsif new.status is not distinct from old.status then return new;
  elsif new.status in ('searching','found','completed','cancelled') then v_event:='request_'||new.status;
  else return new;
  end if;
  perform public.enqueue_user_notification(
    v_event,'requests',new.user_id,
    'requests:'||new.id||':status:'||new.status||':user:'||new.user_id,
    'movi_request',new.id::text,
    jsonb_build_object(
      'request_type',new.request_type,'status',new.status,'clubs',new.clubs,
      'date_mode',new.date_mode,'requested_date',new.requested_date,
      'time_window',new.time_window,'preferred_time_text',new.preferred_time_text,
      'level',new.level,'playing_side',new.playing_side,'match_type',new.match_type,
      'group_size',new.group_size,'required_player_side',new.required_player_side,
      'training_type',new.training_type,'training_goal',new.training_goal
    ),coalesce(new.updated_at,new.created_at,now())
  );
  return new;
end; $$;

create trigger movi_requests_user_email_outbox
after insert or update of status on public.movi_requests
for each row execute function public.enqueue_movi_request_notification();

create function public.enqueue_tournament_registration_notification()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_row public.tournament_registrations%rowtype; v_tournament record; v_event text; v_key text;
begin
  v_row:=case when tg_op='DELETE' then old else new end;
  if v_row.user_id is null then return coalesce(new,old); end if;
  if tg_op='INSERT' then
    v_event:=case when new.is_reserve then 'tournament_reserve' else 'tournament_registered' end;
  elsif tg_op='UPDATE' and old.is_reserve and not new.is_reserve then v_event:='tournament_promoted';
  elsif tg_op='DELETE' then v_event:='tournament_cancelled';
  else return coalesce(new,old);
  end if;
  select name,date,time,location into v_tournament from public.tournaments where id=v_row.tournament_id;
  v_key:='tournaments:'||v_row.id||':'||v_event||':user:'||v_row.user_id;
  perform public.enqueue_user_notification(
    v_event,'tournaments',v_row.user_id,v_key,'tournament_registration',v_row.id::text,
    jsonb_build_object('tournament_id',v_row.tournament_id,'tournament_name',coalesce(v_tournament.name,'Torneo'),
      'date',v_tournament.date,'time',v_tournament.time,'location',v_tournament.location,
      'is_reserve',case when tg_op='DELETE' then old.is_reserve else new.is_reserve end,
      'position',v_row.position),now()
  );
  return coalesce(new,old);
end; $$;

create trigger tournament_registrations_user_email_outbox
after insert or update of is_reserve or delete on public.tournament_registrations
for each row execute function public.enqueue_tournament_registration_notification();

create function public.claim_notification_deliveries(p_worker_id text,p_limit integer default 25)
returns table(delivery_id uuid,event_id uuid,event_type text,domain text,recipient_user_id uuid,payload jsonb,attempts integer)
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if p_worker_id is null or btrim(p_worker_id)='' or p_limit<1 or p_limit>100 then
    raise exception 'NOTIFICATION_CLAIM_INVALID' using errcode='22023';
  end if;
  return query
  with candidates as (
    select d.id from public.notification_deliveries d
    where (
      (d.status in ('pending','retry') and coalesce(d.next_attempt_at,d.created_at)<=now())
      or (d.status='processing' and d.locked_at<now()-interval '15 minutes')
    ) and d.attempts<5
    order by coalesce(d.next_attempt_at,d.created_at),d.id
    for update skip locked limit p_limit
  ), claimed as (
    update public.notification_deliveries d set status='processing',attempts=d.attempts+1,
      locked_at=now(),locked_by=p_worker_id,updated_at=now()
    from candidates c where d.id=c.id
    returning d.id,d.event_id,d.attempts
  )
  select c.id,c.event_id,e.event_type,e.domain,e.recipient_user_id,e.payload,c.attempts
  from claimed c join public.notification_events e on e.id=c.event_id;
end; $$;

create function public.finish_notification_delivery(
  p_delivery_id uuid,p_worker_id text,p_status text,p_provider_message_id text default null,
  p_destination_fingerprint text default null,p_error_code text default null,
  p_error_message text default null,p_next_attempt_at timestamptz default null
) returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if p_status not in ('delivered','retry','failed') then raise exception 'NOTIFICATION_RESULT_INVALID' using errcode='22023'; end if;
  update public.notification_deliveries set status=p_status,
    delivered_at=case when p_status='delivered' then now() else null end,
    provider_message_id=case when p_status='delivered' then p_provider_message_id else null end,
    destination_fingerprint=p_destination_fingerprint,last_error_code=p_error_code,
    last_error_message=left(p_error_message,500),next_attempt_at=case when p_status='retry' then p_next_attempt_at else null end,
    locked_at=null,locked_by=null,updated_at=now()
  where id=p_delivery_id and status='processing' and locked_by=p_worker_id;
  if not found then raise exception 'NOTIFICATION_LOCK_LOST' using errcode='P0001'; end if;
end; $$;

revoke all on function public.ensure_user_notification_preferences() from public,anon,authenticated;
revoke all on function public.enqueue_user_notification(text,text,uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.enqueue_movi_request_notification() from public,anon,authenticated;
revoke all on function public.enqueue_tournament_registration_notification() from public,anon,authenticated;
revoke all on function public.claim_notification_deliveries(text,integer) from public,anon,authenticated;
revoke all on function public.finish_notification_delivery(uuid,text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.enqueue_user_notification(text,text,uuid,text,text,text,jsonb,timestamptz) to service_role;
grant execute on function public.claim_notification_deliveries(text,integer) to service_role;
grant execute on function public.finish_notification_delivery(uuid,text,text,text,text,text,text,timestamptz) to service_role;

comment on table public.user_notification_preferences is 'User-controlled transactional email only; Auth security email and marketing consent are separate.';
comment on table public.notification_events is 'Channel-neutral durable user notification events. V1 creates email deliveries only.';
comment on table public.notification_deliveries is 'Per-channel delivery state. Email is the only V1 channel; schema allows a reviewed future channel extension.';

commit;
