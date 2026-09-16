\set ON_ERROR_STOP on

BEGIN;

UPDATE public.rewards_catalog
SET fulfillment_type = CASE id
  WHEN '00000000-0000-4000-8000-000000009001'::uuid THEN 'store_product'
  WHEN '00000000-0000-4000-8000-000000009002'::uuid THEN 'service'
END
WHERE id IN ('00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000009002');

INSERT INTO public.rewards_catalog(
  id,name,description,points_cost,is_active,stock_qty,reward_type,requires_store_variant,fulfillment_type
) VALUES
  ('00000000-0000-4000-8000-000000009301','PF08L CUSTOM','Preparare premio custom.',100,true,5,'club',false,'custom_physical'),
  ('00000000-0000-4000-8000-000000009302','PF08L PARTNER','Attivare partner.',100,true,5,'partner',false,'partner'),
  ('00000000-0000-4000-8000-000000009303','PF08L FINITE SERVICE','Erogare servizio.',100,true,5,'club',false,'service');

SET LOCAL ROLE service_role;

-- PROCESSING: requested -> processing and identical replay.
SAVEPOINT test_processing;
DO $test$
DECLARE request_result jsonb; first_result jsonb; replay_result jsonb; rid uuid; balance_before bigint; stock_before integer;
BEGIN
  request_result := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000009302',NULL,NULL);
  rid := (request_result#>>'{data,id}')::uuid;
  SELECT coalesce(sum(points_delta),0) INTO balance_before FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001';
  SELECT stock_qty INTO stock_before FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009302';
  first_result := public.process_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000002',rid);
  replay_result := public.process_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000002',rid);
  IF first_result#>>'{data,status}' <> 'processing'
     OR (first_result#>>'{data,applied}')::boolean IS NOT TRUE
     OR (first_result->>'should_notify_staff')::boolean IS NOT FALSE
     OR (replay_result->>'replayed')::boolean IS NOT TRUE
     OR (replay_result#>>'{data,applied}')::boolean IS NOT TRUE
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND status='processing' AND processing_at IS NOT NULL)<>1
     OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001')<>balance_before
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009302')<>stock_before THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_PROCESSING';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_processing;

-- PROCESSING rejects an immediately-ready service and terminal/backward states.
SAVEPOINT test_processing_invalid;
DO $test$
DECLARE request_result jsonb; rid uuid; err text;
BEGIN
  request_result := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000009303',NULL,NULL);
  rid := (request_result#>>'{data,id}')::uuid;
  BEGIN
    PERFORM public.process_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000004',rid);
    err:='NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM; END;
  IF err<>'PF08_INVALID_REDEMPTION_TRANSITION'
     OR (SELECT count(*) FROM public.business_operation_idempotency WHERE idempotency_key='25000000-0000-4000-8000-000000000004')<>0 THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_PROCESSING_INVALID';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_processing_invalid;

-- READY: physical fulfillment synchronizes, stock/debit remain unchanged, timestamp is stable on replay.
SAVEPOINT test_ready;
DO $test$
DECLARE request_result jsonb; ready_result jsonb; replay_result jsonb; rid uuid; oid uuid; ready_time timestamptz; reward_stock integer; store_stock integer; balance bigint;
BEGIN
  request_result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000006003',NULL);
  rid := (request_result#>>'{data,id}')::uuid;
  oid := (request_result#>>'{data,store_order_id}')::uuid;
  PERFORM public.process_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000006',rid);
  SELECT stock_qty INTO reward_stock FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009001';
  SELECT stock_qty INTO store_stock FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003';
  SELECT coalesce(sum(points_delta),0) INTO balance FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001';
  ready_result := public.ready_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000007',rid);
  SELECT ready_at INTO ready_time FROM public.reward_redemptions WHERE id=rid;
  replay_result := public.ready_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000007',rid);
  IF ready_result#>>'{data,status}'<>'ready'
     OR (ready_result#>>'{data,qr_deliverable}')::boolean IS NOT TRUE
     OR (replay_result->>'replayed')::boolean IS NOT TRUE
     OR (SELECT ready_at FROM public.reward_redemptions WHERE id=rid) IS DISTINCT FROM ready_time
     OR (SELECT count(*) FROM public.store_orders WHERE id=oid AND status='ready' AND ready_at IS NOT NULL)<>1
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009001')<>reward_stock
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003')<>store_stock
     OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001')<>balance THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_READY';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_ready;

-- SERVICE is already ready; the ready command resolves without rewriting ready_at.
SAVEPOINT test_service_ready;
DO $test$
DECLARE request_result jsonb; ready_result jsonb; rid uuid; original_ready_at timestamptz;
BEGIN
  request_result := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000009303',NULL,NULL);
  rid := (request_result#>>'{data,id}')::uuid;
  SELECT ready_at INTO original_ready_at FROM public.reward_redemptions WHERE id=rid;
  ready_result := public.ready_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000009',rid);
  IF (ready_result#>>'{data,applied}')::boolean IS NOT FALSE
     OR (ready_result#>>'{data,qr_deliverable}')::boolean IS NOT TRUE
     OR (SELECT ready_at FROM public.reward_redemptions WHERE id=rid) IS DISTINCT FROM original_ready_at THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_SERVICE_READY';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_service_ready;

-- DELIVERY: only ready can deliver; linked order synchronizes; no economic mutation; replay safe.
SAVEPOINT test_delivery;
DO $test$
DECLARE request_result jsonb; delivery_result jsonb; replay_result jsonb; rid uuid; oid uuid; delivered_time timestamptz; reward_stock integer; store_stock integer; balance bigint;
BEGIN
  request_result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000006003',NULL);
  rid := (request_result#>>'{data,id}')::uuid;
  oid := (request_result#>>'{data,store_order_id}')::uuid;
  PERFORM public.process_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000011',rid);
  PERFORM public.ready_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000012',rid);
  SELECT stock_qty INTO reward_stock FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009001';
  SELECT stock_qty INTO store_stock FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003';
  SELECT coalesce(sum(points_delta),0) INTO balance FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001';
  delivery_result := public.deliver_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000013',rid);
  SELECT delivered_at INTO delivered_time FROM public.reward_redemptions WHERE id=rid;
  replay_result := public.deliver_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000013',rid);
  IF delivery_result#>>'{data,status}'<>'delivered'
     OR (delivery_result#>>'{data,qr_deliverable}')::boolean IS NOT FALSE
     OR (replay_result->>'replayed')::boolean IS NOT TRUE
     OR (SELECT delivered_at FROM public.reward_redemptions WHERE id=rid) IS DISTINCT FROM delivered_time
     OR (SELECT count(*) FROM public.store_orders WHERE id=oid AND status='delivered' AND delivered_at IS NOT NULL)<>1
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009001')<>reward_stock
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003')<>store_stock
     OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001')<>balance THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_DELIVERY';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_delivery;

-- Requested and processing physical rewards cannot skip readiness.
SAVEPOINT test_delivery_forbidden;
DO $test$
DECLARE request_result jsonb; rid uuid; err_requested text; err_processing text;
BEGIN
  request_result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000014',
    '00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000006003',NULL);
  rid := (request_result#>>'{data,id}')::uuid;
  BEGIN
    PERFORM public.deliver_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000015',rid);
    err_requested:='NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err_requested:=SQLERRM; END;
  PERFORM public.process_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000016',rid);
  BEGIN
    PERFORM public.deliver_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000017',rid);
    err_processing:='NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err_processing:=SQLERRM; END;
  IF err_requested<>'PF08_INVALID_REDEMPTION_TRANSITION'
     OR err_processing<>'PF08_INVALID_REDEMPTION_TRANSITION'
     OR (SELECT status FROM public.reward_redemptions WHERE id=rid)<>'processing' THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_DELIVERY_FORBIDDEN';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_delivery_forbidden;

-- CANCEL requested STORE_PRODUCT: refund, both releases, order cancellation, replay exactly once.
SAVEPOINT test_cancel_requested;
DO $test$
DECLARE request_result jsonb; cancel_result jsonb; replay_result jsonb; rid uuid; oid uuid; reward_before integer; store_before integer; balance_before bigint; conflict_err text;
BEGIN
  SELECT stock_qty INTO reward_before FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009001';
  SELECT stock_qty INTO store_before FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003';
  SELECT coalesce(sum(points_delta),0) INTO balance_before FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001';
  request_result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000018',
    '00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000006003',NULL);
  rid := (request_result#>>'{data,id}')::uuid;
  oid := (request_result#>>'{data,store_order_id}')::uuid;
  cancel_result := public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000019',rid,'Richiesta annullata');
  replay_result := public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000019',rid,'Richiesta annullata');
  BEGIN
    PERFORM public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000019',rid,'Motivo differente');
    conflict_err:='NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN conflict_err:=SQLERRM; END;
  IF cancel_result#>>'{data,status}'<>'cancelled'
     OR (cancel_result#>>'{data,refunded_points}')::integer<>400
     OR (replay_result->>'replayed')::boolean IS NOT TRUE
     OR conflict_err<>'PF08_IDEMPOTENCY_CONFLICT'
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND status='cancelled' AND cancelled_at IS NOT NULL AND points_refunded_at IS NOT NULL AND reservations_released_at IS NOT NULL AND terminal_reason='Richiesta annullata')<>1
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND type='refund' AND source='reward_redemption' AND points_delta=400)<>1
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009001')<>reward_before
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003')<>store_before
     OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001')<>balance_before
     OR (SELECT count(*) FROM public.store_orders WHERE id=oid AND status='cancelled' AND cancelled_at IS NOT NULL)<>1 THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_CANCEL_REQUESTED';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_cancel_requested;

-- CANCEL processing PARTNER and ready SERVICE are safely reversible without Store order.
SAVEPOINT test_cancel_processing_ready;
DO $test$
DECLARE partner_result jsonb; service_result jsonb; partner_id uuid; service_id uuid;
BEGIN
  partner_result := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000009302',NULL,NULL);
  partner_id := (partner_result#>>'{data,id}')::uuid;
  PERFORM public.process_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000021',partner_id);
  PERFORM public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000022',partner_id,'Partner non disponibile');
  service_result := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000009303',NULL,NULL);
  service_id := (service_result#>>'{data,id}')::uuid;
  PERFORM public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000024',service_id,'Servizio annullato');
  IF (SELECT count(*) FROM public.reward_redemptions WHERE id IN (partner_id,service_id) AND status='cancelled' AND points_refunded_at IS NOT NULL AND reservations_released_at IS NOT NULL)<>2
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id IN (partner_id,service_id) AND type='refund')<>2 THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_CANCEL_PROCESSING_READY';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_cancel_processing_ready;

-- REJECT requested CUSTOM_PHYSICAL: one refund/release and cancelled internal order.
SAVEPOINT test_reject;
DO $test$
DECLARE request_result jsonb; reject_result jsonb; replay_result jsonb; rid uuid; oid uuid; stock_before integer;
BEGIN
  SELECT stock_qty INTO stock_before FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009301';
  request_result := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000009301',NULL,NULL);
  rid := (request_result#>>'{data,id}')::uuid;
  oid := (request_result#>>'{data,store_order_id}')::uuid;
  reject_result := public.reject_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000026',rid,'Richiesta non approvata');
  replay_result := public.reject_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000026',rid,'Richiesta non approvata');
  IF reject_result#>>'{data,status}'<>'rejected'
     OR (replay_result->>'replayed')::boolean IS NOT TRUE
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND type='refund' AND points_delta=100)<>1
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009301')<>stock_before
     OR (SELECT count(*) FROM public.store_orders WHERE id=oid AND status='cancelled')<>1
     OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND status='rejected' AND rejected_at IS NOT NULL AND terminal_reason='Richiesta non approvata')<>1 THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_REJECT';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_reject;

-- Supplier-committed/ready physical fulfillment cannot auto-cancel or reject.
SAVEPOINT test_supplier_boundary;
DO $test$
DECLARE request_result jsonb; rid uuid; cancel_err text; reject_err text;
BEGIN
  request_result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000027',
    '00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000006003',NULL);
  rid := (request_result#>>'{data,id}')::uuid;
  PERFORM public.process_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000028',rid);
  PERFORM public.ready_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000029',rid);
  BEGIN
    PERFORM public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000030',rid,'Troppo tardi');
    cancel_err:='NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN cancel_err:=SQLERRM; END;
  BEGIN
    PERFORM public.reject_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000031',rid,'Troppo tardi');
    reject_err:='NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN reject_err:=SQLERRM; END;
  IF cancel_err<>'PF08_SUPPLIER_COMMITMENT_REQUIRES_ADMIN'
     OR reject_err<>'PF08_SUPPLIER_COMMITMENT_REQUIRES_ADMIN'
     OR (SELECT status FROM public.reward_redemptions WHERE id=rid)<>'ready'
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND type='refund')<>0 THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_SUPPLIER_BOUNDARY';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_supplier_boundary;

-- Historical rows: orderless requested can be taken in charge, but reversal is not guessed; delivered is terminal; approved stays readable.
SAVEPOINT test_historical;
DO $test$
DECLARE legacy_err text; delivered_result jsonb;
BEGIN
  PERFORM public.process_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-00000000a001');
  BEGIN
    PERFORM public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000033','00000000-0000-4000-8000-00000000a001','Legacy senza evidenza');
    legacy_err:='NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN legacy_err:=SQLERRM; END;
  delivered_result := public.deliver_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000034','00000000-0000-4000-8000-00000000a002');
  IF legacy_err<>'PF08_LEGACY_REVERSAL_REQUIRES_ADMIN'
     OR (delivered_result#>>'{data,applied}')::boolean IS NOT FALSE
     OR (SELECT status FROM public.reward_redemptions WHERE id='00000000-0000-4000-8000-00000000a002')<>'delivered' THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_HISTORICAL';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_historical;

-- Mid-cancellation failure after refund insert rolls everything back.
SAVEPOINT test_cancel_rollback;
RESET ROLE;
CREATE FUNCTION pg_temp.pf08b2l_fail_reward_restore() RETURNS trigger LANGUAGE plpgsql AS $trigger$
BEGIN
  IF NEW.stock_qty > OLD.stock_qty THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_TEST_FORCED_CANCEL_FAILURE';
  END IF;
  RETURN NEW;
END $trigger$;
CREATE TRIGGER pf08b2l_fail_reward_restore BEFORE UPDATE ON public.rewards_catalog
FOR EACH ROW EXECUTE FUNCTION pg_temp.pf08b2l_fail_reward_restore();
SET LOCAL ROLE service_role;
DO $test$
DECLARE request_result jsonb; rid uuid; err text; stock_after_request integer;
BEGIN
  request_result := public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000035','00000000-0000-4000-8000-000000009303',NULL,NULL);
  rid := (request_result#>>'{data,id}')::uuid;
  SELECT stock_qty INTO stock_after_request FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009303';
  BEGIN
    PERFORM public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000036',rid,'Forzatura rollback');
    err:='NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM; END;
  IF err<>'PF08_TEST_FORCED_CANCEL_FAILURE'
     OR (SELECT status FROM public.reward_redemptions WHERE id=rid)<>'ready'
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND type='refund')<>0
     OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009303')<>stock_after_request
     OR (SELECT count(*) FROM public.business_operation_idempotency WHERE idempotency_key='25000000-0000-4000-8000-000000000036')<>0 THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_CANCEL_ROLLBACK';
  END IF;
END $test$;
RESET ROLE;
ROLLBACK TO SAVEPOINT test_cancel_rollback;

-- Delivery order-sync failure rolls back the redemption delivery too.
SAVEPOINT test_delivery_rollback;
RESET ROLE;
CREATE FUNCTION pg_temp.pf08b2l_fail_order_delivery() RETURNS trigger LANGUAGE plpgsql AS $trigger$
BEGIN
  IF NEW.status='delivered' THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_TEST_FORCED_DELIVERY_FAILURE';
  END IF;
  RETURN NEW;
END $trigger$;
CREATE TRIGGER pf08b2l_fail_order_delivery BEFORE UPDATE ON public.store_orders
FOR EACH ROW EXECUTE FUNCTION pg_temp.pf08b2l_fail_order_delivery();
SET LOCAL ROLE service_role;
DO $test$
DECLARE request_result jsonb; rid uuid; oid uuid; err text;
BEGIN
  request_result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001','25000000-0000-4000-8000-000000000037',
    '00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000006003',NULL);
  rid := (request_result#>>'{data,id}')::uuid;
  oid := (request_result#>>'{data,store_order_id}')::uuid;
  PERFORM public.process_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000038',rid);
  PERFORM public.ready_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000039',rid);
  BEGIN
    PERFORM public.deliver_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000040',rid);
    err:='NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM; END;
  IF err<>'PF08_TEST_FORCED_DELIVERY_FAILURE'
     OR (SELECT status FROM public.reward_redemptions WHERE id=rid)<>'ready'
     OR (SELECT status FROM public.store_orders WHERE id=oid)<>'ready'
     OR (SELECT count(*) FROM public.business_operation_idempotency WHERE idempotency_key='25000000-0000-4000-8000-000000000040')<>0 THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_DELIVERY_ROLLBACK';
  END IF;
END $test$;
RESET ROLE;
ROLLBACK TO SAVEPOINT test_delivery_rollback;

-- Server-only ACLs for all five commands.
DO $test$
BEGIN
  IF has_function_privilege('public','public.process_moviback_redemption(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.ready_moviback_redemption(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.deliver_moviback_redemption(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.cancel_moviback_redemption(uuid,uuid,uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.reject_moviback_redemption(uuid,uuid,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.process_moviback_redemption(uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.ready_moviback_redemption(uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.deliver_moviback_redemption(uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.cancel_moviback_redemption(uuid,uuid,uuid,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.reject_moviback_redemption(uuid,uuid,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'PF08B2L_ASSERT_ACL';
  END IF;
END $test$;

ROLLBACK;

SELECT
  (SELECT count(*) FROM public.reward_redemptions) AS redemptions_after_tests,
  (SELECT count(*) FROM public.loyalty_transactions) AS ledger_rows_after_tests,
  (SELECT count(*) FROM public.store_orders) AS orders_after_tests,
  (SELECT count(*) FROM public.business_operation_idempotency) AS idempotency_after_tests;
