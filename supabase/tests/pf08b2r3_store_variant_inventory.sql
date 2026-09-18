\set ON_ERROR_STOP on

BEGIN;

-- PF-08B2R3 fixtures are transaction-local. Exact production catalog UUIDs are
-- used for Asciugamano and Tubo; every change is rolled back at EOF.
INSERT INTO public.store_products(
  id,category_id,line_id,name,description,base_price_euro,base_price_points,
  allow_euro,allow_points,allow_mixed,is_active,sort_order
) VALUES
  ('671549a7-ed15-4eab-886d-4dff3f331d4d','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Asciugamano','PF08B2R3 selectable variant',0,0,false,true,false,true,910),
  ('f442259b-1e5b-437a-b0ba-3d056d9d617d','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Tubo di palline','PF08B2R3 stockless reward',0,0,false,true,false,true,911),
  ('31000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','PF08B2R3 single identity','Auto-resolved tracked inventory',0,0,false,true,false,true,912),
  ('31000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','PF08B2R3 ambiguous identity','Must be rejected',0,0,false,true,false,true,913);

INSERT INTO public.store_product_colors(id,product_id,color_name,color_hex,is_active,sort_order) VALUES
  ('32000000-0000-4000-8000-000000000001','671549a7-ed15-4eab-886d-4dff3f331d4d','Grigio','#808080',true,1),
  ('32000000-0000-4000-8000-000000000002','671549a7-ed15-4eab-886d-4dff3f331d4d','Lime','#BFFF00',true,2),
  ('32000000-0000-4000-8000-000000000003','f442259b-1e5b-437a-b0ba-3d056d9d617d','Giallo','#FFFF00',true,1),
  ('32000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000001','Nero','#000000',true,1),
  ('32000000-0000-4000-8000-000000000005','31000000-0000-4000-8000-000000000002','Bianco','#FFFFFF',true,1),
  ('32000000-0000-4000-8000-000000000006','31000000-0000-4000-8000-000000000002','Blu','#0000FF',true,2);

INSERT INTO public.store_product_sizes(id,product_id,size_label,sort_order,is_active) VALUES
  ('33000000-0000-4000-8000-000000000001','671549a7-ed15-4eab-886d-4dff3f331d4d','UNICA',1,true),
  ('33000000-0000-4000-8000-000000000002','f442259b-1e5b-437a-b0ba-3d056d9d617d','UNICA',1,true),
  ('33000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001','UNICA',1,true),
  ('33000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000002','UNICA',1,true);

INSERT INTO public.store_product_stock(id,product_id,color_id,size_id,stock_qty,sku,is_active) VALUES
  ('34000000-0000-4000-8000-000000000001','671549a7-ed15-4eab-886d-4dff3f331d4d','32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001',5,'PF08-ASCIUGAMANO-GRIGIO',true),
  ('34000000-0000-4000-8000-000000000002','671549a7-ed15-4eab-886d-4dff3f331d4d','32000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000001',5,'PF08-ASCIUGAMANO-LIME',true),
  ('34000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000004','33000000-0000-4000-8000-000000000003',5,'PF08-SINGLE',true),
  ('34000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000005','33000000-0000-4000-8000-000000000004',5,'PF08-AMB-A',true),
  ('34000000-0000-4000-8000-000000000005','31000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000006','33000000-0000-4000-8000-000000000004',5,'PF08-AMB-B',true);

INSERT INTO public.rewards_catalog(
  id,name,description,category,points_cost,is_active,stock_qty,reward_type,
  store_product_id,requires_store_variant,fulfillment_type
) VALUES
  ('46709f62-3f5a-4025-965a-c5fcedcec826','Asciugamano','Scegli il colore.','MOVIBACK',100,true,10,'club','671549a7-ed15-4eab-886d-4dff3f331d4d',true,'store_product'),
  ('1b1718ab-aba8-44bb-a2de-d90992e596a7','Tubo di palline','Nessuna scelta richiesta.','MOVIBACK',100,true,10,'club','f442259b-1e5b-437a-b0ba-3d056d9d617d',false,'store_product'),
  ('35000000-0000-4000-8000-000000000001','PF08B2R3 single','Auto-resolve.','MOVIBACK',100,true,NULL,'club','31000000-0000-4000-8000-000000000001',false,'store_product'),
  ('35000000-0000-4000-8000-000000000002','PF08B2R3 ambiguous','Reject ambiguity.','MOVIBACK',100,true,NULL,'club','31000000-0000-4000-8000-000000000002',false,'store_product');

SET LOCAL ROLE service_role;

