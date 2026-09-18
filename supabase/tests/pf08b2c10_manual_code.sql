\set ON_ERROR_STOP on

BEGIN;

-- Generator contract: unbiased alphabet, bounded collision retry, normalized
-- representation and a large sample without duplicates.
DO $test$
DECLARE
    v_definition text;
    v_count integer;
BEGIN
    SELECT pg_get_functiondef('public.generate_pf08_reward_manual_code()'::regprocedure)
    INTO v_definition;

    IF position('FOR v_attempt IN 1..10 LOOP' IN v_definition) = 0
       OR position('pg_advisory_xact_lock' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'PF08B2C10_ASSERT_COLLISION_RETRY';
    END IF;

    CREATE TEMP TABLE pf08_manual_code_sample(code text PRIMARY KEY) ON COMMIT DROP;
    INSERT INTO pf08_manual_code_sample(code)
    SELECT public.generate_pf08_reward_manual_code()
    FROM generate_series(1, 1000);

    SELECT count(*) INTO v_count
    FROM pf08_manual_code_sample
    WHERE code ~ '^[2-9A-HJKMNP-Z]{8}$';

    IF v_count <> 1000 THEN
        RAISE EXCEPTION 'PF08B2C10_ASSERT_CODE_FORMAT_OR_UNIQUENESS';
    END IF;
END $test$;

-- Recreate a pre-migration mixed-state set inside a savepoint and exercise the
-- exact backfill assignment. No business state may change.
SAVEPOINT backfill_test;

ALTER TABLE public.reward_redemptions
    DISABLE TRIGGER reward_redemptions_manual_code_immutable;
ALTER TABLE public.reward_redemptions
    ALTER COLUMN manual_code DROP DEFAULT;
ALTER TABLE public.reward_redemptions
    DROP CONSTRAINT reward_redemptions_manual_code_with_qr_check;

INSERT INTO public.reward_redemptions(
    id, membership_id, reward_id, points_cost, status, qr_token,
    fulfillment_type, ready_at, delivered_at, cancelled_at, rejected_at,
    manual_code
) VALUES
    ('41000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000009002',200,'delivered','PF08-BACKFILL-DELIVERED',NULL,NULL,now(),NULL,NULL,NULL),
    ('41000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000009002',200,'requested','PF08-BACKFILL-REQUESTED',NULL,NULL,NULL,NULL,NULL,NULL),
    ('41000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000009002',200,'ready','PF08-BACKFILL-SERVICE','service',now(),NULL,NULL,NULL,NULL),
    ('41000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000009001',400,'requested','PF08-BACKFILL-PHYSICAL','store_product',NULL,NULL,NULL,NULL,NULL),
    ('41000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000009002',200,'cancelled','PF08-BACKFILL-CANCELLED',NULL,NULL,NULL,now(),NULL,NULL),
    ('41000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000009002',200,'rejected','PF08-BACKFILL-REJECTED',NULL,NULL,NULL,NULL,now(),NULL);

CREATE TEMP TABLE pf08_backfill_before AS
SELECT
    (SELECT count(*) FROM public.loyalty_transactions) AS ledger_count,
    (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions) AS ledger_sum,
    (SELECT count(*) FROM public.store_orders) AS order_count,
    (SELECT count(*) FROM public.store_order_items) AS item_count,
    (SELECT coalesce(sum(stock_qty),0) FROM public.rewards_catalog WHERE stock_qty IS NOT NULL) AS reward_stock,
    (SELECT coalesce(sum(stock_qty),0) FROM public.store_product_stock WHERE stock_qty IS NOT NULL) AS store_stock;

UPDATE public.reward_redemptions
SET manual_code = public.generate_pf08_reward_manual_code()
WHERE qr_token IS NOT NULL
  AND manual_code IS NULL;

DO $test$
DECLARE
    v_before record;
BEGIN
    SELECT * INTO v_before FROM pf08_backfill_before;

    IF (SELECT count(*) FROM public.reward_redemptions WHERE id::text LIKE '41000000-%' AND manual_code ~ '^[2-9A-HJKMNP-Z]{8}$') <> 6
       OR (SELECT count(DISTINCT manual_code) FROM public.reward_redemptions WHERE id::text LIKE '41000000-%') <> 6
       OR (SELECT count(*) FROM public.reward_redemptions WHERE id='41000000-0000-4000-8000-000000000001' AND status='delivered') <> 1
       OR (SELECT count(*) FROM public.reward_redemptions WHERE id='41000000-0000-4000-8000-000000000002' AND status='requested') <> 1
       OR (SELECT count(*) FROM public.reward_redemptions WHERE id='41000000-0000-4000-8000-000000000003' AND status='ready' AND fulfillment_type='service' AND ready_at IS NOT NULL) <> 1
       OR (SELECT count(*) FROM public.reward_redemptions WHERE id='41000000-0000-4000-8000-000000000004' AND status='requested' AND fulfillment_type='store_product') <> 1
       OR (SELECT count(*) FROM public.reward_redemptions WHERE id='41000000-0000-4000-8000-000000000005' AND status='cancelled') <> 1
       OR (SELECT count(*) FROM public.reward_redemptions WHERE id='41000000-0000-4000-8000-000000000006' AND status='rejected') <> 1
       OR (SELECT count(*) FROM public.loyalty_transactions) <> v_before.ledger_count
       OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions) <> v_before.ledger_sum
       OR (SELECT count(*) FROM public.store_orders) <> v_before.order_count
       OR (SELECT count(*) FROM public.store_order_items) <> v_before.item_count
       OR (SELECT coalesce(sum(stock_qty),0) FROM public.rewards_catalog WHERE stock_qty IS NOT NULL) <> v_before.reward_stock
       OR (SELECT coalesce(sum(stock_qty),0) FROM public.store_product_stock WHERE stock_qty IS NOT NULL) <> v_before.store_stock THEN
        RAISE EXCEPTION 'PF08B2C10_ASSERT_BACKFILL_INVARIANTS';
    END IF;
