-- PF-08B2C3 owner-run production catalog evidence query.
-- SELECT-only. Contains no customer, membership, redemption, order, or secret data.
-- Do not execute automatically.

SELECT
  r.id AS reward_id,
  r.name AS reward_name,
  r.is_active AS reward_is_active,
  r.store_product_id,
  r.requires_store_variant,
  nullif(to_jsonb(r) ->> 'fulfillment_type', '') AS current_fulfillment_type,
  p.name AS store_product_name,
  p.is_active AS store_product_is_active,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'color_id', c.id,
          'color_name', c.color_name,
          'is_active', c.is_active
        )
        ORDER BY c.sort_order, c.color_name, c.id
      )
      FROM public.store_product_colors AS c
      WHERE c.product_id = p.id
    ),
    '[]'::jsonb
  ) AS colors,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'size_id', s.id,
          'size_label', s.size_label,
          'is_active', s.is_active
        )
        ORDER BY s.sort_order, s.size_label, s.id
      )
      FROM public.store_product_sizes AS s
      WHERE s.product_id = p.id
    ),
    '[]'::jsonb
  ) AS sizes,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'stock_id', stock.id,
          'color_id', stock.color_id,
          'size_id', stock.size_id,
          'stock_qty', stock.stock_qty,
          'is_active', stock.is_active
        )
        ORDER BY stock.color_id, stock.size_id NULLS FIRST, stock.id
      )
      FROM public.store_product_stock AS stock
      WHERE stock.product_id = p.id
    ),
    '[]'::jsonb
  ) AS stock_identities
FROM public.rewards_catalog AS r
LEFT JOIN public.store_products AS p ON p.id = r.store_product_id
WHERE r.id IN (
  '46709f62-3f5a-4025-965a-c5fcedcec826',
  'a62ef5f8-355e-4bbc-a235-e19572d3e70f',
  'c0aaddaa-6980-4db5-97ac-4e41e2bb4203',
  '4a875fa4-5b51-4f4c-9209-0bf3be66b1d9',
  '007de8b9-a69b-4749-a6f2-a4f9498d2a89',
  'a0faea73-495e-47db-9bbb-bfa32f291d5c',
  '86a8408b-4b98-466e-b084-47ff136c1b30',
  'df69b1e0-f1c2-495c-891f-b1c064f74be6',
  'bd301b3d-6f20-417a-820c-d0f2b7c69918',
  '5edf4f7e-965d-4462-b645-df999872bc17',
  '975e5de0-e691-4e6a-b4bc-e002dbfbf42b',
  'bc0249ca-ea94-448f-afc4-27614468c9c6',
  '1b1718ab-aba8-44bb-a2de-d90992e596a7'
)
ORDER BY r.name, r.id;
