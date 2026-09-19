\set ON_ERROR_STOP on

BEGIN;

UPDATE public.rewards_catalog
SET fulfillment_type = CASE id
  WHEN '00000000-0000-4000-8000-000000009001'::uuid THEN 'store_product'
  WHEN '00000000-0000-4000-8000-000000009002'::uuid THEN 'service'
END
WHERE id IN ('00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000009002');

INSERT INTO public.store_products(
  id,category_id,line_id,name,description,base_price_euro,base_price_points,
  allow_euro,allow_points,allow_mixed,is_active,sort_order
) VALUES
  ('671549a7-ed15-4eab-886d-4dff3f331d4d','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Asciugamano','Phase 1 variant fixture',0,0,false,true,false,true,910),
  ('f442259b-1e5b-437a-b0ba-3d056d9d617d','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Tubo Palline','Phase 1 stockless fixture',0,0,false,true,false,true,911);

INSERT INTO public.store_product_colors(id,product_id,color_name,color_hex,is_active,sort_order) VALUES
  ('32000000-0000-4000-8000-000000000001','671549a7-ed15-4eab-886d-4dff3f331d4d','Grigio','#808080',true,1),
  ('32000000-0000-4000-8000-000000000002','671549a7-ed15-4eab-886d-4dff3f331d4d','Lime','#BFFF00',true,2),
  ('32000000-0000-4000-8000-000000000003','f442259b-1e5b-437a-b0ba-3d056d9d617d','Giallo','#FFFF00',true,1);

INSERT INTO public.store_product_sizes(id,product_id,size_label,sort_order,is_active) VALUES
  ('33000000-0000-4000-8000-000000000001','671549a7-ed15-4eab-886d-4dff3f331d4d','UNICA',1,true),
  ('33000000-0000-4000-8000-000000000002','f442259b-1e5b-437a-b0ba-3d056d9d617d','UNICA',1,true);

INSERT INTO public.store_product_stock(id,product_id,color_id,size_id,stock_qty,sku,is_active) VALUES
  ('34000000-0000-4000-8000-000000000001','671549a7-ed15-4eab-886d-4dff3f331d4d','32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001',5,'PHASE1-ASCIUGAMANO-GRIGIO',true),
  ('34000000-0000-4000-8000-000000000002','671549a7-ed15-4eab-886d-4dff3f331d4d','32000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000001',5,'PHASE1-ASCIUGAMANO-LIME',true);

INSERT INTO public.rewards_catalog(
  id,name,description,category,points_cost,is_active,stock_qty,reward_type,
  store_product_id,requires_store_variant,fulfillment_type
) VALUES
  ('46709f62-3f5a-4025-965a-c5fcedcec826','Asciugamano','Scegli il colore.','MOVIBACK',100,true,10,'club','671549a7-ed15-4eab-886d-4dff3f331d4d',true,'store_product'),
  ('1b1718ab-aba8-44bb-a2de-d90992e596a7','Tubo Palline','Nessuna scelta richiesta.','MOVIBACK',100,true,10,'club','f442259b-1e5b-437a-b0ba-3d056d9d617d',false,'store_product');

SET LOCAL ROLE service_role;

