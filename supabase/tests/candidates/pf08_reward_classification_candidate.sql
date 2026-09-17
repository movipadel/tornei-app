\set ON_ERROR_STOP on

-- PF-08B2C3 PRODUCTION-CANDIDATE DATA MIGRATION.
-- REVIEW ONLY. This file is intentionally outside supabase/migrations.
-- It must be promoted only after the owner-approved production metadata and
-- the complete local validation harness both pass.

BEGIN;

CREATE TEMP TABLE pf08_reward_classification_map (
  reward_id uuid PRIMARY KEY,
  expected_name text NOT NULL,
  target_fulfillment_type text NOT NULL,
  CHECK (target_fulfillment_type IN ('service', 'store_product'))
) ON COMMIT DROP;

INSERT INTO pf08_reward_classification_map (
  reward_id,
  expected_name,
  target_fulfillment_type
) VALUES
  ('157d2e20-293e-4770-9e8d-e04b03aed110', '1 Quota in Partita Guidata', 'service'),
  ('71b119b8-3b41-4c2d-a391-2c4aebad3f1b', '1 Quota Lezione di coppia', 'service'),
  ('314199e2-3e2d-4a53-9abc-9388c0eb60b6', '1 Quota Lezione Quadrupla', 'service'),
  ('fe82c247-cc46-4097-9697-6a9e2075d2ed', '1 Quota Lezione Tripla', 'service'),
  ('2797a5b7-d51f-4695-8ff8-2ad1435f0fbb', 'Lezione Privata', 'service'),
  ('f4c0b587-ad8b-4170-a132-a1b41638e8ce', 'Pacchetto Scalare 100 €', 'service'),
  ('4471c0e5-5db1-4525-8884-91facbf8dc08', 'Pacchetto Scalare 200 €', 'service'),
  ('6bef04ae-ca90-4ab8-aef3-a33974392674', 'Quota Iscrizione Torneo', 'service'),
  ('778ebc4e-9559-45c6-9640-042a55aeb209', 'Quota slot Estiva', 'service'),
  ('ca0966bb-79b8-4126-9419-ca2de74ec729', 'Quota slot Invernale', 'service'),
  ('cce9d976-50cb-47d1-9aac-fa20ceb7cd32', 'Quota Torneo in Coppia', 'service'),
  ('f9ec6558-ae36-470f-9c83-11146467d40f', 'Slot Estiva', 'service'),
  ('a2fb6799-cf42-4cb2-9f56-bf75537544da', 'Slot Invernale', 'service'),
  ('46709f62-3f5a-4025-965a-c5fcedcec826', 'Asciugamano Sport', 'store_product'),
  ('a62ef5f8-355e-4bbc-a235-e19572d3e70f', 'Baseball Cup', 'store_product'),
  ('c0aaddaa-6980-4db5-97ac-4e41e2bb4203', 'Borsone Padel', 'store_product'),
  ('4a875fa4-5b51-4f4c-9209-0bf3be66b1d9', 'Felpa Donna', 'store_product'),
  ('007de8b9-a69b-4749-a6f2-a4f9498d2a89', 'Felpa Uomo', 'store_product'),
  ('a0faea73-495e-47db-9bbb-bfa32f291d5c', 'Grip in cuoio HEXIA', 'store_product'),
  ('86a8408b-4b98-466e-b084-47ff136c1b30', 'Pantalone Unisex', 'store_product'),
  ('df69b1e0-f1c2-495c-891f-b1c064f74be6', 'Polsino XL', 'store_product'),
  ('bd301b3d-6f20-417a-820c-d0f2b7c69918', 'Short Uomo Tecnico', 'store_product'),
  ('5edf4f7e-965d-4462-b645-df999872bc17', 'Softshell Unisex', 'store_product'),
  ('975e5de0-e691-4e6a-b4bc-e002dbfbf42b', 'T-Shirt Tecnica Donna', 'store_product'),
  ('bc0249ca-ea94-448f-afc4-27614468c9c6', 'T-shirt Tecnica UOMO', 'store_product'),
  ('1b1718ab-aba8-44bb-a2de-d90992e596a7', 'Tubo Palline', 'store_product');

DO $guard$
DECLARE
  detail text;
