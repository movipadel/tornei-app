\set ON_ERROR_STOP on

BEGIN;

-- Historical compatibility is checked before catalog classification for tests.
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.reward_redemptions WHERE id='00000000-0000-4000-8000-00000000a001' AND status='requested' AND fulfillment_type IS NULL) <> 1
     OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id='00000000-0000-4000-8000-00000000a001') <> 0
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id='00000000-0000-4000-8000-00000000a002' AND status='delivered' AND fulfillment_type IS NULL) <> 1
     OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id='00000000-0000-4000-8000-00000000a002') <> 1 THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_HISTORICAL_BASELINE';
  END IF;

  INSERT INTO public.reward_redemptions(
    id,membership_id,reward_id,points_cost,status,requested_at,approved_at,qr_token
  ) VALUES (
    '00000000-0000-4000-8000-00000000a099',
    '00000000-0000-4000-8000-000000002001',
    '00000000-0000-4000-8000-000000009002',
    200,'approved',now(),now(),'PF08-LEGACY-APPROVED-READABLE'
  );

  IF (SELECT status FROM public.reward_redemptions WHERE id='00000000-0000-4000-8000-00000000a099') <> 'approved' THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_LEGACY_APPROVED';
  END IF;
  DELETE FROM public.reward_redemptions WHERE id='00000000-0000-4000-8000-00000000a099';
END $test$;

UPDATE public.rewards_catalog
SET fulfillment_type = CASE id
  WHEN '00000000-0000-4000-8000-000000009001'::uuid THEN 'store_product'
  WHEN '00000000-0000-4000-8000-000000009002'::uuid THEN 'service'
END
WHERE id IN (
  '00000000-0000-4000-8000-000000009001',
  '00000000-0000-4000-8000-000000009002'
);

INSERT INTO public.rewards_catalog(
  id,name,description,category,points_cost,is_active,stock_qty,reward_type,
  store_product_id,requires_store_variant,fulfillment_type
) VALUES
  ('00000000-0000-4000-8000-000000009003','PF08 SMART CUSTOM PHYSICAL',
   'Preparare confezione premio personalizzata.','PF08 CLUB',150,true,2,'club',NULL,false,'custom_physical'),
  ('00000000-0000-4000-8000-000000009004','PF08 SMART PARTNER',
   'Attivare entitlement partner.','PF08 STORE KEYWORD MUST BE IGNORED',100,true,2,'partner',NULL,false,'partner');

SET LOCAL ROLE service_role;

