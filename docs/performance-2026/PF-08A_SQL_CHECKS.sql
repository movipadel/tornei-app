-- PF-08A production compatibility checks
-- Run manually in Supabase SQL Editor with a read-only role where possible.
-- Every statement in this file is read-only. Result sets should normally be empty.
-- UUIDs are returned for diagnosis; no customer names, email addresses, phone numbers,
-- membership codes, tax codes, notes, or other free text are selected.

-- Q01. Duplicate Store stock identities, including nullable sizes.
SELECT
  product_id,
  color_id,
  size_id,
  count(*) AS row_count,
  array_agg(id ORDER BY id) AS stock_row_ids,
  array_agg(stock_qty ORDER BY id) AS quantities,
  array_agg(is_active ORDER BY id) AS active_flags
FROM public.store_product_stock
GROUP BY product_id, color_id, size_id
HAVING count(*) > 1
ORDER BY row_count DESC, product_id, color_id, size_id NULLS FIRST;

-- Q02. Nullable-size stock duplicates specifically. The exported ordinary unique
-- index does not make NULL values equal, so these duplicates are structurally possible.
SELECT
  product_id,
  color_id,
  count(*) AS row_count,
  array_agg(id ORDER BY id) AS stock_row_ids,
  array_agg(stock_qty ORDER BY id) AS quantities,
  array_agg(is_active ORDER BY id) AS active_flags
FROM public.store_product_stock
WHERE size_id IS NULL
GROUP BY product_id, color_id
HAVING count(*) > 1
ORDER BY row_count DESC, product_id, color_id;

-- Q03. Negative finite inventory in Store variants or MoviBack rewards.
SELECT
  'store_product_stock'::text AS relation_name,
  id AS row_id,
  stock_qty
FROM public.store_product_stock
WHERE stock_qty < 0
UNION ALL
SELECT
  'rewards_catalog'::text AS relation_name,
  id AS row_id,
  stock_qty
FROM public.rewards_catalog
WHERE stock_qty < 0
ORDER BY relation_name, row_id;

-- Q04. More than one approved membership for one user. Both current mutation
-- handlers resolve an approved membership with maybeSingle semantics.
SELECT
  user_id,
  count(*) AS approved_membership_count,
  array_agg(id ORDER BY id) AS membership_ids
FROM public.loyalty_memberships
WHERE status = 'approved'
GROUP BY user_id
HAVING count(*) > 1
ORDER BY approved_membership_count DESC, user_id;

-- Q05. Any user with more than one membership row, regardless of state.
-- This distinguishes a strict one-membership invariant from approved-only uniqueness.
SELECT
  user_id,
  count(*) AS membership_count,
  array_agg(id ORDER BY id) AS membership_ids,
  array_agg(status ORDER BY id) AS membership_statuses
FROM public.loyalty_memberships
GROUP BY user_id
HAVING count(*) > 1
ORDER BY membership_count DESC, user_id;

-- Q06. Multiple loyalty ledger rows linked to one redemption.
SELECT
  related_redemption_id,
  count(*) AS linked_transaction_count,
  array_agg(id ORDER BY id) AS transaction_ids,
  array_agg(source ORDER BY id) AS sources,
  array_agg(type ORDER BY id) AS transaction_types,
  array_agg(points_delta ORDER BY id) AS point_deltas
FROM public.loyalty_transactions
WHERE related_redemption_id IS NOT NULL
GROUP BY related_redemption_id
HAVING count(*) > 1
ORDER BY linked_transaction_count DESC, related_redemption_id;

