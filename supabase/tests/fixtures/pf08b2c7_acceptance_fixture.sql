\set ON_ERROR_STOP on
-- PF-08B2C7 LOCAL ACCEPTANCE FIXTURE ONLY. NEVER APPLY TO PRODUCTION.
-- Run only after pf08_reward_classification_fixture.sql and
-- pf08_reward_classification_candidate.sql on the unlinked local project.

BEGIN;

INSERT INTO public.staff_users (id, full_name, email, role, is_active)
VALUES
  ('00000000-0000-4000-8000-000000001101', 'PF08 LOCAL ADMIN', 'pf08-admin@example.invalid', 'admin', true),
  ('00000000-0000-4000-8000-000000001102', 'PF08 LOCAL STAFF', 'pf08-staff@example.invalid', 'staff', true)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active;

SELECT public.set_staff_password('00000000-0000-4000-8000-000000001101', 'PF08-local-only!');
SELECT public.set_staff_password('00000000-0000-4000-8000-000000001102', 'PF08-local-only!');

INSERT INTO public.loyalty_transactions (
  id, membership_id, type, source, points_delta, notes, created_at
) VALUES (
  '00000000-0000-4000-8000-000000003101',
  '00000000-0000-4000-8000-000000002001',
  'earn',
  'manual_adjustment',
  5000,
  'PF08B2C7 local acceptance credit.',
  '2026-09-18 08:00:00+00'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.rewards_catalog (
  id, name, description, category, points_cost, is_active, stock_qty,
  reward_type, store_product_id, requires_store_variant, fulfillment_type
) VALUES
  (
    '00000000-0000-4000-8000-000000009401',
    'PF08 C7 ONE IDENTITY AUTO',
    'Local false-flag single-identity acceptance reward.',
    'PF08 ACCEPTANCE',
    100,
    true,
    10,
    'club',
    '00000000-0000-4000-8000-000000005003',
    false,
    'store_product'
  ),
  (
    '00000000-0000-4000-8000-000000009402',
    'PF08 C7 LAST UNIT',
    'Local finite-stock acceptance reward.',
    'PF08 ACCEPTANCE',
    100,
    true,
    10,
    'club',
    '00000000-0000-4000-8000-000000005002',
    true,
    'store_product'
  ),
  (
    '00000000-0000-4000-8000-000000009403',
    'PF08 C7 EXPENSIVE SERVICE',
    'Local insufficient-points acceptance reward.',
    'PF08 ACCEPTANCE',
    10000,
    true,
    NULL,
    'club',
    NULL,
    false,
    'service'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  points_cost = EXCLUDED.points_cost,
  is_active = EXCLUDED.is_active,
  stock_qty = EXCLUDED.stock_qty,
  reward_type = EXCLUDED.reward_type,
  store_product_id = EXCLUDED.store_product_id,
  requires_store_variant = EXCLUDED.requires_store_variant,
  fulfillment_type = EXCLUDED.fulfillment_type;

DO $fixture_assert$
BEGIN
  IF (SELECT count(*) FROM public.staff_users WHERE id IN (
        '00000000-0000-4000-8000-000000001101',
        '00000000-0000-4000-8000-000000001102'
      ) AND is_active) <> 2
     OR (SELECT count(*) FROM public.rewards_catalog WHERE id IN (
        '00000000-0000-4000-8000-000000009401',
        '00000000-0000-4000-8000-000000009402',
        '00000000-0000-4000-8000-000000009403'
      ) AND is_active) <> 3 THEN
    RAISE EXCEPTION 'PF08B2C7_FIXTURE_POSTCONDITION';
  END IF;
END
$fixture_assert$;

COMMIT;
