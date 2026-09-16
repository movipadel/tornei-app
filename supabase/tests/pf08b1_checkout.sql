\set ON_ERROR_STOP on

-- PF-08B1 focused local integration tests. Every mutation is enclosed by the
-- outer transaction and each scenario returns to the deterministic seed state.
BEGIN;
SET LOCAL ROLE service_role;

-- 1. Normal single-item euro checkout; authoritative price and stock.
SAVEPOINT test_single_euro;
DO $test$
DECLARE r jsonb; oid uuid;
BEGIN
  r := public.checkout_store_order(
    '00000000-0000-4000-8000-000000001001', '11000000-0000-4000-8000-000000000001',
    ' centallo ', 'euro', 999, ' PF08 single ',
    jsonb_build_array(jsonb_build_object(
      'product_id','00000000-0000-4000-8000-000000005001',
      'color_id','00000000-0000-4000-8000-000000006001',
      'size_id','00000000-0000-4000-8000-000000007001','quantity',1)));
  oid := (r#>>'{data,order_id}')::uuid;
  IF (r->>'created')::boolean IS NOT TRUE
     OR (r#>>'{data,total_euro}')::numeric <> 25
     OR (r#>>'{data,total_points}')::integer <> 0
     OR (SELECT count(*) FROM public.store_order_items WHERE order_id=oid) <> 1
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> 9
     OR (SELECT count(*) FROM public.loyalty_transactions) <> 4 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_SINGLE_EURO';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_single_euro;

-- 2. Multi-item checkout including a null-size variant.
SAVEPOINT test_multi;
DO $test$
DECLARE r jsonb; oid uuid;
BEGIN
  r := public.checkout_store_order(
    '00000000-0000-4000-8000-000000001001', '11000000-0000-4000-8000-000000000002',
    'MANTA', 'euro', 0, NULL,
    jsonb_build_array(
      jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',1),
      jsonb_build_object('product_id','00000000-0000-4000-8000-000000005003','color_id','00000000-0000-4000-8000-000000006003','size_id',NULL,'quantity',2)));
  oid := (r#>>'{data,order_id}')::uuid;
  IF (r#>>'{data,total_euro}')::numeric <> 85
     OR (SELECT count(*) FROM public.store_order_items WHERE order_id=oid) <> 2
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> 9
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003') <> 1 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_MULTI';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_multi;

-- 3/4. Duplicate lines aggregate into one quantity-10 item and consume stock 10 once.
SAVEPOINT test_duplicate_aggregate;
DO $test$
DECLARE r jsonb; oid uuid;
BEGIN
  r := public.checkout_store_order(
    '00000000-0000-4000-8000-000000001001', '11000000-0000-4000-8000-000000000003',
    'SALUZZO', 'euro', 0, NULL,
    jsonb_build_array(
      jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',4),
      jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',6)));
  oid := (r#>>'{data,order_id}')::uuid;
  IF (SELECT count(*) FROM public.store_order_items WHERE order_id=oid) <> 1
     OR (SELECT quantity FROM public.store_order_items WHERE order_id=oid) <> 10
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> 0 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_DUPLICATE_AGGREGATE';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_duplicate_aggregate;

-- 5/6. Last unit succeeds once; the next key fails without partial state.
SAVEPOINT test_last_unit;
DO $test$
DECLARE r jsonb; err text; before_orders bigint; before_items bigint; before_ledger bigint;
BEGIN
  SELECT count(*) INTO before_orders FROM public.store_orders WHERE order_type='catalog';
  SELECT count(*) INTO before_items FROM public.store_order_items;
  SELECT count(*) INTO before_ledger FROM public.loyalty_transactions;
  r := public.checkout_store_order(
    '00000000-0000-4000-8000-000000001001', '11000000-0000-4000-8000-000000000004',
    'REVELLO', 'euro', 0, NULL,
    jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005002','color_id','00000000-0000-4000-8000-000000006002','size_id','00000000-0000-4000-8000-000000007002','quantity',1)));
  BEGIN
    PERFORM public.checkout_store_order(
      '00000000-0000-4000-8000-000000001002', '11000000-0000-4000-8000-000000000005',
      'REVELLO', 'euro', 0, NULL,
      jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005002','color_id','00000000-0000-4000-8000-000000006002','size_id','00000000-0000-4000-8000-000000007002','quantity',1)));
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM;
  END;
  IF err <> 'PF08_INSUFFICIENT_STOCK'
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008002') <> 0
     OR (SELECT count(*) FROM public.store_orders WHERE order_type='catalog') <> before_orders + 1
     OR (SELECT count(*) FROM public.store_order_items) <> before_items + 1
     OR (SELECT count(*) FROM public.loyalty_transactions) <> before_ledger
     OR (SELECT count(*) FROM public.business_operation_idempotency) <> 1 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_LAST_UNIT';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_last_unit;

-- 7. Sufficient-points checkout locks membership, debits once, and totals correctly.
SAVEPOINT test_points_success;
DO $test$
DECLARE r jsonb; oid uuid;
BEGIN
  r := public.checkout_store_order(
    '00000000-0000-4000-8000-000000001001', '11000000-0000-4000-8000-000000000006',
    'CENTALLO', 'points', 0, NULL,
    jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',1)));
  oid := (r#>>'{data,order_id}')::uuid;
  IF (r#>>'{data,total_euro}')::numeric <> 0
     OR (r#>>'{data,total_points}')::integer <> 250
     OR (SELECT sum(points_delta) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> 1750
     OR (SELECT count(*) FROM public.loyalty_transactions WHERE notes='Ordine Store MOVI: '||oid::text AND type='redeem' AND source='manual_adjustment' AND points_delta=-250) <> 1 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_POINTS_SUCCESS';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_points_success;

-- Mixed payment preserves current clamp and €0.10-per-point semantics.
SAVEPOINT test_mixed;
DO $test$
DECLARE r jsonb;
BEGIN
  r := public.checkout_store_order(
    '00000000-0000-4000-8000-000000001001', '11000000-0000-4000-8000-000000000007',
    'CENTALLO', 'mixed', 100, NULL,
    jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',1)));
  IF (r#>>'{data,total_euro}')::numeric <> 15
     OR (r#>>'{data,total_points}')::integer <> 100
     OR (SELECT sum(points_delta) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> 1900 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_MIXED';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_mixed;

-- 8. Insufficient points fails with every business count/value unchanged.
SAVEPOINT test_points_failure;
DO $test$
DECLARE err text;
BEGIN
  BEGIN
    PERFORM public.checkout_store_order(
      '00000000-0000-4000-8000-000000001002', '11000000-0000-4000-8000-000000000008',
      'CENTALLO', 'points', 0, NULL,
      jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',3)));
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM;
  END;
  IF err <> 'PF08_INSUFFICIENT_POINTS'
     OR (SELECT count(*) FROM public.store_orders WHERE order_type='catalog') <> 0
     OR (SELECT count(*) FROM public.store_order_items) <> 1
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> 10
     OR (SELECT sum(points_delta) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002002') <> 500
     OR (SELECT count(*) FROM public.business_operation_idempotency) <> 0 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_POINTS_FAILURE';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_points_failure;

-- 9/10/11. Invalid product, color/product, and size/product relations.
SAVEPOINT test_invalid_catalog;
DO $test$
DECLARE err_product text; err_color text; err_size text;
BEGIN
  BEGIN
    PERFORM public.checkout_store_order('00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000009','CENTALLO','euro',0,NULL,
      jsonb_build_array(jsonb_build_object('product_id','ffffffff-ffff-4fff-8fff-ffffffffffff','color_id','00000000-0000-4000-8000-000000006001','size_id',NULL,'quantity',1)));
    err_product := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err_product := SQLERRM; END;
  BEGIN
    PERFORM public.checkout_store_order('00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000010','CENTALLO','euro',0,NULL,
      jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006002','size_id',NULL,'quantity',1)));
    err_color := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err_color := SQLERRM; END;
  BEGIN
    PERFORM public.checkout_store_order('00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000011','CENTALLO','euro',0,NULL,
      jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007002','quantity',1)));
    err_size := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err_size := SQLERRM; END;
  IF err_product <> 'PF08_INVALID_PRODUCT' OR err_color <> 'PF08_INVALID_COLOR' OR err_size <> 'PF08_INVALID_SIZE'
     OR (SELECT count(*) FROM public.store_orders WHERE order_type='catalog') <> 0
     OR (SELECT count(*) FROM public.business_operation_idempotency) <> 0 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_INVALID_CATALOG';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_invalid_catalog;

-- 12. NULL-size stock path.
SAVEPOINT test_null_size;
DO $test$
DECLARE r jsonb; oid uuid;
BEGIN
  r := public.checkout_store_order(
    '00000000-0000-4000-8000-000000001001', '11000000-0000-4000-8000-000000000012',
    'COSTIGLIOLE', 'euro', 0, NULL,
    jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005003','color_id','00000000-0000-4000-8000-000000006003','size_id',NULL,'quantity',1)));
  oid := (r#>>'{data,order_id}')::uuid;
  IF (SELECT size_id FROM public.store_order_items WHERE order_id=oid) IS NOT NULL
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003') <> 2 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_NULL_SIZE';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_null_size;

-- 13. Identical replay returns the same business result and no second mutation.
SAVEPOINT test_replay;
DO $test$
DECLARE first_result jsonb; replay_result jsonb;
BEGIN
  first_result := public.checkout_store_order(
    '00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000013','CENTALLO','euro',0,'same',
    jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',1)));
  replay_result := public.checkout_store_order(
    '00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000013','CENTALLO','euro',0,'same',
    jsonb_build_array(jsonb_build_object('quantity',1,'size_id','00000000-0000-4000-8000-000000007001','color_id','00000000-0000-4000-8000-000000006001','product_id','00000000-0000-4000-8000-000000005001')));
  IF (first_result#>>'{data,order_id}') <> (replay_result#>>'{data,order_id}')
     OR (replay_result->>'replayed')::boolean IS NOT TRUE
     OR (replay_result->>'created')::boolean IS NOT FALSE
     OR (SELECT count(*) FROM public.store_orders WHERE order_type='catalog') <> 1
     OR (SELECT count(*) FROM public.store_order_items WHERE order_id=(first_result#>>'{data,order_id}')::uuid) <> 1
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> 9
     OR (SELECT count(*) FROM public.business_operation_idempotency) <> 1 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_REPLAY';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_replay;

-- 14. Same scoped key with a different normalized payload conflicts without mutation.
SAVEPOINT test_conflict;
DO $test$
DECLARE first_result jsonb; err text;
BEGIN
  first_result := public.checkout_store_order(
    '00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000014','CENTALLO','euro',0,NULL,
    jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',1)));
  BEGIN
    PERFORM public.checkout_store_order(
      '00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000014','CENTALLO','euro',0,NULL,
      jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',2)));
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_IDEMPOTENCY_CONFLICT'
     OR (SELECT count(*) FROM public.store_orders WHERE order_type='catalog') <> 1
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> 9
     OR (SELECT count(*) FROM public.business_operation_idempotency) <> 1 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_CONFLICT';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_conflict;

-- 15. Same key for different users is independent.
SAVEPOINT test_different_users;
DO $test$
BEGIN
  PERFORM public.checkout_store_order('00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000015','CENTALLO','euro',0,NULL,
    jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',1)));
  PERFORM public.checkout_store_order('00000000-0000-4000-8000-000000001002','11000000-0000-4000-8000-000000000015','CENTALLO','euro',0,NULL,
    jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',1)));
  IF (SELECT count(*) FROM public.store_orders WHERE order_type='catalog') <> 2
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> 8
     OR (SELECT count(*) FROM public.business_operation_idempotency) <> 2 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_DIFFERENT_USERS';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_different_users;

-- 16. Different keys with identical intent are distinct legitimate checkouts.
SAVEPOINT test_different_keys;
DO $test$
BEGIN
  PERFORM public.checkout_store_order('00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000016','CENTALLO','euro',0,NULL,
    jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',1)));
  PERFORM public.checkout_store_order('00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000017','CENTALLO','euro',0,NULL,
    jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',1)));
  IF (SELECT count(*) FROM public.store_orders WHERE order_type='catalog') <> 2
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> 8
     OR (SELECT count(*) FROM public.business_operation_idempotency) <> 2 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_DIFFERENT_KEYS';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_different_keys;

-- Additional error-contract coverage: empty cart, invalid club/payment, and missing membership.
SAVEPOINT test_error_contract;
DO $test$
DECLARE e_empty text; e_club text; e_payment text; e_membership text;
BEGIN
  BEGIN PERFORM public.checkout_store_order('00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000018','CENTALLO','euro',0,NULL,'[]'::jsonb);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN e_empty:=SQLERRM; END;
  BEGIN PERFORM public.checkout_store_order('00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000019','INVALID','euro',0,NULL,jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','quantity',1)));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN e_club:=SQLERRM; END;
  BEGIN PERFORM public.checkout_store_order('00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000020','CENTALLO','cash',0,NULL,jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','quantity',1)));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN e_payment:=SQLERRM; END;
  INSERT INTO public.users(id,full_name,phone,email,gender) VALUES ('00000000-0000-4000-8000-000000001003','PF08 TEST USER C','+390000000803','pf08-user-c@example.invalid','M');
  BEGIN PERFORM public.checkout_store_order('00000000-0000-4000-8000-000000001003','11000000-0000-4000-8000-000000000021','CENTALLO','points',0,NULL,jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',1)));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN e_membership:=SQLERRM; END;
  IF e_empty<>'PF08_EMPTY_CART' OR e_club<>'PF08_INVALID_PICKUP_CLUB' OR e_payment<>'PF08_INVALID_PAYMENT_MODE' OR e_membership<>'PF08_MEMBERSHIP_REQUIRED'
     OR (SELECT count(*) FROM public.store_orders WHERE order_type='catalog')<>0
     OR (SELECT count(*) FROM public.business_operation_idempotency)<>0 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_ERROR_CONTRACT';
  END IF;
END $test$;
ROLLBACK TO SAVEPOINT test_error_contract;

-- 17. A deliberate item-insert database exception rolls back order/claim/stock/debit.
SAVEPOINT test_forced_db_failure;
RESET ROLE;
CREATE FUNCTION pg_temp.pf08b1_force_item_failure() RETURNS trigger
LANGUAGE plpgsql AS $trigger$
BEGIN
  RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_TEST_FORCED_DB_FAILURE';
END $trigger$;
CREATE TRIGGER pf08b1_force_item_failure
BEFORE INSERT ON public.store_order_items
FOR EACH ROW EXECUTE FUNCTION pg_temp.pf08b1_force_item_failure();
SET LOCAL ROLE service_role;
DO $test$
DECLARE err text;
BEGIN
  BEGIN
    PERFORM public.checkout_store_order(
      '00000000-0000-4000-8000-000000001001','11000000-0000-4000-8000-000000000022','CENTALLO','points',0,NULL,
      jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000005001','color_id','00000000-0000-4000-8000-000000006001','size_id','00000000-0000-4000-8000-000000007001','quantity',1)));
    err := 'NO_ERROR';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err := SQLERRM; END;
  IF err <> 'PF08_TEST_FORCED_DB_FAILURE'
     OR (SELECT count(*) FROM public.store_orders WHERE order_type='catalog') <> 0
     OR (SELECT count(*) FROM public.store_order_items) <> 1
     OR (SELECT count(*) FROM public.loyalty_transactions) <> 4
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') <> 10
     OR (SELECT count(*) FROM public.business_operation_idempotency) <> 0 THEN
    RAISE EXCEPTION 'PF08B1_ASSERT_FORCED_FAILURE';
  END IF;
END $test$;
RESET ROLE;
ROLLBACK TO SAVEPOINT test_forced_db_failure;

ROLLBACK;

SELECT
  (SELECT count(*) FROM public.store_orders WHERE order_type='catalog') AS catalog_orders_after_tests,
  (SELECT count(*) FROM public.business_operation_idempotency) AS idempotency_rows_after_tests,
  (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') AS stock_10_after_tests,
  (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008002') AS stock_1_after_tests,
  (SELECT sum(points_delta) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') AS user_a_balance_after_tests,
  (SELECT sum(points_delta) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002002') AS user_b_balance_after_tests;
