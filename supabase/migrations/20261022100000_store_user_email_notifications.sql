begin;

create function public.store_order_user_notification_payload(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'order_id', o.id,
    'status', o.status,
    'pickup_club', o.pickup_club,
    'payment_mode', o.payment_mode,
    'total_euro', o.total_euro,
    'total_points', o.total_points,
    'items', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'name', coalesce(nullif(i.product_name,''),nullif(i.custom_product_name,''),'Articolo MOVI'),
          'variant', coalesce(
            nullif(concat_ws(' · ',nullif(i.color_name,''),nullif(i.size_label,'')),''),
            nullif(i.custom_variant,'')
          ),
          'quantity', i.quantity
        )) order by i.created_at,i.id
      )
      from public.store_order_items i
      where i.order_id=o.id
    ),'[]'::jsonb)
  ))
  from public.store_orders o
  where o.id=p_order_id;
$$;

create function public.enqueue_store_order_user_notification()
returns trigger
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $$
declare
  v_event_type text;
  v_event_id uuid;
  v_occurred_at timestamptz;
begin
  if new.user_id is null then return new; end if;

  if tg_op='INSERT' then
    v_event_type:='store.order.received';
    v_occurred_at:=new.created_at;
  elsif new.status is not distinct from old.status then
    return new;
  elsif new.status='ready' then
    v_event_type:='store.order.ready';
    v_occurred_at:=coalesce(new.ready_at,new.updated_at,now());
  elsif new.status='delivered' then
    v_event_type:='store.order.delivered';
    v_occurred_at:=coalesce(new.delivered_at,new.updated_at,now());
  elsif new.status='cancelled' then
    v_event_type:='store.order.cancelled';
    v_occurred_at:=coalesce(new.cancelled_at,new.updated_at,now());
  else
    return new;
  end if;

  v_event_id:=public.enqueue_user_notification(
    v_event_type,
    'store',
    new.user_id,
    'store:'||new.id||':'||v_event_type||':user:'||new.user_id,
    'store_order',
    new.id::text,
    public.store_order_user_notification_payload(new.id),
    coalesce(v_occurred_at,now())
  );

  -- Catalogue checkout persists the order and its items in two database calls.
  -- Hold the receipt until at least one item exists, so route cleanup cannot
  -- leave behind a deliverable notification for a failed order.
  if tg_op='INSERT' and v_event_id is not null then
    update public.notification_deliveries
    set status='skipped',next_attempt_at=null,last_error_code='store_order_waiting_for_items',updated_at=now()
    where event_id=v_event_id and channel='email' and status='pending';
  end if;

  return new;
end;
$$;

create function public.refresh_store_order_user_notification()
returns trigger
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $$
begin
  update public.notification_events e
  set payload=public.store_order_user_notification_payload(new.order_id)
  from public.notification_deliveries d
  where d.event_id=e.id
    and e.domain='store'
    and e.aggregate_type='store_order'
    and e.aggregate_id=new.order_id::text
    and e.event_type='store.order.received'
    and d.channel='email'
    and d.status='skipped'
    and d.last_error_code='store_order_waiting_for_items';

  return new;
end;
$$;

create function public.release_store_order_received_notification()
returns trigger
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $$
begin
  update public.notification_deliveries d
  set status=case when p.transactional_email_enabled then 'pending' else 'skipped' end,
      next_attempt_at=case when p.transactional_email_enabled then now() else null end,
      last_error_code=case when p.transactional_email_enabled then null else 'preferences_disabled' end,
      updated_at=now()
  from public.notification_events e
  join public.user_notification_preferences p on p.user_id=e.recipient_user_id
  where d.event_id=e.id
    and e.domain='store'
    and e.aggregate_type='store_order'
    and e.aggregate_id in (select distinct i.order_id::text from new_store_items i)
    and e.event_type='store.order.received'
    and d.channel='email'
    and d.status='skipped'
    and d.last_error_code='store_order_waiting_for_items';

  return null;
end;
$$;

create function public.cleanup_incomplete_store_order_user_notification()
returns trigger
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $$
begin
  delete from public.notification_events e
  using public.notification_deliveries d
  where d.event_id=e.id
    and e.domain='store'
    and e.aggregate_type='store_order'
    and e.aggregate_id=old.id::text
    and e.event_type='store.order.received'
    and d.channel='email'
    and d.status<>'delivered'
    and coalesce(e.payload->'items','[]'::jsonb)='[]'::jsonb;
  return old;
end;
$$;

create trigger store_orders_user_email_outbox
after insert or update of status on public.store_orders
for each row execute function public.enqueue_store_order_user_notification();

create trigger store_order_items_user_email_snapshot
after insert on public.store_order_items
for each row execute function public.refresh_store_order_user_notification();

create trigger store_order_items_user_email_release
after insert on public.store_order_items
referencing new table as new_store_items
for each statement execute function public.release_store_order_received_notification();

create trigger store_orders_incomplete_email_cleanup
after delete on public.store_orders
for each row execute function public.cleanup_incomplete_store_order_user_notification();

revoke all on function public.store_order_user_notification_payload(uuid) from public,anon,authenticated;
revoke all on function public.enqueue_store_order_user_notification() from public,anon,authenticated;
revoke all on function public.refresh_store_order_user_notification() from public,anon,authenticated;
revoke all on function public.release_store_order_received_notification() from public,anon,authenticated;
revoke all on function public.cleanup_incomplete_store_order_user_notification() from public,anon,authenticated;

comment on function public.store_order_user_notification_payload(uuid) is
  'Customer-safe Store snapshot: no supplier costs, margins, payment internals, staff notes or contact data.';

commit;
