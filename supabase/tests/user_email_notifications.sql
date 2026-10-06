begin;

do $$
declare
  v_user uuid:='eded6000-0000-4000-8000-000000000001';
  v_request uuid:='e1a11000-0000-4000-8000-000000000001';
  v_tournament uuid:='e1a12000-0000-4000-8000-000000000001';
  v_registration uuid:='e1a13000-0000-4000-8000-000000000001';
  v_event uuid; v_delivery uuid; v_worker text:='local-worker';
begin
  if not exists(select 1 from public.user_notification_preferences where user_id=v_user and transactional_email_enabled) then
    raise exception 'DEFAULT_PREFERENCE_NOT_ENABLED';
  end if;

  delete from public.movi_requests where id=v_request;
  insert into public.movi_requests(id,user_id,client_request_id,request_type,playing_side,clubs,date_mode,time_window,preferred_time_text,level,match_type,group_size,required_player_side,notes,telegram_state)
  values(v_request,v_user,v_request,'gioca','left',array['Manta'],'flexible','evening','20:00','intermedio',array['male'],3,'right','Notification SQL LOCAL ONLY','disabled');
  select id into v_event from public.notification_events where idempotency_key='requests:'||v_request||':status:received:user:'||v_user;
  if v_event is null then raise exception 'REQUEST_EVENT_MISSING'; end if;
  if (select count(*) from public.notification_deliveries where event_id=v_event and channel='email' and status='pending')<>1 then raise exception 'REQUEST_DELIVERY_MISSING'; end if;

  perform public.enqueue_user_notification('request_received','requests',v_user,'requests:'||v_request||':status:received:user:'||v_user,'movi_request',v_request::text,'{}');
  if (select count(*) from public.notification_events where idempotency_key='requests:'||v_request||':status:received:user:'||v_user)<>1 then raise exception 'EVENT_NOT_IDEMPOTENT'; end if;
  if (select count(*) from public.notification_deliveries where event_id=v_event)<>1 then raise exception 'DELIVERY_NOT_IDEMPOTENT'; end if;

  insert into public.tournaments(id,name,type,category,level,date,time,location,max_participants,registrations_open)
  values(v_tournament,'Torneo email LOCAL','Baraonda','Maschile','intermedio',current_date+7,'20:00','Manta',16,true);
  insert into public.tournament_registrations(id,tournament_id,user_id,p1_name,p1_phone,p1_gender,position,is_reserve)
  values(v_registration,v_tournament,v_user,'Utente Email','+390000000001','M',1,true);
  update public.tournament_registrations set is_reserve=false where id=v_registration;
  delete from public.tournament_registrations where id=v_registration;
  if (select count(*) from public.notification_events where aggregate_id=v_registration::text and event_type in ('tournament_reserve','tournament_promoted','tournament_cancelled'))<>3 then raise exception 'TOURNAMENT_EVENTS_MISSING'; end if;
  if exists(select 1 from public.notification_events e left join public.notification_deliveries d on d.event_id=e.id where e.aggregate_id=v_registration::text and d.id is null) then raise exception 'TOURNAMENT_DELIVERY_MISSING'; end if;

  update public.user_notification_preferences set transactional_email_enabled=false,version=version+1 where user_id=v_user;
  perform public.enqueue_user_notification('request_found','requests',v_user,'local:preference-off','movi_request',v_request::text,'{}');
  if not exists(select 1 from public.notification_deliveries d join public.notification_events e on e.id=d.event_id where e.idempotency_key='local:preference-off' and d.status='skipped' and d.last_error_code='preferences_disabled') then raise exception 'PREFERENCE_SKIP_MISSING'; end if;

  update public.user_notification_preferences set transactional_email_enabled=true,version=version+1 where user_id=v_user;
  perform public.enqueue_user_notification('request_found','requests',v_user,'local:retry','movi_request',v_request::text,'{}');
  select d.id into v_delivery from public.notification_deliveries d join public.notification_events e on e.id=d.event_id where e.idempotency_key='local:retry';
  perform 1 from public.claim_notification_deliveries(v_worker,100) where delivery_id=v_delivery;
  if (select status from public.notification_deliveries where id=v_delivery)<>'processing' then raise exception 'CLAIM_FAILED'; end if;
  perform public.finish_notification_delivery(v_delivery,v_worker,'retry',null,'fingerprint','provider_error','safe error',now()-interval '1 minute');
  perform 1 from public.claim_notification_deliveries(v_worker,100) where delivery_id=v_delivery;
  perform public.finish_notification_delivery(v_delivery,v_worker,'delivered','local-message','fingerprint',null,null,null);
  if not exists(select 1 from public.notification_deliveries where id=v_delivery and status='delivered' and attempts=2 and delivered_at is not null) then raise exception 'RETRY_DELIVERY_FAILED'; end if;

  if has_table_privilege('anon','public.notification_events','SELECT') or has_table_privilege('authenticated','public.notification_deliveries','SELECT') or has_table_privilege('anon','public.user_notification_preferences','SELECT') then raise exception 'NOTIFICATION_RLS_EXPOSED'; end if;
end $$;

rollback;
