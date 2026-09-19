\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE service_role;

UPDATE public.rewards_catalog
SET fulfillment_type='store_product'
WHERE id='00000000-0000-4000-8000-000000009001';

INSERT INTO public.store_products(
  id,category_id,line_id,name,description,base_price_euro,base_price_points,
  allow_euro,allow_points,allow_mixed,is_active,sort_order
) VALUES (
  '76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000004001',
  '00000000-0000-4000-8000-000000004101','Tubo Palline','Phase 2C stockless fixture',
  0,0,false,true,false,true,990
);
INSERT INTO public.rewards_catalog(
  id,name,description,category,points_cost,is_active,stock_qty,reward_type,
  store_product_id,requires_store_variant,fulfillment_type
) VALUES (
  '76000000-0000-4000-8000-000000000002','Tubo Palline','Nessuno stock tracciato',
  'MOVIBACK',100,true,10,'club','76000000-0000-4000-8000-000000000001',false,'store_product'
);

-- STORE: the whole-order decision applies to every item quantity. The second
-- item has no stock row and must remain a safe non-stock-tracked no-op.
INSERT INTO public.store_orders(
  id,user_id,status,pickup_club,payment_mode,total_euro,total_points,
  customer_name,order_type
) VALUES
 ('72000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',25,0,'PHASE2C STORE YES','catalog'),
 ('72000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',25,0,'PHASE2C STORE NO','catalog'),
 ('72000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000001001','ready','CENTALLO','euro',25,0,'PHASE2C STORE READY YES','catalog'),
 ('72000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000001001','ready','CENTALLO','euro',25,0,'PHASE2C STORE READY NO','catalog'),
 ('72000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000001001','delivered','CENTALLO','euro',25,0,'PHASE2C STORE DELIVERED','catalog');

INSERT INTO public.store_order_items(
  id,order_id,product_id,color_id,size_id,product_name,color_name,size_label,
  quantity,unit_price_euro,total_euro
) VALUES
 ('72000000-0000-4000-8000-000000000011','72000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000007001','Tracked','Blue','M',2,10,20),
 ('72000000-0000-4000-8000-000000000012','72000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001',NULL,NULL,'Non tracked',NULL,NULL,1,5,5),
 ('72000000-0000-4000-8000-000000000013','72000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000007001','Tracked','Blue','M',2,25,25),
 ('72000000-0000-4000-8000-000000000014','72000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000007001','Tracked','Blue','M',1,25,25),
 ('72000000-0000-4000-8000-000000000015','72000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000007001','Tracked','Blue','M',1,25,25),
 ('72000000-0000-4000-8000-000000000016','72000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000007001','Tracked','Blue','M',1,25,25);