-- SERVICE: immediate ready, no Store objects, one debit, universal notification, replay-safe.
SAVEPOINT test_service;
DO $test$
DECLARE first_result jsonb; replay_result jsonb; rid uuid;
BEGIN
  first_result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001',
    '23000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000009002',NULL,NULL);
  replay_result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001',
    '23000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000009002',NULL,NULL);
  rid := (first_result#>>'{data,id}')::uuid;

  IF (first_result->>'created')::boolean IS NOT TRUE
     OR (first_result->>'should_notify_staff')::boolean IS NOT TRUE
     OR first_result#>>'{data,status}' <> 'ready'
     OR (first_result#>>'{data,qr_deliverable}')::boolean IS NOT TRUE
     OR first_result#>>'{data,fulfillment_type}' <> 'service'
     OR first_result#>>'{notification,fulfillment_type}' <> 'service'
     OR (first_result#>>'{notification,store_order_handling_required}')::boolean IS NOT FALSE
     OR first_result#>>'{notification,action_required}' NOT LIKE '%NESSUNA GESTIONE ORDINE STORE%'
     OR (replay_result->>'created')::boolean IS NOT FALSE
     OR (replay_result->>'replayed')::boolean IS NOT TRUE
     OR (replay_result->>'should_notify_staff')::boolean IS NOT FALSE
     OR replay_result->'notification' <> 'null'::jsonb
     OR replay_result#>>'{data,id}' <> rid::text
     OR replay_result#>>'{data,qr_token}' <> first_result#>>'{data,qr_token}'
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND status='ready' AND ready_at IS NOT NULL AND fulfillment_type='service' AND reward_stock_reserved_qty=0 AND store_stock_reserved_qty=0) <> 1
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND points_delta=-200) <> 1
     OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id=rid) <> 0
     OR (SELECT count(*) FROM public.business_operation_idempotency WHERE idempotency_key='23000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_SERVICE';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_service;

-- Insufficient points: no redemption, debit, stock/order, or durable claim.
SAVEPOINT test_insufficient_points;
RESET ROLE;
INSERT INTO public.rewards_catalog(id,name,points_cost,is_active,stock_qty,reward_type,requires_store_variant,fulfillment_type)
VALUES ('00000000-0000-4000-8000-000000009101','PF08 SMART EXPENSIVE SERVICE',600,true,1,'club',false,'service');
SET LOCAL ROLE service_role;
DO $test$
DECLARE err text;
BEGIN
  BEGIN
    PERFORM public.redeem_moviback_reward(
      '00000000-0000-4000-8000-000000001002',
      '23000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000009101',NULL,NULL);
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_INSUFFICIENT_POINTS'
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009101') <> 1
     OR (SELECT count(*) FROM public.reward_redemptions WHERE reward_id='00000000-0000-4000-8000-000000009101') <> 0
     OR (SELECT count(*) FROM public.business_operation_idempotency WHERE idempotency_key='23000000-0000-4000-8000-000000000002') <> 0 THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_INSUFFICIENT_POINTS';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_insufficient_points;

-- STORE_PRODUCT: null-size variant, both reservations, one internal order/item, replay-safe.
SAVEPOINT test_store_product;
DO $test$
DECLARE first_result jsonb; replay_result jsonb; rid uuid; oid uuid;
BEGIN
  first_result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001',
    '23000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000009001',
    '00000000-0000-4000-8000-000000006003',NULL);
  replay_result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001',
    '23000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000009001',
    '00000000-0000-4000-8000-000000006003',NULL);
  rid := (first_result#>>'{data,id}')::uuid;
  oid := (first_result#>>'{data,store_order_id}')::uuid;

  IF oid IS NULL
     OR first_result#>>'{data,status}' <> 'requested'
     OR (first_result#>>'{data,qr_deliverable}')::boolean IS NOT FALSE
     OR first_result#>>'{data,fulfillment_type}' <> 'store_product'
     OR (first_result->>'should_notify_staff')::boolean IS NOT TRUE
     OR first_result#>>'{notification,product_name}' <> 'PF08 TEST PRODUCT C NULL SIZE'
     OR first_result#>>'{notification,variant_text}' NOT LIKE '%PF08 BLACK%'
     OR (replay_result->>'should_notify_staff')::boolean IS NOT FALSE
     OR replay_result->'notification' <> 'null'::jsonb
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009001') <> 3
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003') <> 2
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND fulfillment_type='store_product' AND reward_stock_reserved_qty=1 AND reserved_store_stock_id='00000000-0000-4000-8000-000000008003' AND store_stock_reserved_qty=1 AND reservations_released_at IS NULL AND points_refunded_at IS NULL) <> 1
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND points_delta=-400) <> 1
     OR (SELECT count(*) FROM public.store_orders WHERE id=oid AND related_redemption_id=rid AND status='pending' AND order_type='reward_redemption') <> 1
     OR (SELECT count(*) FROM public.store_order_items WHERE order_id=oid AND product_id='00000000-0000-4000-8000-000000005003' AND color_id='00000000-0000-4000-8000-000000006003' AND size_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_STORE_PRODUCT';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_store_product;

-- CUSTOM_PHYSICAL: explicit type creates custom fulfillment despite no category keyword; Store stock untouched.
SAVEPOINT test_custom;
DO $test$
DECLARE result jsonb; rid uuid; oid uuid;
BEGIN
  result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001',
    '23000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000009003',NULL,NULL);
  rid := (result#>>'{data,id}')::uuid;
  oid := (result#>>'{data,store_order_id}')::uuid;

  IF oid IS NULL
     OR result#>>'{data,fulfillment_type}' <> 'custom_physical'
     OR result#>>'{data,status}' <> 'requested'
     OR (result->>'should_notify_staff')::boolean IS NOT TRUE
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009003') <> 1
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003') <> 3
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND reward_stock_reserved_qty=1 AND store_stock_reserved_qty=0 AND reserved_store_stock_id IS NULL) <> 1
     OR (SELECT count(*) FROM public.store_order_items WHERE order_id=oid AND product_id IS NULL AND custom_product_name='PF08 SMART CUSTOM PHYSICAL') <> 1 THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_CUSTOM_PHYSICAL';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_custom;

-- PARTNER: category contains STORE deliberately; explicit type creates no Store mutation/order.
SAVEPOINT test_partner;
DO $test$
DECLARE result jsonb; rid uuid;
BEGIN
  result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001',
    '23000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000009004',NULL,NULL);
  rid := (result#>>'{data,id}')::uuid;

  IF result#>>'{data,fulfillment_type}' <> 'partner'
     OR result#>>'{data,status}' <> 'requested'
     OR result#>>'{data,store_order_id}' IS NOT NULL
     OR (result->>'should_notify_staff')::boolean IS NOT TRUE
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009004') <> 1
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003') <> 3
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND reward_stock_reserved_qty=1 AND store_stock_reserved_qty=0) <> 1
     OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id=rid) <> 0 THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_PARTNER';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_partner;

-- Conflicting key reuse mutates only the first intent.
SAVEPOINT test_conflict;
DO $test$
DECLARE err text;
BEGIN
  PERFORM public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001',
    '23000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000009002',NULL,NULL);
  BEGIN
    PERFORM public.redeem_moviback_reward(
      '00000000-0000-4000-8000-000000001001',
      '23000000-0000-4000-8000-000000000006',
      '00000000-0000-4000-8000-000000009004',NULL,NULL);
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_IDEMPOTENCY_CONFLICT'
     OR (SELECT count(*) FROM public.business_operation_idempotency WHERE idempotency_key='23000000-0000-4000-8000-000000000006') <> 1
     OR (SELECT count(*) FROM public.reward_redemptions WHERE reward_id IN ('00000000-0000-4000-8000-000000009002','00000000-0000-4000-8000-000000009004')) <> 2 THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_CONFLICT';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_conflict;

