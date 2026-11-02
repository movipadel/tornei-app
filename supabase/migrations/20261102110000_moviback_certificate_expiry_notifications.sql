begin;

create function public.enqueue_moviback_certificate_expiry_events(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_today date := (p_now at time zone 'Europe/Rome')::date;
  v_row record;
  v_event_type text;
  v_created integer := 0;
begin
  for v_row in
    select distinct on (c.user_id) c.id, c.user_id, c.expiry_date
      from public.medical_certificates c
      join public.users u on u.id=c.user_id and u.identity_status='active'
      join public.loyalty_memberships m on m.user_id=c.user_id and m.status='approved'
     where c.status='approved' and c.expiry_date is not null
     order by c.user_id,c.uploaded_at desc,c.id desc
  loop
    v_event_type := case v_row.expiry_date-v_today
      when 30 then 'moviback.certificate.expiring_30d'
      when 7 then 'moviback.certificate.expiring_7d'
      when -1 then 'moviback.certificate.grace_started'
      when -61 then 'moviback.certificate.standby_started'
      else null end;
    if v_event_type is null then continue; end if;
    if not exists(select 1 from public.notification_events where idempotency_key=
      'moviback:certificate:'||v_row.id||':expiry:'||v_row.expiry_date||':milestone:'||v_event_type||':user:'||v_row.user_id) then
      perform public.enqueue_user_notification(
        v_event_type,'moviback',v_row.user_id,
        'moviback:certificate:'||v_row.id||':expiry:'||v_row.expiry_date||':milestone:'||v_event_type||':user:'||v_row.user_id,
        'medical_certificate',v_row.id::text,
        jsonb_build_object('certificate_id',v_row.id,'expiry_date',v_row.expiry_date,'cta_url','/moviback'),p_now);
      v_created := v_created+1;
    end if;
  end loop;
  return v_created;
end; $$;

revoke all on function public.enqueue_moviback_certificate_expiry_events(timestamptz) from public,anon,authenticated;
grant execute on function public.enqueue_moviback_certificate_expiry_events(timestamptz) to service_role;
comment on function public.enqueue_moviback_certificate_expiry_events(timestamptz) is
  'Daily Europe/Rome calendar milestone scanner. Enqueues idempotent email outbox events; never sends inline.';

commit;
