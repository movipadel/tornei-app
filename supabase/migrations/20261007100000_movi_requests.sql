begin;
create table public.movi_requests(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id),
 client_request_id uuid not null, unique(user_id,client_request_id),
 request_type text not null check(request_type in ('gioca','allenati')),
 status text not null default 'received' check(status in ('received','searching','found','completed','cancelled')),
 clubs text[] not null default '{}' check(cardinality(clubs)<=5 and clubs <@ array['Revello','Saluzzo','Manta','Costigliole','Centallo']::text[] and array_position(clubs,null) is null),
 date_mode text not null check(date_mode in ('today','tomorrow','specific','flexible')),requested_date date,
 time_window text not null check(time_window in ('morning','lunch','afternoon','evening','any')),
 preferred_time_text text not null default '' check(length(preferred_time_text)<=100),
 level text not null check(level in ('principiante','intermedio','avanzato','unknown')),
 match_type text check(match_type in ('male','female','mixed','any')),has_partner boolean,
 training_type text check(training_type in ('individual','pair','group','advice')),training_goal text check(training_goal in ('learn','technique','match','regular','other')),
 notes text not null default '' check(length(notes)<=1000),admin_notes text not null default '' check(length(admin_notes)<=3000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),cancelled_at timestamptz,found_at timestamptz,completed_at timestamptz,
 telegram_state text not null default 'pending' check(telegram_state in ('pending','sending','sent','failed','disabled')),
 telegram_attempted_at timestamptz,telegram_notified_at timestamptz,telegram_error text check(telegram_error in ('send_failed','local_disabled','config_blocked')),
 check((date_mode='flexible')=(requested_date is null)),
 check((request_type='gioca' and match_type is not null and has_partner is not null and training_type is null and training_goal is null) or (request_type='allenati' and match_type is null and has_partner is null and training_type is not null and training_goal is not null))
);
create index movi_requests_user_history on public.movi_requests(user_id,created_at desc,id);
create index movi_requests_queue on public.movi_requests(status,created_at desc,id);
create index movi_requests_type_queue on public.movi_requests(request_type,created_at desc,id);
create function public.movi_request_lifecycle() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' then
  if new.status<>'received' then raise exception 'Initial status must be received'; end if;
  new.cancelled_at=null;new.found_at=null;new.completed_at=null;
 else
  if new.user_id<>old.user_id or new.client_request_id<>old.client_request_id or new.request_type<>old.request_type then raise exception 'Request identity immutable'; end if;
  if new.status<>old.status and not ((old.status='received' and new.status in ('searching','cancelled')) or (old.status='searching' and new.status in ('found','cancelled')) or (old.status='found' and new.status in ('completed','cancelled'))) then raise exception 'Invalid status transition'; end if;
  new.found_at=old.found_at;new.completed_at=old.completed_at;new.cancelled_at=old.cancelled_at;
  if new.status<>old.status then
   if new.status='found' then new.found_at=clock_timestamp(); end if;
   if new.status='completed' then new.completed_at=clock_timestamp(); end if;
   if new.status='cancelled' then new.cancelled_at=clock_timestamp(); end if;
  end if;
 end if;
 new.updated_at=clock_timestamp();return new;
end $$;
create trigger movi_request_lifecycle before insert or update on public.movi_requests for each row execute function public.movi_request_lifecycle();
alter table public.movi_requests enable row level security;
revoke all on public.movi_requests from anon,authenticated;
grant all on public.movi_requests to service_role;
-- All browser access passes through the existing Auth/legacy resolver and explicit DTO.
-- No direct table grants: this also protects internal notes and notification metadata.
create function public.movi_request_claim_telegram(p_id uuid) returns setof public.movi_requests language sql security invoker set search_path=public as $$
 update public.movi_requests set telegram_state='sending',telegram_attempted_at=clock_timestamp(),telegram_error=null
 where id=p_id and telegram_notified_at is null and status not in ('cancelled','completed')
 and (telegram_attempted_at is null or telegram_attempted_at<clock_timestamp()-interval '60 seconds') returning *
$$;
revoke all on function public.movi_request_claim_telegram(uuid) from public,anon,authenticated;
grant execute on function public.movi_request_claim_telegram(uuid) to service_role;
commit;