-- Same key is scoped independently per user.
SAVEPOINT test_cross_user;
DO $test$
BEGIN
  PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','23000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000009004',NULL,NULL);
  PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001002','23000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000009004',NULL,NULL);
  IF (SELECT count(*) FROM public.business_operation_idempotency WHERE idempotency_key='23000000-0000-4000-8000-000000000007') <> 2 THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_CROSS_USER';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_cross_user;

-- Unclassified reward is rejected and leaves no durable claim.
SAVEPOINT test_unclassified;
RESET ROLE;
INSERT INTO public.rewards_catalog(id,name,points_cost,is_active,stock_qty,reward_type,requires_store_variant)
VALUES ('00000000-0000-4000-8000-000000009102','PF08 SMART UNCLASSIFIED',100,true,1,'club',false);
SET LOCAL ROLE service_role;
DO $test$
DECLARE err text;
BEGIN
  BEGIN
    PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','23000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000009102',NULL,NULL);
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_FULFILLMENT_UNCLASSIFIED'
     OR (SELECT count(*) FROM public.business_operation_idempotency WHERE idempotency_key='23000000-0000-4000-8000-000000000008') <> 0
     OR (SELECT count(*) FROM public.reward_redemptions WHERE reward_id='00000000-0000-4000-8000-000000009102') <> 0 THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_UNCLASSIFIED';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_unclassified;

-- Forced item failure rolls back claim, redemption, debit, both stocks, and order.
SAVEPOINT test_forced_failure;
RESET ROLE;
CREATE FUNCTION pg_temp.pf08b2r2_force_item_failure() RETURNS trigger
LANGUAGE plpgsql AS $trigger$
BEGIN
  RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_TEST_FORCED_DB_FAILURE';
END $trigger$;
CREATE TRIGGER pf08b2r2_force_item_failure
BEFORE INSERT ON public.store_order_items
FOR EACH ROW EXECUTE FUNCTION pg_temp.pf08b2r2_force_item_failure();
SET LOCAL ROLE service_role;
DO $test$
DECLARE err text;
BEGIN
  BEGIN
    PERFORM public.redeem_moviback_reward(
      '00000000-0000-4000-8000-000000001001',
      '23000000-0000-4000-8000-000000000009',
      '00000000-0000-4000-8000-000000009001',
      '00000000-0000-4000-8000-000000006003',NULL);
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_TEST_FORCED_DB_FAILURE'
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009001') <> 4
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003') <> 3
     OR (SELECT count(*) FROM public.business_operation_idempotency WHERE idempotency_key='23000000-0000-4000-8000-000000000009') <> 0
     OR (SELECT count(*) FROM public.reward_redemptions WHERE fulfillment_type IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_FORCED_ROLLBACK';
  END IF;
END $test$;
RESET ROLE;
ROLLBACK TO SAVEPOINT test_forced_failure;

-- Partial unique index prevents a second reward order while preserving orderless history.
SAVEPOINT test_order_unique;
DO $test$
DECLARE violated boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.store_orders(user_id,status,pickup_club,payment_mode,total_euro,total_points,customer_name,order_type,related_redemption_id)
    VALUES ('00000000-0000-4000-8000-000000001001','pending','CENTALLO','points',0,400,'PF08 TEST USER A','reward_redemption','00000000-0000-4000-8000-00000000a002');
  EXCEPTION WHEN unique_violation THEN violated := true; END;
  IF NOT violated
     OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id='00000000-0000-4000-8000-00000000a002') <> 1
     OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id='00000000-0000-4000-8000-00000000a001') <> 0 THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_ORDER_UNIQUE';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_order_unique;

-- ACL metadata and actual anon execution prove server-only RPC access.
DO $test$
BEGIN
  IF has_function_privilege('public','public.redeem_moviback_reward(uuid,uuid,uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.redeem_moviback_reward(uuid,uuid,uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.redeem_moviback_reward(uuid,uuid,uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.redeem_moviback_reward(uuid,uuid,uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'PF08B2R2_ASSERT_ACL';
  END IF;
END $test$;

SET LOCAL ROLE anon;
DO $test$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','23000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000009002',NULL,NULL);
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'PF08B2R2_ASSERT_ANON_DENIED'; END IF;
END $test$;
RESET ROLE;

ROLLBACK;

SELECT
  (SELECT count(*) FROM public.reward_redemptions) AS redemptions_after_tests,
  (SELECT count(*) FROM public.loyalty_transactions) AS ledger_rows_after_tests,
  (SELECT count(*) FROM public.store_orders) AS orders_after_tests,
  (SELECT count(*) FROM public.store_order_items) AS items_after_tests,
  (SELECT count(*) FROM public.business_operation_idempotency) AS idempotency_after_tests;