BEGIN
  IF (SELECT count(*) FROM pf08_reward_classification_map) <> 26
     OR (SELECT count(DISTINCT reward_id) FROM pf08_reward_classification_map) <> 26
     OR (SELECT count(*) FROM pf08_reward_classification_map WHERE target_fulfillment_type = 'service') <> 13
     OR (SELECT count(*) FROM pf08_reward_classification_map WHERE target_fulfillment_type = 'store_product') <> 13
     OR EXISTS (
       SELECT 1
       FROM pf08_reward_classification_map
       WHERE target_fulfillment_type NOT IN ('service', 'store_product')
     ) THEN
    RAISE EXCEPTION 'PF08B2C3_MAPPING_DEFINITION_INVALID';
  END IF;

  SELECT string_agg(format('%s [%s]', m.expected_name, m.reward_id), ', ' ORDER BY m.expected_name)
  INTO detail
  FROM pf08_reward_classification_map AS m
  LEFT JOIN public.rewards_catalog AS r ON r.id = m.reward_id
  WHERE r.id IS NULL;
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'PF08B2C3_REWARD_MISSING: %', detail;
  END IF;

  SELECT string_agg(
    format('%s [%s] actual=%s', m.expected_name, m.reward_id, r.name),
    ', ' ORDER BY m.expected_name
  )
  INTO detail
  FROM pf08_reward_classification_map AS m
  JOIN public.rewards_catalog AS r ON r.id = m.reward_id
  WHERE r.name IS DISTINCT FROM m.expected_name;
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'PF08B2C3_REWARD_NAME_MISMATCH: %', detail;
  END IF;

  SELECT string_agg(format('%s [%s]', m.expected_name, m.reward_id), ', ' ORDER BY m.expected_name)
  INTO detail
  FROM pf08_reward_classification_map AS m
  JOIN public.rewards_catalog AS r ON r.id = m.reward_id
  WHERE NOT r.is_active;
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'PF08B2C3_REWARD_NOT_ACTIVE: %', detail;
  END IF;

  SELECT string_agg(
    format('%s [%s] existing=%s target=%s', m.expected_name, m.reward_id, r.fulfillment_type, m.target_fulfillment_type),
    ', ' ORDER BY m.expected_name
  )
  INTO detail
  FROM pf08_reward_classification_map AS m
  JOIN public.rewards_catalog AS r ON r.id = m.reward_id
  WHERE r.fulfillment_type IS NOT NULL
    AND r.fulfillment_type IS DISTINCT FROM m.target_fulfillment_type;
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'PF08B2C3_FULFILLMENT_CONFLICT: %', detail;
  END IF;

  SELECT string_agg(format('%s [%s]', m.expected_name, m.reward_id), ', ' ORDER BY m.expected_name)
  INTO detail
  FROM pf08_reward_classification_map AS m
  JOIN public.rewards_catalog AS r ON r.id = m.reward_id
  WHERE m.target_fulfillment_type = 'service'
    AND (r.store_product_id IS NOT NULL OR r.requires_store_variant);
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'PF08B2C3_SERVICE_STORE_CONFIGURATION: %', detail;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.store_products
    WHERE id = '671549a7-ed15-4eab-886d-4dff3f331d4d'
      AND name = 'Asciugamano Sport'
      AND is_active
  ) THEN
    RAISE EXCEPTION 'PF08B2C3_STORE_PRODUCT_MISMATCH: Asciugamano Sport [671549a7-ed15-4eab-886d-4dff3f331d4d]';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.store_products
    WHERE id = 'f442259b-1e5b-437a-b0ba-3d056d9d617d'
      AND name = 'Palline Nucleon'
      AND is_active
  ) THEN
    RAISE EXCEPTION 'PF08B2C3_STORE_PRODUCT_MISMATCH: Palline Nucleon [f442259b-1e5b-437a-b0ba-3d056d9d617d]';
  END IF;

  SELECT string_agg(format('%s [%s]', m.expected_name, m.reward_id), ', ' ORDER BY m.expected_name)
  INTO detail
  FROM pf08_reward_classification_map AS m
  JOIN public.rewards_catalog AS r ON r.id = m.reward_id
  LEFT JOIN public.store_products AS p ON p.id = r.store_product_id
  WHERE m.target_fulfillment_type = 'store_product'
    AND m.reward_id NOT IN (
      '46709f62-3f5a-4025-965a-c5fcedcec826',
      '1b1718ab-aba8-44bb-a2de-d90992e596a7'
    )
    AND (r.store_product_id IS NULL OR p.id IS NULL OR NOT p.is_active);
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'PF08B2C3_STORE_LINK_INVALID: %', detail;
  END IF;
END $guard$;

UPDATE public.rewards_catalog
SET store_product_id = '671549a7-ed15-4eab-886d-4dff3f331d4d',
    updated_at = now()
WHERE id = '46709f62-3f5a-4025-965a-c5fcedcec826'
  AND store_product_id IS DISTINCT FROM '671549a7-ed15-4eab-886d-4dff3f331d4d'::uuid;

UPDATE public.rewards_catalog
SET store_product_id = 'f442259b-1e5b-437a-b0ba-3d056d9d617d',
    updated_at = now()
