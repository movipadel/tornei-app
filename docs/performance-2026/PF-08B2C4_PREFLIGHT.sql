-- PF-08B2C4 PRODUCTION PREFLIGHT — SELECT ONLY. MANUAL EXECUTION ONLY.
-- Save the complete output beside the backup/recovery-point identifier.
WITH target(reward_id,expected_name,target_type,current_product_id,target_product_id,product_name,current_flag,target_flag) AS (VALUES
('157d2e20-293e-4770-9e8d-e04b03aed110'::uuid,'1 Quota in Partita Guidata','service',NULL::uuid,NULL::uuid,NULL::text,false,false),
('71b119b8-3b41-4c2d-a391-2c4aebad3f1b','1 Quota Lezione di coppia','service',NULL,NULL,NULL,false,false),('314199e2-3e2d-4a53-9abc-9388c0eb60b6','1 Quota Lezione Quadrupla','service',NULL,NULL,NULL,false,false),
('fe82c247-cc46-4097-9697-6a9e2075d2ed','1 Quota Lezione Tripla','service',NULL,NULL,NULL,false,false),('2797a5b7-d51f-4695-8ff8-2ad1435f0fbb','Lezione Privata','service',NULL,NULL,NULL,false,false),
('f4c0b587-ad8b-4170-a132-a1b41638e8ce','Pacchetto Scalare 100 €','service',NULL,NULL,NULL,false,false),('4471c0e5-5db1-4525-8884-91facbf8dc08','Pacchetto Scalare 200 €','service',NULL,NULL,NULL,false,false),
('6bef04ae-ca90-4ab8-aef3-a33974392674','Quota Iscrizione Torneo','service',NULL,NULL,NULL,false,false),('778ebc4e-9559-45c6-9640-042a55aeb209','Quota slot Estiva','service',NULL,NULL,NULL,false,false),
('ca0966bb-79b8-4126-9419-ca2de74ec729','Quota slot Invernale','service',NULL,NULL,NULL,false,false),('cce9d976-50cb-47d1-9aac-fa20ceb7cd32','Quota Torneo in Coppia','service',NULL,NULL,NULL,false,false),
('f9ec6558-ae36-470f-9c83-11146467d40f','Slot Estiva','service',NULL,NULL,NULL,false,false),('a2fb6799-cf42-4cb2-9f56-bf75537544da','Slot Invernale','service',NULL,NULL,NULL,false,false),
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
('1b1718ab-aba8-44bb-a2de-d90992e596a7','Tubo Palline','store_product',NULL,'f442259b-1e5b-437a-b0ba-3d056d9d617d','Palline Nucleon',false,false)
), audit AS (
 SELECT t.*,r.name actual_name,r.is_active,NULLIF(to_jsonb(r)->>'fulfillment_type','') AS fulfillment_type,r.store_product_id,r.requires_store_variant,p.name actual_product_name,p.is_active product_active,
 (SELECT count(*) FROM public.store_product_stock s WHERE s.product_id=t.target_product_id AND s.is_active) active_stock_count
 FROM target t LEFT JOIN public.rewards_catalog r ON r.id=t.reward_id LEFT JOIN public.store_products p ON p.id=t.target_product_id
)
SELECT section,payload FROM (
 SELECT 1 ord,'SUMMARY' section,jsonb_build_object(
  'target_rows',(SELECT count(*) FROM audit),'missing',(SELECT count(*) FROM audit WHERE actual_name IS NULL),
  'name_mismatch',(SELECT count(*) FROM audit WHERE actual_name IS DISTINCT FROM expected_name),
  'inactive_targets',(SELECT count(*) FROM audit WHERE is_active IS DISTINCT FROM true),
  'non_null_classifications',(SELECT count(*) FROM audit WHERE fulfillment_type IS NOT NULL),
  'current_link_mismatch',(SELECT count(*) FROM audit WHERE store_product_id IS DISTINCT FROM current_product_id),
  'current_flag_mismatch',(SELECT count(*) FROM audit WHERE requires_store_variant IS DISTINCT FROM current_flag),
  'invalid_products',(SELECT count(*) FROM audit WHERE target_type='store_product' AND (actual_product_name IS DISTINCT FROM product_name OR product_active IS DISTINCT FROM true)),
  'variantless_ambiguities',(SELECT count(*) FROM audit a WHERE a.target_type='store_product' AND NOT a.target_flag AND a.active_stock_count>1),
  'variant_required_without_stock',(SELECT count(*) FROM audit a WHERE a.target_type='store_product' AND a.target_flag AND a.active_stock_count=0),
  'unknown_active_rewards',(SELECT count(*) FROM public.rewards_catalog r WHERE r.is_active AND NOT EXISTS(SELECT 1 FROM target t WHERE t.reward_id=r.id)),
  'asciugamano_topology_ok',(SELECT active_stock_count=2 AND EXISTS(SELECT 1 FROM public.store_product_colors c WHERE c.product_id=target_product_id AND c.is_active AND c.color_name='Grigio') AND EXISTS(SELECT 1 FROM public.store_product_colors c WHERE c.product_id=target_product_id AND c.is_active AND c.color_name='Lime') AND EXISTS(SELECT 1 FROM public.store_product_sizes z WHERE z.product_id=target_product_id AND z.is_active AND z.size_label='UNICA') FROM audit WHERE reward_id='46709f62-3f5a-4025-965a-c5fcedcec826'),
  'tubo_zero_stock_ok',(SELECT active_stock_count=0 AND EXISTS(SELECT 1 FROM public.store_product_colors c WHERE c.product_id=target_product_id AND c.is_active) AND EXISTS(SELECT 1 FROM public.store_product_sizes z WHERE z.product_id=target_product_id AND z.is_active AND z.size_label='UNICA') FROM audit WHERE reward_id='1b1718ab-aba8-44bb-a2de-d90992e596a7')) payload
 UNION ALL SELECT 2,'TARGET_REWARDS',coalesce(jsonb_agg(to_jsonb(a) ORDER BY expected_name),'[]') FROM audit a
 UNION ALL SELECT 3,'UNKNOWN_ACTIVE_REWARDS',coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'fulfillment_type',NULLIF(to_jsonb(r)->>'fulfillment_type','')) ORDER BY r.name),'[]') FROM public.rewards_catalog r WHERE r.is_active AND NOT EXISTS(SELECT 1 FROM target t WHERE t.reward_id=r.id)
 UNION ALL SELECT 4,'PREFLIGHT_FINGERPRINTS',jsonb_build_object(
  'redemptions',md5(coalesce((SELECT string_agg(to_jsonb(x)::text,'|' ORDER BY x.id) FROM public.reward_redemptions x),'')),
  'unrelated_rewards',md5(coalesce((SELECT string_agg(to_jsonb(x)::text,'|' ORDER BY x.id) FROM public.rewards_catalog x WHERE NOT EXISTS(SELECT 1 FROM target t WHERE t.reward_id=x.id)),'')))
) report ORDER BY ord;