-- requires_store_variant=true: omission and invalid identity fail atomically.
DO $test$
DECLARE err text;
BEGIN
  BEGIN
    PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000001','46709f62-3f5a-4025-965a-c5fcedcec826',NULL,NULL);
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_MISSING_REQUIRED_VARIANT'
     OR EXISTS (SELECT 1 FROM public.business_operation_idempotency WHERE idempotency_key='36000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'PF08B2R3_ASSERT_REQUIRED_OMISSION';
  END IF;

  BEGIN
    PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000002','46709f62-3f5a-4025-965a-c5fcedcec826','32000000-0000-4000-8000-000000000003','33000000-0000-4000-8000-000000000001');
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_INVALID_STORE_VARIANT' THEN RAISE EXCEPTION 'PF08B2R3_ASSERT_INVALID_REQUIRED'; END IF;
END $test$;

-- Both Asciugamano choices are valid, tracked, snapshotted and rollback-safe.
SAVEPOINT asciugamano_grigio;
DO $test$
DECLARE r jsonb; rid uuid; oid uuid;
BEGIN
  r := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000003','46709f62-3f5a-4025-965a-c5fcedcec826','32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001');
  rid := (r#>>'{data,id}')::uuid; oid := (r#>>'{data,store_order_id}')::uuid;
  IF (r->>'created')::boolean IS NOT TRUE
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='34000000-0000-4000-8000-000000000001') <> 4
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND reserved_store_stock_id='34000000-0000-4000-8000-000000000001' AND store_stock_reserved_qty=1) <> 1
     OR (SELECT count(*) FROM public.store_order_items WHERE order_id=oid AND color_name='Grigio' AND size_label='UNICA') <> 1 THEN
    RAISE EXCEPTION 'PF08B2R3_ASSERT_ASCIUGAMANO_GRIGIO';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT asciugamano_grigio;

SAVEPOINT asciugamano_lime;
DO $test$
DECLARE r jsonb; oid uuid;
BEGIN
  r := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000004','46709f62-3f5a-4025-965a-c5fcedcec826','32000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000001');
  oid := (r#>>'{data,store_order_id}')::uuid;
  IF (SELECT stock_qty FROM public.store_product_stock WHERE id='34000000-0000-4000-8000-000000000002') <> 4
     OR (SELECT count(*) FROM public.store_order_items WHERE order_id=oid AND color_name='Lime' AND size_label='UNICA') <> 1 THEN
    RAISE EXCEPTION 'PF08B2R3_ASSERT_ASCIUGAMANO_LIME';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT asciugamano_lime;

-- requires_store_variant=false accepts an exact legacy selection for the sole
-- identity, rejects mismatches, and otherwise auto-resolves that identity.
SAVEPOINT single_identity_legacy_input;
DO $test$
DECLARE err text; r jsonb;
BEGIN
  r := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000005','35000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000004','33000000-0000-4000-8000-000000000003');
  IF (r->>'created')::boolean IS NOT TRUE
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='34000000-0000-4000-8000-000000000003') <> 4 THEN
    RAISE EXCEPTION 'PF08B2R3_ASSERT_COMPATIBLE_LEGACY_VARIANT';
  END IF;

  BEGIN
    PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000010','35000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000005','33000000-0000-4000-8000-000000000003');
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_INVALID_STORE_VARIANT' THEN RAISE EXCEPTION 'PF08B2R3_ASSERT_MISMATCHED_LEGACY_VARIANT'; END IF;
END $test$;
ROLLBACK TO SAVEPOINT single_identity_legacy_input;

DO $test$
DECLARE r jsonb; cancel_result jsonb; cancel_replay jsonb; rid uuid; oid uuid; balance_before bigint;
BEGIN
  SELECT coalesce(sum(points_delta),0) INTO balance_before FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001';
  r := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000006','35000000-0000-4000-8000-000000000001',NULL,NULL);
  rid := (r#>>'{data,id}')::uuid; oid := (r#>>'{data,store_order_id}')::uuid;
  IF (SELECT stock_qty FROM public.store_product_stock WHERE id='34000000-0000-4000-8000-000000000003') <> 4
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND reserved_store_stock_id='34000000-0000-4000-8000-000000000003' AND store_stock_reserved_qty=1) <> 1
     OR (SELECT count(*) FROM public.store_order_items WHERE order_id=oid AND color_name='Nero' AND size_label='UNICA') <> 1 THEN
    RAISE EXCEPTION 'PF08B2R3_ASSERT_AUTO_RESOLVE';
  END IF;

  cancel_result := public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000011',rid,'Test tracked cancellation');
  cancel_replay := public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000011',rid,'Test tracked cancellation');
  IF cancel_result#>>'{data,status}' <> 'cancelled'
     OR (cancel_replay->>'replayed')::boolean IS NOT TRUE
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='34000000-0000-4000-8000-000000000003') <> 5
     OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> balance_before
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND points_delta=100) <> 1 THEN
    RAISE EXCEPTION 'PF08B2R3_ASSERT_TRACKED_CANCEL';
  END IF;