WHERE id = '1b1718ab-aba8-44bb-a2de-d90992e596a7'
  AND store_product_id IS DISTINCT FROM 'f442259b-1e5b-437a-b0ba-3d056d9d617d'::uuid;

UPDATE public.rewards_catalog AS r
SET fulfillment_type = m.target_fulfillment_type,
    updated_at = now()
FROM pf08_reward_classification_map AS m
WHERE r.id = m.reward_id
  AND r.fulfillment_type IS DISTINCT FROM m.target_fulfillment_type;

DO $postcondition$
DECLARE
  detail text;
BEGIN
  IF (SELECT count(*) FROM public.rewards_catalog WHERE is_active) <> 26
     OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type = 'service') <> 13
     OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type = 'store_product') <> 13
     OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type = 'custom_physical') <> 0
     OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type = 'partner') <> 0
     OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type IS NULL) <> 0 THEN
    RAISE EXCEPTION 'PF08B2C3_ACTIVE_TOTALS_MISMATCH';
  END IF;

  SELECT string_agg(format('%s [%s]', m.expected_name, m.reward_id), ', ' ORDER BY m.expected_name)
  INTO detail
  FROM pf08_reward_classification_map AS m
  JOIN public.rewards_catalog AS r ON r.id = m.reward_id
  WHERE r.fulfillment_type IS DISTINCT FROM m.target_fulfillment_type;
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'PF08B2C3_CLASSIFICATION_POSTCONDITION: %', detail;
  END IF;

  SELECT string_agg(format('%s [%s]', m.expected_name, m.reward_id), ', ' ORDER BY m.expected_name)
  INTO detail
  FROM pf08_reward_classification_map AS m
  JOIN public.rewards_catalog AS r ON r.id = m.reward_id
  WHERE m.target_fulfillment_type = 'service'
    AND (r.store_product_id IS NOT NULL OR r.requires_store_variant);
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'PF08B2C3_SERVICE_POSTCONDITION: %', detail;
  END IF;

  SELECT string_agg(format('%s [%s]', m.expected_name, m.reward_id), ', ' ORDER BY m.expected_name)
  INTO detail
  FROM pf08_reward_classification_map AS m
  JOIN public.rewards_catalog AS r ON r.id = m.reward_id
  LEFT JOIN public.store_products AS p ON p.id = r.store_product_id
  WHERE m.target_fulfillment_type = 'store_product'
    AND (r.store_product_id IS NULL OR p.id IS NULL OR NOT p.is_active);
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'PF08B2C3_STORE_POSTCONDITION: %', detail;
  END IF;

  SELECT string_agg(format('%s [%s]', m.expected_name, m.reward_id), ', ' ORDER BY m.expected_name)
  INTO detail
  FROM pf08_reward_classification_map AS m
  JOIN public.rewards_catalog AS r ON r.id = m.reward_id
  JOIN public.store_products AS p ON p.id = r.store_product_id
  WHERE m.target_fulfillment_type = 'store_product'
    AND NOT EXISTS (
      SELECT 1
      FROM public.store_product_stock AS stock
      JOIN public.store_product_colors AS color
        ON color.id = stock.color_id
       AND color.product_id = p.id
       AND color.is_active
      LEFT JOIN public.store_product_sizes AS size
        ON size.id = stock.size_id
       AND size.product_id = p.id
      WHERE stock.product_id = p.id
        AND stock.is_active
        AND (stock.stock_qty IS NULL OR stock.stock_qty > 0)
        AND (
          (
            NOT EXISTS (
              SELECT 1 FROM public.store_product_sizes AS active_size
              WHERE active_size.product_id = p.id AND active_size.is_active
            )
            AND stock.size_id IS NULL
          )
          OR (
            EXISTS (
              SELECT 1 FROM public.store_product_sizes AS active_size
              WHERE active_size.product_id = p.id AND active_size.is_active
            )
            AND stock.size_id IS NOT NULL
            AND size.is_active
          )
        )
    );
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'PF08B2C3_STORE_VARIANT_UNUSABLE: %', detail;
  END IF;

  SELECT string_agg(format('%s [%s]', m.expected_name, m.reward_id), ', ' ORDER BY m.expected_name)
  INTO detail
  FROM pf08_reward_classification_map AS m
  JOIN public.rewards_catalog AS r ON r.id = m.reward_id
  JOIN public.store_product_stock AS stock ON stock.product_id = r.store_product_id AND stock.is_active
  WHERE m.target_fulfillment_type = 'store_product'
  GROUP BY m.reward_id, m.expected_name, stock.product_id, stock.color_id, stock.size_id
  HAVING count(*) > 1
  LIMIT 1;
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'PF08B2C3_STORE_STOCK_AMBIGUOUS: %', detail;
  END IF;
END $postcondition$;

COMMIT;