-- Q07 / Q7R. Redemptions that do not have exactly one matching redemption ledger row.
-- Historical note: the original Q07 used type='debit'. That assumption was invalid:
-- the installed transaction-type CHECK permits earn, redeem, adjustment, refund and
-- cancel, and production verification confirmed the canonical redemption type is
-- type='redeem'. This revised Q7R form is the canonical check.
SELECT
  r.id AS redemption_id,
  r.membership_id,
  r.points_cost,
  count(t.id) FILTER (
    WHERE t.type = 'redeem'
      AND t.source = 'reward_redemption'
      AND t.membership_id = r.membership_id
      AND t.points_delta = -r.points_cost
  ) AS matching_debit_count,
  count(t.id) AS all_linked_transaction_count,
  array_remove(array_agg(t.id ORDER BY t.id), NULL) AS linked_transaction_ids
FROM public.reward_redemptions AS r
LEFT JOIN public.loyalty_transactions AS t
  ON t.related_redemption_id = r.id
GROUP BY r.id, r.membership_id, r.points_cost
HAVING count(t.id) FILTER (
  WHERE t.type = 'redeem'
    AND t.source = 'reward_redemption'
    AND t.membership_id = r.membership_id
    AND t.points_delta = -r.points_cost
) <> 1
ORDER BY r.id;

-- Q08 / Q8R. Linked redemption transactions with inconsistent membership, sign,
-- transaction type, source, or amount. Q8R supersedes the historical invalid
-- type='debit' assumption described above.
SELECT
  t.id AS transaction_id,
  t.related_redemption_id AS redemption_id,
  t.membership_id AS transaction_membership_id,
  r.membership_id AS redemption_membership_id,
  t.type,
  t.source,
  t.points_delta,
  r.points_cost
FROM public.loyalty_transactions AS t
JOIN public.reward_redemptions AS r
  ON r.id = t.related_redemption_id
WHERE t.membership_id IS DISTINCT FROM r.membership_id
   OR t.type IS DISTINCT FROM 'redeem'
   OR t.source IS DISTINCT FROM 'reward_redemption'
   OR t.points_delta IS DISTINCT FROM -r.points_cost
ORDER BY t.related_redemption_id, t.id;

-- Q09. Reward-redemption source rows lacking a redemption link.
SELECT id AS transaction_id, membership_id, type, source, points_delta
FROM public.loyalty_transactions
WHERE source = 'reward_redemption'
  AND related_redemption_id IS NULL
ORDER BY id;

-- Q10. More than one fulfillment order linked to one redemption.
SELECT
  related_redemption_id,
  count(*) AS order_count,
  array_agg(id ORDER BY id) AS order_ids,
  array_agg(order_type ORDER BY id) AS order_types
FROM public.store_orders
WHERE related_redemption_id IS NOT NULL
GROUP BY related_redemption_id
HAVING count(*) > 1
ORDER BY order_count DESC, related_redemption_id;

-- Q11. Informational fulfillment workflow review. Current business behavior permits
-- a requested Store-linked physical reward redemption to have no fulfillment order
-- while it awaits processing. Such rows are returned with expected_pending state,
-- not treated as data inconsistency.
WITH expected_fulfillment AS (
  SELECT r.id, r.membership_id, r.points_cost, r.status
  FROM public.reward_redemptions AS r
  JOIN public.rewards_catalog AS c ON c.id = r.reward_id
  WHERE (c.store_product_id IS NOT NULL AND c.requires_store_variant)
     OR lower(coalesce(c.category, '')) LIKE '%abbigliamento%'
     OR lower(coalesce(c.category, '')) LIKE '%accessori%'
     OR lower(coalesce(c.category, '')) LIKE '%accessorio%'
     OR lower(coalesce(c.category, '')) LIKE '%store%'
)
SELECT
  e.id AS redemption_id,
  e.status AS redemption_status,
  count(o.id) FILTER (WHERE o.order_type = 'reward_redemption') AS fulfillment_order_count,
  count(o.id) AS all_linked_order_count,
  array_remove(array_agg(o.id ORDER BY o.id), NULL) AS linked_order_ids,
  CASE
    WHEN e.status = 'requested'
      AND count(o.id) FILTER (WHERE o.order_type = 'reward_redemption') = 0
      THEN 'expected_pending'
    WHEN count(o.id) FILTER (WHERE o.order_type = 'reward_redemption') = 1
      THEN 'fulfilled_once'
    ELSE 'review_business_lifecycle'
  END AS fulfillment_state
