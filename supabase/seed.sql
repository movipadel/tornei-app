-- PF-08L6 local-only deterministic fixtures.
-- Synthetic identities use reserved example.invalid addresses and unmistakable PF08 labels.
-- This file is intended only for `npx supabase db reset` against the unlinked local project.

BEGIN;

INSERT INTO public.users (
  id, full_name, phone, email, gender, created_at, updated_at,
  privacy_accepted_at, terms_accepted_at, marketing_accepted
) VALUES
  (
    '00000000-0000-4000-8000-000000001001',
    'PF08 TEST USER A',
    '+390000000801',
    'pf08-user-a@example.invalid',
    'M',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    false
  ),
  (
    '00000000-0000-4000-8000-000000001002',
    'PF08 TEST USER B',
    '+390000000802',
    'pf08-user-b@example.invalid',
    'F',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    false
  );

INSERT INTO public.loyalty_memberships (
  id, user_id, status, membership_code, tax_code, approved_at,
  created_at, updated_at, fee_points, fee_paid, has_existing_membership
) VALUES
  (
    '00000000-0000-4000-8000-000000002001',
    '00000000-0000-4000-8000-000000001001',
    'approved',
    'PF08-LOCAL-MEMBER-A',
    'PF08TESTTAXCODEA',
    '2026-01-01 08:05:00+00',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:05:00+00',
    0,
    true,
    false
  ),
  (
    '00000000-0000-4000-8000-000000002002',
    '00000000-0000-4000-8000-000000001002',
    'approved',
    'PF08-LOCAL-MEMBER-B',
    'PF08TESTTAXCODEB',
    '2026-01-01 08:05:00+00',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:05:00+00',
    0,
    true,
    false
  );

INSERT INTO public.store_categories (
  id, name, slug, is_active, sort_order, created_at
) VALUES (
  '00000000-0000-4000-8000-000000004001',
  'PF08 TEST CATEGORY',
  'pf08-test-category',
  true,
  800,
  '2026-01-01 08:10:00+00'
);

INSERT INTO public.store_lines (
  id, name, slug, is_active, sort_order, created_at
) VALUES (
  '00000000-0000-4000-8000-000000004101',
  'PF08 TEST LINE',
  'pf08-test-line',
  true,
  800,
  '2026-01-01 08:10:00+00'
);

INSERT INTO public.store_products (
  id, category_id, line_id, name, description,
  base_price_euro, base_price_points,
  allow_euro, allow_points, allow_mixed,
  is_active, sort_order, created_at, updated_at
) VALUES
  (
    '00000000-0000-4000-8000-000000005001',
    '00000000-0000-4000-8000-000000004001',
    '00000000-0000-4000-8000-000000004101',
    'PF08 TEST PRODUCT A STOCK 10',
    'Synthetic normal sized product for standard and multi-item checkout tests.',
    25.00,
    250,
    true,
    true,
    true,
    true,
    801,
    '2026-01-01 08:15:00+00',
    '2026-01-01 08:15:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000005002',
    '00000000-0000-4000-8000-000000004001',
    '00000000-0000-4000-8000-000000004101',
    'PF08 TEST PRODUCT B LAST UNIT',
    'Synthetic normal sized product for last-unit stock races.',
    40.00,
    400,
    true,
    true,
    true,
    true,
    802,
    '2026-01-01 08:15:00+00',
    '2026-01-01 08:15:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000005003',
    '00000000-0000-4000-8000-000000004001',
    '00000000-0000-4000-8000-000000004101',
    'PF08 TEST PRODUCT C NULL SIZE',
    'Synthetic product whose stock identity has a null size.',
    30.00,
    300,
    true,
    true,
    true,
    true,
    803,
    '2026-01-01 08:15:00+00',
    '2026-01-01 08:15:00+00'
  );

INSERT INTO public.store_product_colors (
  id, product_id, color_name, color_hex, is_active, sort_order, created_at
) VALUES
  ('00000000-0000-4000-8000-000000006001', '00000000-0000-4000-8000-000000005001', 'PF08 BLUE', '#0000F8', true, 1, '2026-01-01 08:20:00+00'),
  ('00000000-0000-4000-8000-000000006002', '00000000-0000-4000-8000-000000005002', 'PF08 RED', '#F80000', true, 1, '2026-01-01 08:20:00+00'),
  ('00000000-0000-4000-8000-000000006003', '00000000-0000-4000-8000-000000005003', 'PF08 BLACK', '#080808', true, 1, '2026-01-01 08:20:00+00');

INSERT INTO public.store_product_sizes (
  id, product_id, size_label, sort_order, is_active, created_at
) VALUES
  ('00000000-0000-4000-8000-000000007001', '00000000-0000-4000-8000-000000005001', 'PF08-M', 1, true, '2026-01-01 08:20:00+00'),
  ('00000000-0000-4000-8000-000000007002', '00000000-0000-4000-8000-000000005002', 'PF08-L', 1, true, '2026-01-01 08:20:00+00');

INSERT INTO public.store_product_stock (
  id, product_id, color_id, size_id, stock_qty, sku, is_active, created_at, updated_at
) VALUES
  (
    '00000000-0000-4000-8000-000000008001',
    '00000000-0000-4000-8000-000000005001',
    '00000000-0000-4000-8000-000000006001',
    '00000000-0000-4000-8000-000000007001',
    10,
    'PF08-SKU-A-M-BLUE',
    true,
    '2026-01-01 08:25:00+00',
    '2026-01-01 08:25:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000008002',
    '00000000-0000-4000-8000-000000005002',
    '00000000-0000-4000-8000-000000006002',
    '00000000-0000-4000-8000-000000007002',
    1,
    'PF08-SKU-B-L-RED',
    true,
    '2026-01-01 08:25:00+00',
    '2026-01-01 08:25:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000008003',
    '00000000-0000-4000-8000-000000005003',
    '00000000-0000-4000-8000-000000006003',
    NULL,
    3,
    'PF08-SKU-C-NOSIZE-BLACK',
    true,
    '2026-01-01 08:25:00+00',
    '2026-01-01 08:25:00+00'
  );

