begin;

create or replace function public.finish_notification_delivery(
  p_delivery_id uuid,p_worker_id text,p_status text,p_provider_message_id text default null,
  p_destination_fingerprint text default null,p_error_code text default null,
  p_error_message text default null,p_next_attempt_at timestamptz default null
) returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if p_status not in ('delivered','retry','failed','skipped') then raise exception 'NOTIFICATION_RESULT_INVALID' using errcode='22023'; end if;
  update public.notification_deliveries set status=p_status,
    delivered_at=case when p_status='delivered' then now() else null end,
    provider_message_id=case when p_status='delivered' then p_provider_message_id else null end,
    destination_fingerprint=p_destination_fingerprint,last_error_code=p_error_code,
    last_error_message=left(p_error_message,500),next_attempt_at=case when p_status='retry' then p_next_attempt_at else null end,
    locked_at=null,locked_by=null,updated_at=now()
  where id=p_delivery_id and status='processing' and locked_by=p_worker_id;
  if not found then raise exception 'NOTIFICATION_LOCK_LOST' using errcode='P0001'; end if;
end; $$;

commit;