FROM expected_fulfillment AS e
LEFT JOIN public.store_orders AS o
  ON o.related_redemption_id = e.id
GROUP BY e.id, e.status
HAVING count(o.id) FILTER (WHERE o.order_type = 'reward_redemption') <> 1
ORDER BY e.id;

-- Q12. Fulfillment orders whose type, owner, total, or item cardinality is
-- inconsistent with the linked redemption.
SELECT
  o.id AS order_id,
  o.related_redemption_id AS redemption_id,
  o.order_type,
  o.user_id AS order_user_id,
  m.user_id AS membership_user_id,
  o.total_points AS order_total_points,
  r.points_cost AS redemption_points_cost,
  count(i.id) AS item_count
FROM public.store_orders AS o
JOIN public.reward_redemptions AS r
  ON r.id = o.related_redemption_id
JOIN public.loyalty_memberships AS m
  ON m.id = r.membership_id
LEFT JOIN public.store_order_items AS i
  ON i.order_id = o.id
GROUP BY
  o.id, o.related_redemption_id, o.order_type, o.user_id,
  m.user_id, o.total_points, r.points_cost
HAVING o.order_type IS DISTINCT FROM 'reward_redemption'
    OR o.user_id IS DISTINCT FROM m.user_id
    OR o.total_points IS DISTINCT FROM r.points_cost
    OR count(i.id) <> 1
ORDER BY o.related_redemption_id, o.id;

-- Q13. Orphan references. Enforced foreign keys should make most branches empty;
-- the ledger redemption link is included because no FK was present in the export.
SELECT 'redemption_missing_membership'::text AS issue_type, r.id AS row_id
FROM public.reward_redemptions AS r
LEFT JOIN public.loyalty_memberships AS m ON m.id = r.membership_id
WHERE m.id IS NULL
UNION ALL
SELECT 'redemption_missing_reward', r.id
FROM public.reward_redemptions AS r
LEFT JOIN public.rewards_catalog AS c ON c.id = r.reward_id
WHERE c.id IS NULL
UNION ALL
SELECT 'transaction_missing_membership', t.id
FROM public.loyalty_transactions AS t
LEFT JOIN public.loyalty_memberships AS m ON m.id = t.membership_id
WHERE m.id IS NULL
UNION ALL
SELECT 'transaction_missing_redemption', t.id
FROM public.loyalty_transactions AS t
LEFT JOIN public.reward_redemptions AS r ON r.id = t.related_redemption_id
WHERE t.related_redemption_id IS NOT NULL AND r.id IS NULL
UNION ALL
SELECT 'order_missing_user', o.id
FROM public.store_orders AS o
LEFT JOIN public.users AS u ON u.id = o.user_id
WHERE o.user_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'order_missing_redemption', o.id
FROM public.store_orders AS o
LEFT JOIN public.reward_redemptions AS r ON r.id = o.related_redemption_id
WHERE o.related_redemption_id IS NOT NULL AND r.id IS NULL
UNION ALL
SELECT 'item_missing_order', i.id
FROM public.store_order_items AS i
LEFT JOIN public.store_orders AS o ON o.id = i.order_id
WHERE o.id IS NULL
UNION ALL
SELECT 'item_missing_product', i.id
FROM public.store_order_items AS i
LEFT JOIN public.store_products AS p ON p.id = i.product_id
WHERE i.product_id IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'item_missing_color', i.id
FROM public.store_order_items AS i
LEFT JOIN public.store_product_colors AS c ON c.id = i.color_id
WHERE i.color_id IS NOT NULL AND c.id IS NULL
UNION ALL
SELECT 'item_missing_size', i.id
FROM public.store_order_items AS i
LEFT JOIN public.store_product_sizes AS s ON s.id = i.size_id
WHERE i.size_id IS NOT NULL AND s.id IS NULL
UNION ALL
SELECT 'stock_missing_product', s.id
FROM public.store_product_stock AS s
LEFT JOIN public.store_products AS p ON p.id = s.product_id
WHERE p.id IS NULL
UNION ALL
SELECT 'stock_missing_color', s.id
FROM public.store_product_stock AS s
LEFT JOIN public.store_product_colors AS c ON c.id = s.color_id
WHERE c.id IS NULL
UNION ALL
SELECT 'stock_missing_size', s.id
FROM public.store_product_stock AS s
LEFT JOIN public.store_product_sizes AS z ON z.id = s.size_id
WHERE s.size_id IS NOT NULL AND z.id IS NULL
UNION ALL
SELECT 'reward_missing_store_product', c.id
FROM public.rewards_catalog AS c
LEFT JOIN public.store_products AS p ON p.id = c.store_product_id
WHERE c.store_product_id IS NOT NULL AND p.id IS NULL
ORDER BY issue_type, row_id;

