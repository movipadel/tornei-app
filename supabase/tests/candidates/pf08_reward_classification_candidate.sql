\set ON_ERROR_STOP on
-- PF-08B2C3 PRODUCTION-CANDIDATE DATA MIGRATION — REVIEW ONLY.
-- Intentionally outside supabase/migrations. Never classify by name/category.
BEGIN;

CREATE TEMP TABLE pf08_reward_classification_map(
 reward_id uuid PRIMARY KEY, expected_name text NOT NULL,
 target_type text NOT NULL CHECK(target_type IN('service','store_product')),
 expected_current_product_id uuid, target_product_id uuid, expected_product_name text,
 expected_current_variant boolean NOT NULL, target_variant boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO pf08_reward_classification_map VALUES
('157d2e20-293e-4770-9e8d-e04b03aed110','1 Quota in Partita Guidata','service',NULL,NULL,NULL,false,false),
('71b119b8-3b41-4c2d-a391-2c4aebad3f1b','1 Quota Lezione di coppia','service',NULL,NULL,NULL,false,false),
('314199e2-3e2d-4a53-9abc-9388c0eb60b6','1 Quota Lezione Quadrupla','service',NULL,NULL,NULL,false,false),
('fe82c247-cc46-4097-9697-6a9e2075d2ed','1 Quota Lezione Tripla','service',NULL,NULL,NULL,false,false),
('2797a5b7-d51f-4695-8ff8-2ad1435f0fbb','Lezione Privata','service',NULL,NULL,NULL,false,false),
('f4c0b587-ad8b-4170-a132-a1b41638e8ce','Pacchetto Scalare 100 €','service',NULL,NULL,NULL,false,false),
('4471c0e5-5db1-4525-8884-91facbf8dc08','Pacchetto Scalare 200 €','service',NULL,NULL,NULL,false,false),
('6bef04ae-ca90-4ab8-aef3-a33974392674','Quota Iscrizione Torneo','service',NULL,NULL,NULL,false,false),
('778ebc4e-9559-45c6-9640-042a55aeb209','Quota slot Estiva','service',NULL,NULL,NULL,false,false),
('ca0966bb-79b8-4126-9419-ca2de74ec729','Quota slot Invernale','service',NULL,NULL,NULL,false,false),
('cce9d976-50cb-47d1-9aac-fa20ceb7cd32','Quota Torneo in Coppia','service',NULL,NULL,NULL,false,false),
('f9ec6558-ae36-470f-9c83-11146467d40f','Slot Estiva','service',NULL,NULL,NULL,false,false),
('a2fb6799-cf42-4cb2-9f56-bf75537544da','Slot Invernale','service',NULL,NULL,NULL,false,false),
('46709f62-3f5a-4025-965a-c5fcedcec826','Asciugamano Sport','store_product',NULL,'671549a7-ed15-4eab-886d-4dff3f331d4d','Asciugamano Sport',false,true),
('a62ef5f8-355e-4bbc-a235-e19572d3e70f','Baseball Cup','store_product','bd9eb000-971e-4b4d-bdfa-fe0db9b61350','bd9eb000-971e-4b4d-bdfa-fe0db9b61350','Baseball Cup',true,true),
('c0aaddaa-6980-4db5-97ac-4e41e2bb4203','Borsone Padel','store_product','9596fe52-7982-4a26-9140-68a1462c3e6d','9596fe52-7982-4a26-9140-68a1462c3e6d','Borsone Padel',false,false),
('4a875fa4-5b51-4f4c-9209-0bf3be66b1d9','Felpa Donna','store_product','641f2fe6-8fc7-471c-a35e-118ccaa5d4d8','641f2fe6-8fc7-471c-a35e-118ccaa5d4d8','Felpa Movi',true,true),
('007de8b9-a69b-4749-a6f2-a4f9498d2a89','Felpa Uomo','store_product','6f71f1cd-6058-4521-b762-3a3689c45e79','6f71f1cd-6058-4521-b762-3a3689c45e79','Felpa Movi',true,true),
('a0faea73-495e-47db-9bbb-bfa32f291d5c','Grip in cuoio HEXIA','store_product','e6416369-e3c0-4ec6-97df-c4376a91aa66','e6416369-e3c0-4ec6-97df-c4376a91aa66','HEXIA Grip',false,false),
('86a8408b-4b98-466e-b084-47ff136c1b30','Pantalone Unisex','store_product','a79ceb30-7f9c-40ed-a234-c4580c99ca2e','a79ceb30-7f9c-40ed-a234-c4580c99ca2e','Jogger',true,true),
('df69b1e0-f1c2-495c-891f-b1c064f74be6','Polsino XL','store_product','4de0a099-1451-437b-9a57-6d2e5be749ea','4de0a099-1451-437b-9a57-6d2e5be749ea','Polsino Movi',true,true),
('bd301b3d-6f20-417a-820c-d0f2b7c69918','Short Uomo Tecnico','store_product','5a715132-77f5-412e-a817-7135e7e9507f','5a715132-77f5-412e-a817-7135e7e9507f','Short Uomo',true,true),
('5edf4f7e-965d-4462-b645-df999872bc17','Softshell Unisex','store_product','204baf4f-f236-42c2-a93d-c4c27ca7d2b5','204baf4f-f236-42c2-a93d-c4c27ca7d2b5','SoftShell 300',true,true),
('975e5de0-e691-4e6a-b4bc-e002dbfbf42b','T-Shirt Tecnica Donna','store_product','dc4d1e5c-c321-430a-b35a-468fcedd0bd0','dc4d1e5c-c321-430a-b35a-468fcedd0bd0','T-Shirt Tecnica Donna',true,true),
('bc0249ca-ea94-448f-afc4-27614468c9c6','T-shirt Tecnica UOMO','store_product','721949fd-bb78-46e5-a723-75e8c97cd240','721949fd-bb78-46e5-a723-75e8c97cd240','T-Shirt Tecnica Uomo',true,true),
('1b1718ab-aba8-44bb-a2de-d90992e596a7','Tubo Palline','store_product',NULL,'f442259b-1e5b-437a-b0ba-3d056d9d617d','Palline Nucleon',false,false);

DO $guards$ DECLARE detail text; BEGIN
 IF (SELECT count(*) FROM pf08_reward_classification_map)<>26
 OR (SELECT count(*) FROM pf08_reward_classification_map WHERE target_type='service')<>13
 OR (SELECT count(*) FROM pf08_reward_classification_map WHERE target_type='store_product')<>13 THEN
  RAISE EXCEPTION 'PF08B2C3_MAPPING_DEFINITION_INVALID'; END IF;

 SELECT string_agg(m.reward_id::text,',') INTO detail FROM pf08_reward_classification_map m LEFT JOIN public.rewards_catalog r ON r.id=m.reward_id WHERE r.id IS NULL;
 IF detail IS NOT NULL THEN RAISE EXCEPTION 'PF08B2C3_REWARD_MISSING: %',detail; END IF;
 SELECT string_agg(m.reward_id::text,',') INTO detail FROM pf08_reward_classification_map m JOIN public.rewards_catalog r ON r.id=m.reward_id WHERE r.name IS DISTINCT FROM m.expected_name;
 IF detail IS NOT NULL THEN RAISE EXCEPTION 'PF08B2C3_REWARD_NAME_MISMATCH: %',detail; END IF;
 SELECT string_agg(m.reward_id::text,',') INTO detail FROM pf08_reward_classification_map m JOIN public.rewards_catalog r ON r.id=m.reward_id WHERE NOT r.is_active;
 IF detail IS NOT NULL THEN RAISE EXCEPTION 'PF08B2C3_REWARD_NOT_ACTIVE: %',detail; END IF;
 SELECT string_agg(m.reward_id::text,',') INTO detail FROM pf08_reward_classification_map m JOIN public.rewards_catalog r ON r.id=m.reward_id WHERE r.fulfillment_type IS NOT NULL AND r.fulfillment_type IS DISTINCT FROM m.target_type;
 IF detail IS NOT NULL THEN RAISE EXCEPTION 'PF08B2C3_FULFILLMENT_CONFLICT: %',detail; END IF;
 SELECT string_agg(m.reward_id::text,',') INTO detail FROM pf08_reward_classification_map m JOIN public.rewards_catalog r ON r.id=m.reward_id WHERE r.store_product_id IS DISTINCT FROM m.expected_current_product_id;
 IF detail IS NOT NULL THEN RAISE EXCEPTION 'PF08B2C3_STORE_LINK_MISMATCH: %',detail; END IF;
 SELECT string_agg(m.reward_id::text,',') INTO detail FROM pf08_reward_classification_map m JOIN public.rewards_catalog r ON r.id=m.reward_id WHERE r.requires_store_variant IS DISTINCT FROM m.expected_current_variant;
 IF detail IS NOT NULL THEN RAISE EXCEPTION 'PF08B2C3_VARIANT_POLICY_MISMATCH: %',detail; END IF;
 SELECT string_agg(m.reward_id::text,',') INTO detail FROM pf08_reward_classification_map m LEFT JOIN public.store_products p ON p.id=m.target_product_id WHERE m.target_type='store_product' AND (p.id IS NULL OR p.name IS DISTINCT FROM m.expected_product_name OR NOT p.is_active);
 IF detail IS NOT NULL THEN RAISE EXCEPTION 'PF08B2C3_STORE_PRODUCT_MISMATCH: %',detail; END IF;
END $guards$;

UPDATE public.rewards_catalog r SET store_product_id=m.target_product_id,requires_store_variant=m.target_variant,updated_at=now()
FROM pf08_reward_classification_map m WHERE r.id=m.reward_id AND m.target_type='store_product'
AND (r.store_product_id IS DISTINCT FROM m.target_product_id OR r.requires_store_variant IS DISTINCT FROM m.target_variant);
UPDATE public.rewards_catalog r SET fulfillment_type=m.target_type,updated_at=now()
FROM pf08_reward_classification_map m WHERE r.id=m.reward_id AND r.fulfillment_type IS DISTINCT FROM m.target_type;

DO $post$ DECLARE detail text; BEGIN
 IF (SELECT count(*) FROM public.rewards_catalog WHERE is_active)<>26
 OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type='service')<>13
 OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type='store_product')<>13
 OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type='custom_physical')<>0
 OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type='partner')<>0
 OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type IS NULL)<>0 THEN
  RAISE EXCEPTION 'PF08B2C3_ACTIVE_TOTALS_MISMATCH'; END IF;

 SELECT string_agg(m.reward_id::text,',') INTO detail FROM pf08_reward_classification_map m JOIN public.rewards_catalog r ON r.id=m.reward_id LEFT JOIN public.store_products p ON p.id=r.store_product_id
 WHERE r.fulfillment_type IS DISTINCT FROM m.target_type OR r.store_product_id IS DISTINCT FROM m.target_product_id OR r.requires_store_variant IS DISTINCT FROM m.target_variant
 OR (m.target_type='store_product' AND (p.id IS NULL OR NOT p.is_active));
 IF detail IS NOT NULL THEN RAISE EXCEPTION 'PF08B2C3_CLASSIFICATION_POSTCONDITION: %',detail; END IF;

 -- Variant-required products need at least one coherent identity. False-flag
 -- products may have zero (untracked) or exactly one (auto-resolved), never >1.
 SELECT string_agg(r.id::text,',') INTO detail FROM public.rewards_catalog r
 WHERE r.is_active AND r.fulfillment_type='store_product' AND r.requires_store_variant
 AND NOT EXISTS(SELECT 1 FROM public.store_product_stock s JOIN public.store_product_colors c ON c.id=s.color_id AND c.product_id=r.store_product_id AND c.is_active
 JOIN public.store_product_sizes z ON z.id=s.size_id AND z.product_id=r.store_product_id AND z.is_active
 WHERE s.product_id=r.store_product_id AND s.is_active);
 IF detail IS NOT NULL THEN RAISE EXCEPTION 'PF08B2C3_STORE_VARIANT_UNUSABLE: %',detail; END IF;

 SELECT string_agg(r.id::text,',') INTO detail FROM public.rewards_catalog r WHERE r.is_active AND r.fulfillment_type='store_product' AND NOT r.requires_store_variant
 AND (SELECT count(*) FROM public.store_product_stock s WHERE s.product_id=r.store_product_id AND s.is_active)>1;
 IF detail IS NOT NULL THEN RAISE EXCEPTION 'PF08B2C3_FALSE_VARIANT_AMBIGUOUS: %',detail; END IF;
END $post$;

COMMIT;
