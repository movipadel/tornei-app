-- PF-08B2C4 PREPARED ROLLBACK — DO NOT EXECUTE AUTOMATICALLY.
-- Safe only before dependent route adoption and before new business data relies
-- on classified fulfillment. After that boundary, use a coordinated forward fix.
BEGIN;
CREATE TEMP TABLE pf08_b2c4_pre(reward_id uuid PRIMARY KEY,product_id uuid,variant_flag boolean NOT NULL) ON COMMIT DROP;
INSERT INTO pf08_b2c4_pre VALUES
('157d2e20-293e-4770-9e8d-e04b03aed110',NULL,false),('71b119b8-3b41-4c2d-a391-2c4aebad3f1b',NULL,false),('314199e2-3e2d-4a53-9abc-9388c0eb60b6',NULL,false),('fe82c247-cc46-4097-9697-6a9e2075d2ed',NULL,false),('2797a5b7-d51f-4695-8ff8-2ad1435f0fbb',NULL,false),('f4c0b587-ad8b-4170-a132-a1b41638e8ce',NULL,false),('4471c0e5-5db1-4525-8884-91facbf8dc08',NULL,false),('6bef04ae-ca90-4ab8-aef3-a33974392674',NULL,false),('778ebc4e-9559-45c6-9640-042a55aeb209',NULL,false),('ca0966bb-79b8-4126-9419-ca2de74ec729',NULL,false),('cce9d976-50cb-47d1-9aac-fa20ceb7cd32',NULL,false),('f9ec6558-ae36-470f-9c83-11146467d40f',NULL,false),('a2fb6799-cf42-4cb2-9f56-bf75537544da',NULL,false),
('46709f62-3f5a-4025-965a-c5fcedcec826',NULL,false),('a62ef5f8-355e-4bbc-a235-e19572d3e70f','bd9eb000-971e-4b4d-bdfa-fe0db9b61350',true),('c0aaddaa-6980-4db5-97ac-4e41e2bb4203','9596fe52-7982-4a26-9140-68a1462c3e6d',false),('4a875fa4-5b51-4f4c-9209-0bf3be66b1d9','641f2fe6-8fc7-471c-a35e-118ccaa5d4d8',true),('007de8b9-a69b-4749-a6f2-a4f9498d2a89','6f71f1cd-6058-4521-b762-3a3689c45e79',true),('a0faea73-495e-47db-9bbb-bfa32f291d5c','e6416369-e3c0-4ec6-97df-c4376a91aa66',false),('86a8408b-4b98-466e-b084-47ff136c1b30','a79ceb30-7f9c-40ed-a234-c4580c99ca2e',true),('df69b1e0-f1c2-495c-891f-b1c064f74be6','4de0a099-1451-437b-9a57-6d2e5be749ea',true),('bd301b3d-6f20-417a-820c-d0f2b7c69918','5a715132-77f5-412e-a817-7135e7e9507f',true),('5edf4f7e-965d-4462-b645-df999872bc17','204baf4f-f236-42c2-a93d-c4c27ca7d2b5',true),('975e5de0-e691-4e6a-b4bc-e002dbfbf42b','dc4d1e5c-c321-430a-b35a-468fcedd0bd0',true),('bc0249ca-ea94-448f-afc4-27614468c9c6','721949fd-bb78-46e5-a723-75e8c97cd240',true),('1b1718ab-aba8-44bb-a2de-d90992e596a7',NULL,false);

DO $guard$ BEGIN
 IF (SELECT count(*) FROM pf08_b2c4_pre)<>26 OR
    (SELECT count(*) FROM public.rewards_catalog r JOIN pf08_b2c4_pre p ON p.reward_id=r.id
     WHERE CASE
      WHEN r.id='46709f62-3f5a-4025-965a-c5fcedcec826' THEN r.fulfillment_type='store_product' AND r.store_product_id='671549a7-ed15-4eab-886d-4dff3f331d4d' AND r.requires_store_variant
      WHEN r.id='1b1718ab-aba8-44bb-a2de-d90992e596a7' THEN r.fulfillment_type='store_product' AND r.store_product_id='f442259b-1e5b-437a-b0ba-3d056d9d617d' AND NOT r.requires_store_variant
      WHEN p.product_id IS NULL THEN r.fulfillment_type='service' AND r.store_product_id IS NULL AND NOT r.requires_store_variant
      ELSE r.fulfillment_type='store_product' AND r.store_product_id=p.product_id AND r.requires_store_variant=p.variant_flag
     END)<>26 THEN
  RAISE EXCEPTION 'PF08B2C4_ROLLBACK_STATE_MISMATCH'; END IF;
END $guard$;

UPDATE public.rewards_catalog r SET fulfillment_type=NULL,store_product_id=p.product_id,requires_store_variant=p.variant_flag,updated_at=now()
FROM pf08_b2c4_pre p WHERE r.id=p.reward_id;

DO $post$ BEGIN
 IF (SELECT count(*) FROM public.rewards_catalog r JOIN pf08_b2c4_pre p ON p.reward_id=r.id WHERE r.fulfillment_type IS NULL AND r.store_product_id IS NOT DISTINCT FROM p.product_id AND r.requires_store_variant IS NOT DISTINCT FROM p.variant_flag)<>26 THEN
  RAISE EXCEPTION 'PF08B2C4_ROLLBACK_POSTCONDITION'; END IF;
END $post$;
COMMIT;
