\set ON_ERROR_STOP on

-- LOCAL ONLY. Requires the completed PF-08B2C3 fixture and successful candidate.
BEGIN;

DO $postconditions$
BEGIN
  IF (SELECT count(*) FROM public.rewards_catalog WHERE is_active) <> 26
     OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type = 'service') <> 13
     OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type = 'store_product') <> 13
     OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type IS NULL) <> 0 THEN
    RAISE EXCEPTION 'PF08B2C3_VALIDATION_TOTALS';
  END IF;

  IF (SELECT store_product_id FROM public.rewards_catalog WHERE id = '46709f62-3f5a-4025-965a-c5fcedcec826')
       IS DISTINCT FROM '671549a7-ed15-4eab-886d-4dff3f331d4d'::uuid THEN
    RAISE EXCEPTION 'PF08B2C3_VALIDATION_ASCIUGAMANO_LINK';
  END IF;

  IF (SELECT store_product_id FROM public.rewards_catalog WHERE id = '1b1718ab-aba8-44bb-a2de-d90992e596a7')
       IS DISTINCT FROM 'f442259b-1e5b-437a-b0ba-3d056d9d617d'::uuid THEN
    RAISE EXCEPTION 'PF08B2C3_VALIDATION_PALLINE_LINK';
  END IF;
END $postconditions$;

CREATE FUNCTION pg_temp.validate_store_redemption(p_reward_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  selected_color_id uuid;
  selected_size_id uuid;
  result jsonb;
  redemption_id uuid;
BEGIN
  SELECT stock.color_id, stock.size_id
  INTO selected_color_id, selected_size_id
  FROM public.rewards_catalog AS reward
  JOIN public.store_products AS product
    ON product.id = reward.store_product_id
   AND product.is_active
  JOIN public.store_product_stock AS stock
    ON stock.product_id = product.id
   AND stock.is_active
   AND (stock.stock_qty IS NULL OR stock.stock_qty > 0)
  JOIN public.store_product_colors AS color
    ON color.id = stock.color_id
   AND color.product_id = product.id
   AND color.is_active
  LEFT JOIN public.store_product_sizes AS size
    ON size.id = stock.size_id
   AND size.product_id = product.id
  WHERE reward.id = p_reward_id
    AND reward.is_active
    AND reward.fulfillment_type = 'store_product'
    AND (
      (
        NOT EXISTS (
          SELECT 1 FROM public.store_product_sizes AS active_size
          WHERE active_size.product_id = product.id AND active_size.is_active
        )
        AND stock.size_id IS NULL
      )
      OR (
        EXISTS (
          SELECT 1 FROM public.store_product_sizes AS active_size
          WHERE active_size.product_id = product.id AND active_size.is_active
        )
        AND stock.size_id IS NOT NULL
        AND size.is_active
      )
    )
  ORDER BY stock.id
  LIMIT 1;

  IF selected_color_id IS NULL THEN
    RAISE EXCEPTION 'PF08B2C3_VALIDATION_NO_USABLE_VARIANT: %', p_reward_id;
  END IF;

  result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001',
    extensions.gen_random_uuid(),
    p_reward_id,
    selected_color_id,
    selected_size_id
  );
  redemption_id := (result #>> '{data,id}')::uuid;

  IF result #>> '{data,fulfillment_type}' <> 'store_product'
     OR result #>> '{data,status}' <> 'requested'
     OR (result #>> '{data,store_order_id}') IS NULL
     OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id = redemption_id) <> 1 THEN
    RAISE EXCEPTION 'PF08B2C3_VALIDATION_STORE_RPC: %', p_reward_id;
  END IF;
END $function$;

SAVEPOINT service_case;
DO $service$
DECLARE
  result jsonb;
  redemption_id uuid;
BEGIN
  result := public.redeem_moviback_reward(
    '00000000-0000-4000-8000-000000001001',
    extensions.gen_random_uuid(),
    '157d2e20-293e-4770-9e8d-e04b03aed110',
    NULL,
    NULL
  );
  redemption_id := (result #>> '{data,id}')::uuid;
  IF result #>> '{data,fulfillment_type}' <> 'service'
     OR result #>> '{data,status}' <> 'ready'
     OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id = redemption_id) <> 0 THEN
    RAISE EXCEPTION 'PF08B2C3_VALIDATION_SERVICE_RPC';
  END IF;
END $service$;
ROLLBACK TO SAVEPOINT service_case;

SAVEPOINT store_variant_true_case;
DO $store_true$
DECLARE
  reward_id uuid;
BEGIN
  SELECT id INTO reward_id
  FROM public.rewards_catalog
  WHERE is_active
    AND fulfillment_type = 'store_product'
    AND requires_store_variant
  ORDER BY id
  LIMIT 1;
  IF reward_id IS NULL THEN
    RAISE EXCEPTION 'PF08B2C3_EVIDENCE_NO_STORE_VARIANT_TRUE';
  END IF;
  PERFORM pg_temp.validate_store_redemption(reward_id);
END $store_true$;
ROLLBACK TO SAVEPOINT store_variant_true_case;

SAVEPOINT store_variant_false_case;
DO $store_false$
DECLARE
  reward_id uuid;
BEGIN
  SELECT id INTO reward_id
  FROM public.rewards_catalog
  WHERE is_active
    AND fulfillment_type = 'store_product'
    AND NOT requires_store_variant
  ORDER BY id
  LIMIT 1;
  IF reward_id IS NULL THEN
    RAISE EXCEPTION 'PF08B2C3_EVIDENCE_NO_STORE_VARIANT_FALSE';
  END IF;
  PERFORM pg_temp.validate_store_redemption(reward_id);
END $store_false$;
ROLLBACK TO SAVEPOINT store_variant_false_case;

SAVEPOINT asciugamano_case;
SELECT pg_temp.validate_store_redemption('46709f62-3f5a-4025-965a-c5fcedcec826');
ROLLBACK TO SAVEPOINT asciugamano_case;

SAVEPOINT palline_case;
SELECT pg_temp.validate_store_redemption('1b1718ab-aba8-44bb-a2de-d90992e596a7');
ROLLBACK TO SAVEPOINT palline_case;

ROLLBACK;

\echo 'PF-08B2C3 classification and smart-redemption validation PASS'