-- Q14. Cross-table variant ownership mismatches not expressible by the current
-- single-column foreign keys.
SELECT 'stock_color_wrong_product'::text AS issue_type, s.id AS row_id
FROM public.store_product_stock AS s
JOIN public.store_product_colors AS c ON c.id = s.color_id
WHERE c.product_id IS DISTINCT FROM s.product_id
UNION ALL
SELECT 'stock_size_wrong_product', s.id
FROM public.store_product_stock AS s
JOIN public.store_product_sizes AS z ON z.id = s.size_id
WHERE z.product_id IS DISTINCT FROM s.product_id
UNION ALL
SELECT 'item_color_wrong_product', i.id
FROM public.store_order_items AS i
JOIN public.store_product_colors AS c ON c.id = i.color_id
WHERE i.product_id IS NOT NULL AND c.product_id IS DISTINCT FROM i.product_id
UNION ALL
SELECT 'item_size_wrong_product', i.id
FROM public.store_order_items AS i
JOIN public.store_product_sizes AS z ON z.id = i.size_id
WHERE i.product_id IS NOT NULL AND z.product_id IS DISTINCT FROM i.product_id
ORDER BY issue_type, row_id;

-- Q15. Other candidate range violations relevant to future transaction guards.
-- Null stock remains the current unlimited sentinel and is intentionally excluded.
SELECT 'order_item_nonpositive_quantity'::text AS issue_type, id AS row_id, quantity::numeric AS observed_value
FROM public.store_order_items
WHERE quantity <= 0
UNION ALL
SELECT 'redemption_nonpositive_points_cost', id, points_cost::numeric
FROM public.reward_redemptions
WHERE points_cost <= 0
UNION ALL
SELECT 'reward_nonpositive_points_cost', id, points_cost::numeric
FROM public.rewards_catalog
WHERE points_cost <= 0
ORDER BY issue_type, row_id;

-- Q16. Exact installed constraint definitions for the PF-08 relations.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid, true) AS constraint_definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'loyalty_memberships',
    'loyalty_transactions',
    'reward_redemptions',
    'rewards_catalog',
    'store_orders',
    'store_order_items',
    'store_product_stock'
  )
ORDER BY c.relname, con.conname;

-- Q17. Installed index definitions, including nullable-key semantics.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'loyalty_memberships',
    'loyalty_transactions',
    'reward_redemptions',
    'rewards_catalog',
    'store_orders',
    'store_order_items',
    'store_product_stock'
  )
ORDER BY tablename, indexname;

-- Q18. Foreign-key delete behavior needed to validate compensation and lifecycle assumptions.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid, true) AS constraint_definition,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS delete_action
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND con.contype = 'f'
  AND c.relname IN (
    'loyalty_memberships',
    'loyalty_transactions',
    'reward_redemptions',
    'rewards_catalog',
    'store_orders',
    'store_order_items',
    'store_product_stock'
  )
ORDER BY c.relname, con.conname;
