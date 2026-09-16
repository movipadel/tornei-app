\set ON_ERROR_STOP on

-- Focused PF-08B0 local test. All test rows are rolled back.
BEGIN;
SET LOCAL ROLE service_role;

-- 1. First scoped key is accepted and completed in the same transaction.
INSERT INTO public.business_operation_idempotency (
    id, operation, user_id, idempotency_key, request_hash
) VALUES (
    '00000000-0000-4000-8000-00000000d001',
    'store_checkout',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-00000000e001',
    repeat('a', 64)
);

UPDATE public.business_operation_idempotency
SET status = 'committed',
    result = '{"kind":"checkout","resource_id":"00000000-0000-4000-8000-00000000f001"}'::jsonb,
    completed_at = now()
WHERE operation = 'store_checkout'
  AND user_id = '00000000-0000-4000-8000-000000001001'
  AND idempotency_key = '00000000-0000-4000-8000-00000000e001';

-- 2. An identical replay cannot create a second scoped row.
INSERT INTO public.business_operation_idempotency (
    operation, user_id, idempotency_key, request_hash
) VALUES (
    'store_checkout',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-00000000e001',
    repeat('a', 64)
)
ON CONFLICT (operation, user_id, idempotency_key) DO NOTHING;

-- 3. A conflicting hash also cannot create a second scoped row; the caller
-- distinguishes conflict by comparing the persisted hash with its hash.
INSERT INTO public.business_operation_idempotency (
    operation, user_id, idempotency_key, request_hash
) VALUES (
    'store_checkout',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-00000000e001',
    repeat('b', 64)
)
ON CONFLICT (operation, user_id, idempotency_key) DO NOTHING;

-- 4. The same key is independent for another user.
INSERT INTO public.business_operation_idempotency (
    id, operation, user_id, idempotency_key, request_hash,
    status, result, completed_at
) VALUES (
    '00000000-0000-4000-8000-00000000d002',
    'store_checkout',
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-00000000e001',
    repeat('c', 64),
    'committed',
    '{"kind":"checkout","resource_id":"00000000-0000-4000-8000-00000000f002"}'::jsonb,
    now()
);

-- 5. The same key is independent for another operation.
INSERT INTO public.business_operation_idempotency (
    id, operation, user_id, idempotency_key, request_hash,
    status, result, completed_at
) VALUES (
    '00000000-0000-4000-8000-00000000d003',
    'moviback_redemption',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-00000000e001',
    repeat('d', 64),
    'committed',
    '{"kind":"redemption","resource_id":"00000000-0000-4000-8000-00000000f003"}'::jsonb,
    now()
);

-- 6. Rolled-back work leaves no claim or misleading committed result.
SAVEPOINT rollback_case;
INSERT INTO public.business_operation_idempotency (
    id, operation, user_id, idempotency_key, request_hash,
    status, result, completed_at
) VALUES (
    '00000000-0000-4000-8000-00000000d004',
    'store_checkout',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-00000000e004',
    repeat('e', 64),
    'committed',
    '{"kind":"checkout","resource_id":"00000000-0000-4000-8000-00000000f004"}'::jsonb,
    now()
);
ROLLBACK TO SAVEPOINT rollback_case;

-- A failed assertion causes division by zero and stops psql.
SELECT 1 / CASE WHEN (
    (SELECT count(*) FROM public.business_operation_idempotency) = 3
    AND (SELECT count(*) FROM public.business_operation_idempotency
         WHERE operation = 'store_checkout'
           AND user_id = '00000000-0000-4000-8000-000000001001'
           AND idempotency_key = '00000000-0000-4000-8000-00000000e001'
           AND request_hash = repeat('a', 64)
           AND status = 'committed'
           AND result->>'resource_id' = '00000000-0000-4000-8000-00000000f001') = 1
    AND (SELECT count(*) FROM public.business_operation_idempotency
         WHERE request_hash = repeat('b', 64)) = 0
    AND (SELECT count(*) FROM public.business_operation_idempotency
         WHERE user_id = '00000000-0000-4000-8000-000000001002') = 1
    AND (SELECT count(*) FROM public.business_operation_idempotency
         WHERE operation = 'moviback_redemption') = 1
    AND (SELECT count(*) FROM public.business_operation_idempotency
         WHERE idempotency_key = '00000000-0000-4000-8000-00000000e004') = 0
) THEN 1 ELSE 0 END AS all_assertions_passed;

ROLLBACK;

SELECT count(*) AS rows_after_test_rollback
FROM public.business_operation_idempotency;