INSERT INTO public.rewards_catalog (
  id, name, description, category, points_cost, is_active, stock_qty,
  reward_type, created_at, updated_at, store_product_id, requires_store_variant
) VALUES
  (
    '00000000-0000-4000-8000-000000009001',
    'PF08 TEST REWARD A STORE LINKED',
    'Synthetic Store-linked reward using the null-size variant.',
    'PF08 STORE',
    400,
    true,
    4,
    'club',
    '2026-01-01 08:30:00+00',
    '2026-01-01 08:30:00+00',
    '00000000-0000-4000-8000-000000005003',
    true
  ),
  (
    '00000000-0000-4000-8000-000000009002',
    'PF08 TEST REWARD B NON STORE',
    'Synthetic non-Store reward with unlimited catalog stock.',
    'PF08 CLUB',
    200,
    true,
    NULL,
    'club',
    '2026-01-01 08:30:00+00',
    '2026-01-01 08:30:00+00',
    NULL,
    false
  );

INSERT INTO public.reward_redemptions (
  id, membership_id, reward_id, points_cost, status,
  requested_at, approved_at, delivered_at, notes, qr_token
) VALUES
  (
    '00000000-0000-4000-8000-00000000a001',
    '00000000-0000-4000-8000-000000002001',
    '00000000-0000-4000-8000-000000009002',
    200,
    'requested',
    '2026-01-02 09:00:00+00',
    NULL,
    NULL,
    'PF08 synthetic legitimate pending non-Store redemption.',
    'PF08-LOCAL-QR-PENDING-0001'
  ),
  (
    '00000000-0000-4000-8000-00000000a002',
    '00000000-0000-4000-8000-000000002001',
    '00000000-0000-4000-8000-000000009001',
    400,
    'delivered',
    '2026-01-03 09:00:00+00',
    '2026-01-03 10:00:00+00',
    '2026-01-04 10:00:00+00',
    'PF08 synthetic completed Store-linked redemption.',
    'PF08-LOCAL-QR-DELIVERED-0001'
  );

INSERT INTO public.loyalty_transactions (
  id, membership_id, type, source, points_delta, notes,
  related_redemption_id, created_at
) VALUES
  (
    '00000000-0000-4000-8000-000000003001',
    '00000000-0000-4000-8000-000000002001',
    'earn',
    'manual_adjustment',
    2600,
    'PF08 synthetic opening credit; two historical redemption debits leave 2000 points.',
    NULL,
    '2026-01-01 08:06:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000003002',
    '00000000-0000-4000-8000-000000002002',
    'earn',
    'manual_adjustment',
    500,
    'PF08 synthetic opening credit for insufficient-balance tests.',
    NULL,
    '2026-01-01 08:06:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000003003',
    '00000000-0000-4000-8000-000000002001',
    'redeem',
    'reward_redemption',
    -200,
    'PF08 synthetic debit for pending non-Store redemption.',
    '00000000-0000-4000-8000-00000000a001',
    '2026-01-02 09:00:01+00'
  ),
  (
    '00000000-0000-4000-8000-000000003004',
    '00000000-0000-4000-8000-000000002001',
    'redeem',
    'reward_redemption',
    -400,
    'PF08 synthetic debit for completed Store-linked redemption.',
    '00000000-0000-4000-8000-00000000a002',
    '2026-01-03 09:00:01+00'
  );

INSERT INTO public.store_orders (
  id, user_id, status, pickup_club, payment_mode,
  total_euro, total_points, customer_name, customer_phone, customer_email,
  notes, created_at, updated_at, confirmed_at, ready_at, delivered_at,
  is_paid, paid_at, supplier_paid, order_type, related_redemption_id,
  special_title, special_notes
) VALUES (
  '00000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-000000001001',
  'delivered',
  'CENTALLO',
  'points',
  0.00,
  400,
  'PF08 TEST USER A',
  '+390000000801',
  'pf08-user-a@example.invalid',
  'PF08 synthetic fulfillment order for delivered Store-linked redemption.',
  '2026-01-03 09:00:02+00',
  '2026-01-04 10:00:00+00',
  '2026-01-03 10:00:00+00',
  '2026-01-04 09:00:00+00',
  '2026-01-04 10:00:00+00',
  true,
  '2026-01-03 09:00:02+00',
  false,
  'reward_redemption',
  '00000000-0000-4000-8000-00000000a002',
  'PF08 TEST REWARD A STORE LINKED',
  'PF08 synthetic completed fulfillment chain.'
);

INSERT INTO public.store_order_items (
  id, order_id, product_id, color_id, size_id,
  product_name, color_name, size_label, quantity,
  unit_price_euro, unit_price_points, total_euro, total_points,
  created_at, custom_variant
) VALUES (
  '00000000-0000-4000-8000-00000000c001',
  '00000000-0000-4000-8000-00000000b001',
  '00000000-0000-4000-8000-000000005003',
  '00000000-0000-4000-8000-000000006003',
  NULL,
  'PF08 TEST PRODUCT C NULL SIZE',
  'PF08 BLACK',
  NULL,
  1,
  0.00,
  400,
  0.00,
  400,
  '2026-01-03 09:00:03+00',
  'PF08 BLACK / NO SIZE'
);

COMMIT;
