begin;

do $$
declare
  v_user uuid:='eded6000-0000-4000-8000-000000000001';
  v_order uuid:='e1a14000-0000-4000-8000-000000000001';
  v_cancelled uuid:='e1a14000-0000-4000-8000-000000000002';
  v_disabled uuid:='e1a14000-0000-4000-8000-000000000003';
  v_incomplete uuid:='e1a14000-0000-4000-8000-000000000004';
  v_guest uuid:='e1a14000-0000-4000-8000-000000000005';
begin
  insert into public.users(id,full_name,phone,email,gender)
  values(v_user,'Cliente Store locale','+390000009991','store.local@example.test','M');

  update public.user_notification_preferences
  set transactional_email_enabled=true,version=version+1
  where user_id=v_user;

  insert into public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points,customer_name,customer_email,admin_notes)
  values(v_order,v_user,'pending','MANTA','euro',42.50,0,'Cliente locale','payload-not-authoritative@example.invalid','Costo e margine interni');

  if not exists(
    select 1 from public.notification_events e
    join public.notification_deliveries d on d.event_id=e.id
    where e.idempotency_key='store:'||v_order||':store.order.received:user:'||v_user
      and d.status='skipped' and d.last_error_code='store_order_waiting_for_items'
  ) then raise exception 'STORE_RECEIPT_NOT_HELD_BEFORE_ITEMS'; end if;

  insert into public.store_order_items(order_id,product_name,color_name,size_label,quantity,total_euro)
  values
    (v_order,'Felpa MOVI','Blu','M',1,32.50),
    (v_order,'Palline MOVI',null,null,1,10.00);

  if not exists(
    select 1 from public.notification_events e
    join public.notification_deliveries d on d.event_id=e.id
    where e.aggregate_id=v_order::text and e.event_type='store.order.received'
      and e.payload @> '{"items":[{"name":"Felpa MOVI","variant":"Blu · M","quantity":1},{"name":"Palline MOVI","quantity":1}]}'::jsonb
      and not (e.payload ? 'admin_notes') and not (e.payload ? 'customer_email')
      and d.status='pending' and d.last_error_code is null
  ) then raise exception 'STORE_RECEIPT_PAYLOAD_OR_DELIVERY_INVALID'; end if;

  update public.store_orders set status='ready',ready_at=now(),updated_at=now() where id=v_order;
  update public.store_orders set status='ready',updated_at=now() where id=v_order;
  update public.store_orders set status='delivered',delivered_at=now(),updated_at=now() where id=v_order;

  if (select count(*) from public.notification_events where aggregate_id=v_order::text and event_type='store.order.ready')<>1
     or (select count(*) from public.notification_events where aggregate_id=v_order::text and event_type='store.order.delivered')<>1
  then raise exception 'STORE_READY_DELIVERED_NOT_IDEMPOTENT'; end if;

  insert into public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points)
  values(v_cancelled,v_user,'pending','SALUZZO','points',0,250);
  insert into public.store_order_items(order_id,product_name,quantity,total_points)
  values(v_cancelled,'Accessorio MOVI',1,250);
  update public.store_orders set status='cancelled',cancelled_at=now(),cancellation_reason='Nota riservata',updated_at=now() where id=v_cancelled;
  if not exists(select 1 from public.notification_events where aggregate_id=v_cancelled::text and event_type='store.order.cancelled' and not (payload ? 'cancellation_reason'))
  then raise exception 'STORE_CANCELLED_EVENT_MISSING_OR_UNSAFE'; end if;

  update public.user_notification_preferences
  set transactional_email_enabled=false,version=version+1
  where user_id=v_user;
  insert into public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points)
  values(v_disabled,v_user,'pending','CENTALLO','euro',10,0);
  insert into public.store_order_items(order_id,product_name,quantity,total_euro)
  values(v_disabled,'Palline MOVI',1,10);
  if not exists(
    select 1 from public.notification_events e join public.notification_deliveries d on d.event_id=e.id
    where e.aggregate_id=v_disabled::text and e.event_type='store.order.received'
      and d.status='skipped' and d.last_error_code='preferences_disabled'
  ) then raise exception 'STORE_PREFERENCE_OFF_NOT_SKIPPED'; end if;

  insert into public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points)
  values(v_incomplete,v_user,'pending','CENTALLO','euro',12,0);
  delete from public.store_orders where id=v_incomplete;
  if exists(select 1 from public.notification_events where aggregate_id=v_incomplete::text)
  then raise exception 'INCOMPLETE_STORE_EVENT_NOT_CLEANED'; end if;

  insert into public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points)
  values(v_guest,null,'pending','REVELLO','euro',8,0);
  insert into public.store_order_items(order_id,product_name,quantity,total_euro)
  values(v_guest,'Ordine senza account',1,8);
  update public.store_orders set status='ready',ready_at=now() where id=v_guest;
  if exists(select 1 from public.notification_events where aggregate_id=v_guest::text)
  then raise exception 'UNLINKED_STORE_ORDER_NOTIFIED'; end if;

  if exists(
    select 1 from public.notification_events
    where aggregate_id in (v_order::text,v_cancelled::text,v_disabled::text)
      and event_type like 'store.order.%'
      and (payload ? 'supplier_notes' or payload ? 'admin_notes' or payload ? 'customer_email' or payload ? 'customer_phone')
  ) then raise exception 'STORE_NOTIFICATION_INTERNAL_DATA_LEAK'; end if;
end $$;

rollback;