END $test$;

-- More than one valid active stock identity is an explicit catalog error.
DO $test$
DECLARE err text;
BEGIN
  BEGIN
    PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000007','35000000-0000-4000-8000-000000000002',NULL,NULL);
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_AMBIGUOUS_STORE_VARIANT'
     OR EXISTS (SELECT 1 FROM public.business_operation_idempotency WHERE idempotency_key='36000000-0000-4000-8000-000000000007')
     OR EXISTS (SELECT 1 FROM public.reward_redemptions WHERE reward_id='35000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'PF08B2R3_ASSERT_AMBIGUOUS';
  END IF;
END $test$;

-- Tubo: metadata may exist but zero stock rows means untracked/unlimited inventory.
-- Redemption/order/item, replay safety and B2L cancellation remain fully operative.
DO $test$
DECLARE first_result jsonb; replay_result jsonb; cancel_result jsonb; cancel_replay jsonb; rid uuid; oid uuid; balance_before bigint; reward_before integer; conflict_err text;
BEGIN
  SELECT coalesce(sum(points_delta),0) INTO balance_before FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001';
  SELECT stock_qty INTO reward_before FROM public.rewards_catalog WHERE id='1b1718ab-aba8-44bb-a2de-d90992e596a7';
  first_result := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000008','1b1718ab-aba8-44bb-a2de-d90992e596a7',NULL,NULL);
  replay_result := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000008','1b1718ab-aba8-44bb-a2de-d90992e596a7',NULL,NULL);
  rid := (first_result#>>'{data,id}')::uuid; oid := (first_result#>>'{data,store_order_id}')::uuid;
  IF (first_result->>'created')::boolean IS NOT TRUE
     OR (first_result->>'should_notify_staff')::boolean IS NOT TRUE
     OR (replay_result->>'created')::boolean IS NOT FALSE
     OR (replay_result->>'should_notify_staff')::boolean IS NOT FALSE
     OR replay_result#>>'{data,id}' <> rid::text
     OR EXISTS (SELECT 1 FROM public.store_product_stock WHERE product_id='f442259b-1e5b-437a-b0ba-3d056d9d617d')
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND reserved_store_stock_id IS NULL AND store_stock_reserved_qty=0) <> 1
     OR (SELECT count(*) FROM public.store_orders WHERE id=oid AND related_redemption_id=rid AND status='pending') <> 1
     OR (SELECT count(*) FROM public.store_order_items WHERE order_id=oid AND product_id='f442259b-1e5b-437a-b0ba-3d056d9d617d' AND color_id IS NULL AND size_id IS NULL) <> 1
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND points_delta=-100) <> 1 THEN
    RAISE EXCEPTION 'PF08B2R3_ASSERT_STOCKLESS_REPLAY';
  END IF;

  BEGIN
    PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000008','1b1718ab-aba8-44bb-a2de-d90992e596a7','32000000-0000-4000-8000-000000000003','33000000-0000-4000-8000-000000000002');
    conflict_err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN conflict_err := SQLERRM; END;
  IF conflict_err <> 'PF08_IDEMPOTENCY_CONFLICT' THEN RAISE EXCEPTION 'PF08B2R3_ASSERT_CONFLICT'; END IF;

  BEGIN
    PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','36000000-0000-4000-8000-000000000012','1b1718ab-aba8-44bb-a2de-d90992e596a7','32000000-0000-4000-8000-000000000003','33000000-0000-4000-8000-000000000002');
    conflict_err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN conflict_err := SQLERRM; END;
  IF conflict_err <> 'PF08_INVALID_STORE_VARIANT' THEN RAISE EXCEPTION 'PF08B2R3_ASSERT_STOCKLESS_VARIANT'; END IF;

  cancel_result := public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000009',rid,'Test stockless cancellation');
  cancel_replay := public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000009',rid,'Test stockless cancellation');
  IF cancel_result#>>'{data,status}' <> 'cancelled'
     OR (cancel_replay->>'replayed')::boolean IS NOT TRUE
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='1b1718ab-aba8-44bb-a2de-d90992e596a7') <> reward_before
     OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> balance_before
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND points_delta=100) <> 1
     OR (SELECT count(*) FROM public.store_orders WHERE id=oid AND status='cancelled') <> 1
     OR EXISTS (SELECT 1 FROM public.store_product_stock WHERE product_id='f442259b-1e5b-437a-b0ba-3d056d9d617d') THEN
    RAISE EXCEPTION 'PF08B2R3_ASSERT_STOCKLESS_CANCEL';
  END IF;
END $test$;

ROLLBACK;

\echo 'PF-08B2R3 functional PASS: required variants, auto-resolution, stockless inventory, ambiguity, replay and cancellation.'