END $test$;

ROLLBACK TO SAVEPOINT backfill_test;

UPDATE public.rewards_catalog
SET fulfillment_type = CASE id
    WHEN '00000000-0000-4000-8000-000000009001'::uuid THEN 'store_product'
    WHEN '00000000-0000-4000-8000-000000009002'::uuid THEN 'service'
END
WHERE id IN (
    '00000000-0000-4000-8000-000000009001',
    '00000000-0000-4000-8000-000000009002'
);

SET LOCAL ROLE service_role;

-- SERVICE is ready immediately, exposes both credentials, delivers by the
-- lifecycle RPC and remains point/idempotency safe on replay.
SAVEPOINT service_test;
DO $test$
DECLARE
    v_first jsonb;
    v_replay jsonb;
    v_delivery jsonb;
    v_delivery_replay jsonb;
    v_redemption_id uuid;
    v_manual_code text;
    v_balance_after_redeem bigint;
BEGIN
    v_first := public.redeem_moviback_reward(
        '00000000-0000-4000-8000-000000001001',
        '42000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000009002',
        NULL,
        NULL
    );
    v_redemption_id := (v_first #>> '{data,id}')::uuid;
    v_manual_code := v_first #>> '{data,manual_code}';

    IF v_first #>> '{data,status}' <> 'ready'
       OR (v_first #>> '{data,qr_deliverable}')::boolean IS NOT TRUE
       OR (v_first #>> '{data,manual_code_deliverable}')::boolean IS NOT TRUE
       OR v_manual_code !~ '^[2-9A-HJKMNP-Z]{8}$'
       OR (SELECT count(*) FROM public.reward_redemptions WHERE id=v_redemption_id AND status='ready' AND ready_at IS NOT NULL AND manual_code=v_manual_code) <> 1 THEN
        RAISE EXCEPTION 'PF08B2C10_ASSERT_SERVICE_IMMEDIATE_READY';
    END IF;

    SELECT coalesce(sum(points_delta),0) INTO v_balance_after_redeem
    FROM public.loyalty_transactions
    WHERE membership_id='00000000-0000-4000-8000-000000002001';

    v_replay := public.redeem_moviback_reward(
        '00000000-0000-4000-8000-000000001001',
        '42000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000009002',
        NULL,
        NULL
    );

    IF (v_replay->>'replayed')::boolean IS NOT TRUE
       OR v_replay #>> '{data,manual_code}' <> v_manual_code
       OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> v_balance_after_redeem THEN
        RAISE EXCEPTION 'PF08B2C10_ASSERT_SERVICE_REPLAY';
    END IF;

    v_delivery := public.deliver_moviback_redemption(
        'aaaaaaaa-0000-4000-8000-000000000001',
        '42000000-0000-4000-8000-000000000002',
        v_redemption_id
    );
    v_delivery_replay := public.deliver_moviback_redemption(
        'aaaaaaaa-0000-4000-8000-000000000001',
        '42000000-0000-4000-8000-000000000002',
        v_redemption_id
    );

    IF v_delivery #>> '{data,status}' <> 'delivered'
       OR (v_delivery_replay->>'replayed')::boolean IS NOT TRUE
       OR (SELECT count(*) FROM public.reward_redemptions WHERE id=v_redemption_id AND status='delivered' AND delivered_at IS NOT NULL) <> 1
       OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> v_balance_after_redeem THEN
        RAISE EXCEPTION 'PF08B2C10_ASSERT_SERVICE_DELIVERY';
    END IF;
END $test$;
ROLLBACK TO SAVEPOINT service_test;

-- Physical reward remains requested, rejects early delivery, becomes usable at
-- ready and never double-mutates points or stock.
SAVEPOINT physical_test;
DO $test$
DECLARE
    v_request jsonb;
    v_redemption_id uuid;
    v_manual_code text;
    v_error text;
    v_balance bigint;
    v_stock integer;
BEGIN
    v_request := public.redeem_moviback_reward(
        '00000000-0000-4000-8000-000000001001',
        '42000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000009001',
        '00000000-0000-4000-8000-000000006003',
        NULL
    );
    v_redemption_id := (v_request #>> '{data,id}')::uuid;
    v_manual_code := v_request #>> '{data,manual_code}';

    IF v_request #>> '{data,status}' <> 'requested'
       OR (v_request #>> '{data,qr_deliverable}')::boolean IS TRUE
       OR (v_request #>> '{data,manual_code_deliverable}')::boolean IS TRUE
       OR v_manual_code !~ '^[2-9A-HJKMNP-Z]{8}$'
       OR (SELECT count(*) FROM public.reward_redemptions WHERE id=v_redemption_id AND qr_token IS NOT NULL AND manual_code=v_manual_code) <> 1 THEN
        RAISE EXCEPTION 'PF08B2C10_ASSERT_PHYSICAL_REQUESTED';
    END IF;

    BEGIN
        PERFORM public.deliver_moviback_redemption(
            'aaaaaaaa-0000-4000-8000-000000000001',
            '42000000-0000-4000-8000-000000000004',
            v_redemption_id
        );
        v_error := 'NO_ERROR';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
        v_error := SQLERRM;
    END;

    IF v_error <> 'PF08_INVALID_REDEMPTION_TRANSITION' THEN
        RAISE EXCEPTION 'PF08B2C10_ASSERT_PHYSICAL_EARLY_DELIVERY';
    END IF;

    PERFORM public.process_moviback_redemption(
        'aaaaaaaa-0000-4000-8000-000000000001',
        '42000000-0000-4000-8000-000000000005',
        v_redemption_id
    );
    PERFORM public.ready_moviback_redemption(
        'aaaaaaaa-0000-4000-8000-000000000001',
        '42000000-0000-4000-8000-000000000006',
        v_redemption_id
    );

    SELECT coalesce(sum(points_delta),0) INTO v_balance
    FROM public.loyalty_transactions
    WHERE membership_id='00000000-0000-4000-8000-000000002001';
    SELECT stock_qty INTO v_stock
    FROM public.store_product_stock
    WHERE id='00000000-0000-4000-8000-000000008003';

    PERFORM public.deliver_moviback_redemption(
        'aaaaaaaa-0000-4000-8000-000000000001',
        '42000000-0000-4000-8000-000000000007',
        v_redemption_id
    );
    PERFORM public.deliver_moviback_redemption(
        'aaaaaaaa-0000-4000-8000-000000000001',
        '42000000-0000-4000-8000-000000000007',
        v_redemption_id
    );

    IF (SELECT count(*) FROM public.reward_redemptions WHERE id=v_redemption_id AND status='delivered') <> 1
       OR (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='00000000-0000-4000-8000-000000002001') <> v_balance
       OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003') <> v_stock
       OR (SELECT count(*) FROM public.reward_redemptions WHERE qr_token=(SELECT qr_token FROM public.reward_redemptions WHERE id=v_redemption_id) AND manual_code=v_manual_code) <> 1 THEN
        RAISE EXCEPTION 'PF08B2C10_ASSERT_PHYSICAL_DELIVERY';
    END IF;
END $test$;
ROLLBACK TO SAVEPOINT physical_test;

RESET ROLE;

-- Codes cannot be altered after creation.
DO $test$
DECLARE
    v_error text;
BEGIN
    BEGIN
        UPDATE public.reward_redemptions
        SET manual_code='23456789'
        WHERE id='00000000-0000-4000-8000-00000000a001';
        v_error := 'NO_ERROR';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
        v_error := SQLERRM;
    END;

    IF v_error <> 'PF08_MANUAL_CODE_IMMUTABLE' THEN
        RAISE EXCEPTION 'PF08B2C10_ASSERT_IMMUTABLE';
    END IF;
END $test$;

ROLLBACK;

\echo 'PF-08B2C10 manual-code, service-ready and delivery tests passed'