DO $test$
DECLARE before_qty integer; after_yes integer; replay jsonb; err text;
BEGIN
  SELECT stock_qty INTO before_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001';
  PERFORM public.cancel_physical_store_order('aaaaaaaa-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000021','72000000-0000-4000-8000-000000000001','Test STORE yes',true);
  SELECT stock_qty INTO after_yes FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001';
  replay := public.cancel_physical_store_order('aaaaaaaa-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000021','72000000-0000-4000-8000-000000000001','Test STORE yes',true);
  IF after_yes <> before_qty+2 OR (replay->>'replayed')::boolean IS NOT TRUE
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> after_yes
     OR (SELECT cancellation_reintegrate_stock FROM public.store_orders WHERE id='72000000-0000-4000-8000-000000000001') IS NOT TRUE THEN
    RAISE EXCEPTION 'PHASE2C_STORE_PENDING_YES_REPLAY';
  END IF;

  PERFORM public.cancel_physical_store_order('aaaaaaaa-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000022','72000000-0000-4000-8000-000000000002','Test STORE no',false);
  IF (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> after_yes THEN
    RAISE EXCEPTION 'PHASE2C_STORE_PENDING_NO';
  END IF;

  PERFORM public.cancel_physical_store_order('aaaaaaaa-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000023','72000000-0000-4000-8000-000000000003','Test ready yes',true);
  PERFORM public.cancel_physical_store_order('aaaaaaaa-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000024','72000000-0000-4000-8000-000000000004','Test ready no',false);
  IF (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> after_yes+1 THEN
    RAISE EXCEPTION 'PHASE2C_STORE_READY_CHOICES';
  END IF;

  BEGIN
    PERFORM public.cancel_physical_store_order('aaaaaaaa-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000025','72000000-0000-4000-8000-000000000005','Must fail',true);
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_DELIVERED_CANCELLATION_FORBIDDEN'
     OR (SELECT status FROM public.store_orders WHERE id='72000000-0000-4000-8000-000000000005') <> 'delivered' THEN
    RAISE EXCEPTION 'PHASE2C_STORE_DELIVERED_GUARD';
  END IF;
END $test$;

-- MOVIBACK: points are always refunded, while stock follows the explicit
-- operator decision. Both requested and ready states are covered.
DO $test$
DECLARE
  redeemed jsonb; cancelled jsonb; replay jsonb; rid uuid; oid uuid;
  balance_before bigint; stock_before integer; err text;
  i integer; choose_stock boolean;
BEGIN
  FOR i IN 1..4 LOOP
    choose_stock := i IN (1,3);
    SELECT coalesce(sum(points_delta),0) INTO balance_before
    FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001';
    SELECT stock_qty INTO stock_before FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003';
    redeemed := public.redeem_moviback_reward(
      '00000000-0000-4000-8000-000000001001',
      ('73000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
      '00000000-0000-4000-8000-000000009001',
      '00000000-0000-4000-8000-000000006003',NULL
    );
    rid := (redeemed#>>'{data,id}')::uuid;
    oid := (redeemed#>>'{data,store_order_id}')::uuid;
    IF i > 2 THEN
      PERFORM public.mark_physical_store_order_ready(
        'aaaaaaaa-0000-4000-8000-000000000001',
        ('73100000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,oid
      );
    END IF;
    cancelled := public.cancel_physical_store_order(
      'aaaaaaaa-0000-4000-8000-000000000001',
      ('73200000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
      oid,'Test MOVIBACK',choose_stock
    );
    replay := public.cancel_physical_store_order(
      'aaaaaaaa-0000-4000-8000-000000000001',
      ('73200000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
      oid,'Test MOVIBACK',choose_stock
    );
    IF cancelled#>>'{data,source}' <> 'MOVIBACK'
       OR (replay->>'replayed')::boolean IS NOT TRUE
       OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND type='refund') <> 1
       OR (SELECT status FROM public.reward_redemptions WHERE id=rid) <> 'cancelled'
       OR (SELECT status FROM public.store_orders WHERE id=oid) <> 'cancelled'
       OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> balance_before
       OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003') <> (CASE WHEN choose_stock THEN stock_before ELSE stock_before-1 END)
       OR EXISTS (SELECT 1 FROM public.communications WHERE event_key='moviback_reward_ready:' || rid::text AND is_active=true) THEN
      RAISE EXCEPTION 'PHASE2C_MOVIBACK_CHOICE_%',i;
    END IF;
  END LOOP;

  redeemed := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','73300000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000006003',NULL
  );
  rid := (redeemed#>>'{data,id}')::uuid; oid := (redeemed#>>'{data,store_order_id}')::uuid;
  PERFORM public.mark_physical_store_order_ready('aaaaaaaa-0000-4000-8000-000000000001','73300000-0000-4000-8000-000000000002',oid);
  PERFORM public.deliver_physical_store_order('aaaaaaaa-0000-4000-8000-000000000001','73300000-0000-4000-8000-000000000003',oid);
  BEGIN
    PERFORM public.cancel_physical_store_order('aaaaaaaa-0000-4000-8000-000000000001','73300000-0000-4000-8000-000000000004',oid,'Must fail',true);
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_DELIVERED_CANCELLATION_FORBIDDEN'
     OR EXISTS (SELECT 1 FROM public.loyalty_transactions WHERE related_redemption_id=rid AND type='refund') THEN
    RAISE EXCEPTION 'PHASE2C_MOVIBACK_DELIVERED_GUARD';
  END IF;
END $test$;

-- Variantless/non-stock-tracked MoviBack goods refund points but never create
-- a synthetic Store stock identity, even when the operator chooses YES.
DO $test$
DECLARE redeemed jsonb; replay jsonb; rid uuid; oid uuid; balance_before bigint;
BEGIN
  SELECT coalesce(sum(points_delta),0) INTO balance_before
  FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001';
  redeemed := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','76000000-0000-4000-8000-000000000003',
    '76000000-0000-4000-8000-000000000002',NULL,NULL
  );
  rid := (redeemed#>>'{data,id}')::uuid; oid := (redeemed#>>'{data,store_order_id}')::uuid;
  PERFORM public.cancel_physical_store_order(
    'aaaaaaaa-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000004',oid,'Tubo stockless',true
  );
  replay := public.cancel_physical_store_order(
    'aaaaaaaa-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000004',oid,'Tubo stockless',true
  );
  IF EXISTS (SELECT 1 FROM public.store_product_stock WHERE product_id='76000000-0000-4000-8000-000000000001')
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND type='refund') <> 1
     OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> balance_before
     OR (replay->>'replayed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'PHASE2C_TUBO_STOCKLESS';
  END IF;
END $test$;

-- Supplier history is immutable: a previously claimed item keeps its batch,
-- while cancellation removes it from future eligibility.
INSERT INTO public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points,customer_name,order_type)
VALUES ('74000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',25,0,'PHASE2C EXPORTED','catalog');
INSERT INTO public.store_order_items(id,order_id,product_id,color_id,size_id,product_name,color_name,size_label,quantity,unit_price_euro,total_euro)
VALUES ('74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000007001','Tracked','Blue','M',1,25,25);

DO $test$
DECLARE claimed jsonb; batch_id uuid;
BEGIN
  claimed := public.claim_supplier_export_batch('74000000-0000-4000-8000-000000000003','phase2c-test');
  SELECT supplier_export_batch_id INTO batch_id FROM public.store_order_items WHERE id='74000000-0000-4000-8000-000000000002';
  IF batch_id IS NULL THEN RAISE EXCEPTION 'PHASE2C_BATCH_NOT_CLAIMED'; END IF;
  PERFORM public.cancel_physical_store_order('aaaaaaaa-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000004','74000000-0000-4000-8000-000000000001','Exported cancel',false);
  IF (SELECT supplier_export_batch_id FROM public.store_order_items WHERE id='74000000-0000-4000-8000-000000000002') IS DISTINCT FROM batch_id
     OR EXISTS (
       SELECT 1 FROM public.store_order_items i JOIN public.store_orders o ON o.id=i.order_id
       WHERE i.id='74000000-0000-4000-8000-000000000002'
         AND i.supplier_export_batch_id IS NULL AND o.status IN ('pending','confirmed','ordered_to_supplier')
     ) THEN
    RAISE EXCEPTION 'PHASE2C_BATCH_HISTORY';
  END IF;
END $test$;

ROLLBACK;
\echo 'PHASE2C_UNIFIED_PHYSICAL_CANCELLATION_PASS'