-- Named acceptance fixtures prove the ready event and inventory behavior for
-- both the selectable Asciugamano and stockless/variantless Tubo Palline.
DO $test$
DECLARE asciugamano jsonb; tubo jsonb; asciugamano_id uuid; tubo_id uuid; asciugamano_order uuid; tubo_order uuid; lime_after_redeem integer;
BEGIN
  asciugamano := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','40000000-0000-4000-8000-000000000001',
    '46709f62-3f5a-4025-965a-c5fcedcec826','32000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000001'
  );
  asciugamano_id := (asciugamano#>>'{data,id}')::uuid;
  asciugamano_order := (asciugamano#>>'{data,store_order_id}')::uuid;
  SELECT stock_qty INTO lime_after_redeem FROM public.store_product_stock WHERE id='34000000-0000-4000-8000-000000000002';
  PERFORM public.mark_physical_store_order_ready(
    'aaaaaaaa-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',asciugamano_order
  );

  tubo := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','40000000-0000-4000-8000-000000000003',
    '1b1718ab-aba8-44bb-a2de-d90992e596a7',NULL,NULL
  );
  tubo_id := (tubo#>>'{data,id}')::uuid;
  tubo_order := (tubo#>>'{data,store_order_id}')::uuid;
  PERFORM public.mark_physical_store_order_ready(
    'aaaaaaaa-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004',tubo_order
  );

  IF (SELECT count(*) FROM public.store_order_items WHERE order_id=asciugamano_order AND color_name='Lime' AND size_label='UNICA') <> 1
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='34000000-0000-4000-8000-000000000002') <> lime_after_redeem
     OR (SELECT count(*) FROM public.communications WHERE event_key='moviback_reward_ready:' || asciugamano_id::text AND body='Il tuo premio Asciugamano è pronto per il ritiro. Apri MoviBack per mostrare il QR o il codice premio.') <> 1
     OR EXISTS (SELECT 1 FROM public.store_product_stock WHERE product_id='f442259b-1e5b-437a-b0ba-3d056d9d617d')
     OR (SELECT count(*) FROM public.store_order_items WHERE order_id=tubo_order AND color_id IS NULL AND size_id IS NULL) <> 1
     OR (SELECT count(*) FROM public.communications WHERE event_key='moviback_reward_ready:' || tubo_id::text AND body='Il tuo premio Tubo Palline è pronto per il ritiro. Apri MoviBack per mostrare il QR o il codice premio.') <> 1 THEN
    RAISE EXCEPTION 'PHASE1_ASSERT_NAMED_REWARDS';
  END IF;
END $test$;

-- A requested physical redemption becomes ready atomically, creates one
-- customer event, exposes credentials through the existing status gate, and
-- never repeats stock/points mutation or notification work.
DO $test$
DECLARE
  redeemed jsonb; first_ready jsonb; replay_ready jsonb; second_key_ready jsonb;
  delivered jsonb; delivery_replay jsonb;
  rid uuid; oid uuid; stock_before integer; reward_stock_before integer; balance_before bigint;
BEGIN
  redeemed := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001',
    '41000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000009001',
    '00000000-0000-4000-8000-000000006003',NULL
  );
  rid := (redeemed#>>'{data,id}')::uuid;
  oid := (redeemed#>>'{data,store_order_id}')::uuid;
  SELECT stock_qty INTO stock_before FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003';
  SELECT stock_qty INTO reward_stock_before FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009001';
  SELECT coalesce(sum(points_delta),0) INTO balance_before FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001';

  first_ready := public.mark_physical_store_order_ready(
    'aaaaaaaa-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002',oid
  );
  replay_ready := public.mark_physical_store_order_ready(
    'aaaaaaaa-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002',oid
  );
  second_key_ready := public.mark_physical_store_order_ready(
    'aaaaaaaa-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000003',oid
  );

  IF first_ready#>>'{data,source}' <> 'MOVIBACK'
     OR first_ready#>>'{data,operational_status}' <> 'ready'
     OR (first_ready#>>'{data,customer_notification_created}')::boolean IS NOT TRUE
     OR (replay_ready->>'replayed')::boolean IS NOT TRUE
     OR (second_key_ready#>>'{data,applied}')::boolean IS NOT FALSE
     OR (SELECT count(*) FROM public.store_orders WHERE id=oid AND status='ready' AND ready_at IS NOT NULL) <> 1
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND status='ready' AND ready_at IS NOT NULL AND qr_token IS NOT NULL AND manual_code IS NOT NULL) <> 1
     OR (SELECT count(*) FROM public.communications WHERE event_key='moviback_reward_ready:' || rid::text) <> 1
     OR (SELECT count(*) FROM public.communications WHERE event_key='moviback_reward_ready:' || rid::text AND recipient_user_id='00000000-0000-4000-8000-000000001001' AND target='user' AND title='Il tuo premio è pronto' AND body='Il tuo premio PF08 TEST REWARD A STORE LINKED è pronto per il ritiro. Apri MoviBack per mostrare il QR o il codice premio.' AND cta_url='/moviback') <> 1
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003') <> stock_before
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009001') <> reward_stock_before
     OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> balance_before
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND type='redeem') <> 1 THEN
    RAISE EXCEPTION 'PHASE1_ASSERT_MOVIBACK_READY';
  END IF;

  delivered := public.deliver_physical_store_order(
    'aaaaaaaa-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000004',oid
  );
  delivery_replay := public.deliver_physical_store_order(
    'aaaaaaaa-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000004',oid
  );
  IF delivered#>>'{data,operational_status}' <> 'delivered'
     OR (delivery_replay->>'replayed')::boolean IS NOT TRUE
     OR (SELECT count(*) FROM public.store_orders WHERE id=oid AND status='delivered') <> 1
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND status='delivered') <> 1
     OR (SELECT count(*) FROM public.communications WHERE event_key='moviback_reward_ready:' || rid::text) <> 1
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003') <> stock_before
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009001') <> reward_stock_before
     OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> balance_before THEN
    RAISE EXCEPTION 'PHASE1_ASSERT_MOVIBACK_DELIVERY';
  END IF;
END $test$;

-- SERVICE remains immediate-ready and creates no physical-ready event/order.
DO $test$
DECLARE redeemed jsonb; rid uuid;
BEGIN
  redeemed := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','41000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000009002',NULL,NULL
  );
  rid := (redeemed#>>'{data,id}')::uuid;
  IF redeemed#>>'{data,status}' <> 'ready'
     OR (redeemed#>>'{data,qr_deliverable}')::boolean IS NOT TRUE
     OR EXISTS (SELECT 1 FROM public.store_orders WHERE related_redemption_id=rid)
     OR EXISTS (SELECT 1 FROM public.communications WHERE event_key='moviback_reward_ready:' || rid::text) THEN
    RAISE EXCEPTION 'PHASE1_ASSERT_SERVICE_UNCHANGED';
  END IF;
END $test$;

-- A normal Store order uses only the Store state machine and produces no
-- MoviBack row/event. Cancellation is deliberately refused without proven
-- reservation/payment compensation provenance.
DO $test$
DECLARE oid uuid := '42000000-0000-4000-8000-000000000001'; ready_result jsonb; delivered_result jsonb; err text;
BEGIN
  INSERT INTO public.store_orders(
    id,user_id,status,pickup_club,payment_mode,total_euro,total_points,
    customer_name,order_type
  ) VALUES (
    oid,'00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',25,0,
    'PF08 TEST USER A','catalog'
  );
  ready_result := public.mark_physical_store_order_ready(
    'aaaaaaaa-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000002',oid
  );
  delivered_result := public.deliver_physical_store_order(
    'aaaaaaaa-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003',oid
  );
  IF ready_result#>>'{data,source}' <> 'STORE'
     OR delivered_result#>>'{data,operational_status}' <> 'delivered'
     OR (SELECT count(*) FROM public.communications WHERE event_key LIKE 'moviback_reward_ready:%') <> 3 THEN
    RAISE EXCEPTION 'PHASE1_ASSERT_STORE_FLOW';
  END IF;

  INSERT INTO public.store_orders(
    id,user_id,status,pickup_club,payment_mode,total_euro,total_points,
    customer_name,order_type
  ) VALUES (
    '42000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000001001',
    'pending','CENTALLO','euro',25,0,'PF08 TEST USER A','catalog'
  );
  BEGIN
    PERFORM public.cancel_physical_store_order(
      'aaaaaaaa-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000005',
      '42000000-0000-4000-8000-000000000004','Test'
    );
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_STOCK_DECISION_REQUIRED'
     OR (SELECT status FROM public.store_orders WHERE id='42000000-0000-4000-8000-000000000004') <> 'pending' THEN
    RAISE EXCEPTION 'PHASE1_ASSERT_STORE_CANCEL_DEFERRED';
  END IF;
END $test$;

-- MoviBack cancellation reuses the proven refund/release command exactly once.
DO $test$
DECLARE redeemed jsonb; cancelled jsonb; replayed jsonb; rid uuid; oid uuid; balance_before bigint; stock_before integer;
BEGIN
  SELECT coalesce(sum(points_delta),0) INTO balance_before FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001';
  SELECT stock_qty INTO stock_before FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003';
  redeemed := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','43000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000006003',NULL
  );
  rid := (redeemed#>>'{data,id}')::uuid; oid := (redeemed#>>'{data,store_order_id}')::uuid;
  cancelled := public.cancel_physical_store_order(
    'aaaaaaaa-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000002',oid,'Cliente rinuncia',true
  );
  replayed := public.cancel_physical_store_order(
    'aaaaaaaa-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000002',oid,'Cliente rinuncia',true
  );
  IF cancelled#>>'{data,source}' <> 'MOVIBACK'
     OR (replayed->>'replayed')::boolean IS NOT TRUE
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND type='refund') <> 1
     OR (SELECT status FROM public.store_orders WHERE id=oid) <> 'cancelled'
     OR (SELECT status FROM public.reward_redemptions WHERE id=rid) <> 'cancelled'
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003') <> stock_before
     OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> balance_before THEN
    RAISE EXCEPTION 'PHASE1_ASSERT_MOVIBACK_CANCEL';
  END IF;
END $test$;

-- Legacy divergence is reported, never silently repaired and never notified.
DO $test$
DECLARE redeemed jsonb; rid uuid; oid uuid; err text;
BEGIN
  redeemed := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','44000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000006003',NULL
  );
  rid := (redeemed#>>'{data,id}')::uuid; oid := (redeemed#>>'{data,store_order_id}')::uuid;
  UPDATE public.store_orders SET status='delivered',delivered_at=now() WHERE id=oid;
  BEGIN
    PERFORM public.mark_physical_store_order_ready(
      'aaaaaaaa-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000002',oid
    );
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_FULFILLMENT_STATE_CONFLICT'
     OR (SELECT status FROM public.reward_redemptions WHERE id=rid) <> 'requested'
     OR EXISTS (SELECT 1 FROM public.communications WHERE event_key='moviback_reward_ready:' || rid::text) THEN
    RAISE EXCEPTION 'PHASE1_ASSERT_LEGACY_CONFLICT';
  END IF;
END $test$;

ROLLBACK;

\echo 'Phase 1 physical fulfillment commands PASS: atomic ready/delivery, notification idempotency, Store isolation, safe cancellation and conflicts.'
