\set ON_ERROR_STOP on
-- LOCAL TEST FIXTURE ONLY
-- DO NOT APPLY TO PRODUCTION
-- Sanitized catalog/configuration subset from PF-08B2C3_PRODUCTION_METADATA_EVIDENCE.txt.
-- Contains no customers, memberships, redemptions, orders, ledger rows, or secrets.

UPDATE public.rewards_catalog SET is_active=false WHERE is_active;

INSERT INTO public.store_products(id,category_id,line_id,name,base_price_euro,base_price_points,allow_euro,allow_points,allow_mixed,is_active,sort_order) VALUES
('671549a7-ed15-4eab-886d-4dff3f331d4d','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Asciugamano Sport',0,0,false,true,false,true,1001),
('bd9eb000-971e-4b4d-bdfa-fe0db9b61350','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Baseball Cup',0,0,false,true,false,true,1002),
('9596fe52-7982-4a26-9140-68a1462c3e6d','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Borsone Padel',0,0,false,true,false,true,1003),
('641f2fe6-8fc7-471c-a35e-118ccaa5d4d8','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Felpa Movi',0,0,false,true,false,true,1004),
('6f71f1cd-6058-4521-b762-3a3689c45e79','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Felpa Movi',0,0,false,true,false,true,1005),
('e6416369-e3c0-4ec6-97df-c4376a91aa66','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','HEXIA Grip',0,0,false,true,false,true,1006),
('a79ceb30-7f9c-40ed-a234-c4580c99ca2e','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Jogger',0,0,false,true,false,true,1007),
('4de0a099-1451-437b-9a57-6d2e5be749ea','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Polsino Movi',0,0,false,true,false,true,1008),
('5a715132-77f5-412e-a817-7135e7e9507f','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Short Uomo',0,0,false,true,false,true,1009),
('204baf4f-f236-42c2-a93d-c4c27ca7d2b5','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','SoftShell 300',0,0,false,true,false,true,1010),
('dc4d1e5c-c321-430a-b35a-468fcedd0bd0','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','T-Shirt Tecnica Donna',0,0,false,true,false,true,1011),
('721949fd-bb78-46e5-a723-75e8c97cd240','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','T-Shirt Tecnica Uomo',0,0,false,true,false,true,1012),
('f442259b-1e5b-437a-b0ba-3d056d9d617d','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Palline Nucleon',0,0,false,true,false,true,1013);

INSERT INTO public.store_product_colors(id,product_id,color_name,is_active,sort_order) VALUES
('6d99400e-d24b-4dbf-8b1e-caea9b8ab536','671549a7-ed15-4eab-886d-4dff3f331d4d','Grigio',true,1),('fb3cce5f-6d7e-44db-8bcb-9572ea01058d','671549a7-ed15-4eab-886d-4dff3f331d4d','Lime',true,2),
('26932cdb-8698-4fdd-8641-1a6f6d979b4c','bd9eb000-971e-4b4d-bdfa-fe0db9b61350','Nero',true,1),('f46a7db8-4dd8-428a-958c-b6bca33a8208','9596fe52-7982-4a26-9140-68a1462c3e6d','Nero',true,1),
('0a89ec45-930e-40a0-b5e5-6ddfc492dbb5','641f2fe6-8fc7-471c-a35e-118ccaa5d4d8','Bianco',true,1),('20dcc8d1-af5d-404a-bc31-91f5f17ef669','6f71f1cd-6058-4521-b762-3a3689c45e79','Giallo',true,1),
('8aa98f7a-ae1d-4b60-ac95-ec198bf1bb41','e6416369-e3c0-4ec6-97df-c4376a91aa66','MOVI WINTER',true,1),('3d9c2444-dd86-476d-92fa-3263b077a460','a79ceb30-7f9c-40ed-a234-c4580c99ca2e','Nero',true,1),
('cd0fb684-0dd7-47dd-8e3c-bafb59f44a44','4de0a099-1451-437b-9a57-6d2e5be749ea','Nero',true,1),('452265c1-43d5-4d60-a1e8-074747e32820','5a715132-77f5-412e-a817-7135e7e9507f','Bianco',true,1),
('15cab610-3f82-43b2-94a7-c8e703fe516c','204baf4f-f236-42c2-a93d-c4c27ca7d2b5','Nero',true,1),('1248b10e-590c-43e6-9f57-50adda2945ad','dc4d1e5c-c321-430a-b35a-468fcedd0bd0','Blu Navy',true,1),
('1534011e-7199-4c1e-b49c-36152c3203e5','721949fd-bb78-46e5-a723-75e8c97cd240','Arancio Neon',true,1),
('333f9e39-712e-48e6-b4e6-25ea61bf8a76','f442259b-1e5b-437a-b0ba-3d056d9d617d','Giallo',true,1),('f74eaf3f-1861-4274-a62a-1c8fdce07bdc','f442259b-1e5b-437a-b0ba-3d056d9d617d','Giallo',true,2);

INSERT INTO public.store_product_sizes(id,product_id,size_label,is_active,sort_order) VALUES
('f77e05db-fd13-4e08-a04f-4665aee48504','671549a7-ed15-4eab-886d-4dff3f331d4d','UNICA',true,1),('4dfaccc3-c023-4360-bd7a-099f9cb51a63','bd9eb000-971e-4b4d-bdfa-fe0db9b61350','UNICA',true,1),
('0a6d574e-6fc0-4cf6-9d68-bd7edd8d684b','9596fe52-7982-4a26-9140-68a1462c3e6d','UNICA',true,1),('2712ccf4-7993-44aa-8ada-ffc09891594c','641f2fe6-8fc7-471c-a35e-118ccaa5d4d8','S',true,1),
('1bcc3bb9-a27e-4ef8-8b5a-dffd6d1607e5','6f71f1cd-6058-4521-b762-3a3689c45e79','S',true,1),('c5e49b7a-fd99-46f3-b5c5-4bacddaa9180','e6416369-e3c0-4ec6-97df-c4376a91aa66','UNICA',true,1),
('1aa9307e-9bf5-46cd-a9d2-b1495303b616','a79ceb30-7f9c-40ed-a234-c4580c99ca2e','L',true,1),('9acedba9-71d2-4674-8585-24be6a054118','4de0a099-1451-437b-9a57-6d2e5be749ea','UNICA',true,1),
('8b1197c4-cb88-4fe8-ad4a-39d0e5df0204','5a715132-77f5-412e-a817-7135e7e9507f','XXXL',true,1),('1351f11a-c9a3-479e-bafc-f81f9373423f','204baf4f-f236-42c2-a93d-c4c27ca7d2b5','XXL',true,1),
('46517362-567e-44e7-ba99-da1a1411a9a9','dc4d1e5c-c321-430a-b35a-468fcedd0bd0','XS',true,1),('0126ae0a-6b01-4405-ad6e-be63cbf8d9d1','721949fd-bb78-46e5-a723-75e8c97cd240','L',true,1),
('2d4c4b19-5d17-48ed-ad32-9250d69d3a58','f442259b-1e5b-437a-b0ba-3d056d9d617d','UNICA',true,1);

INSERT INTO public.store_product_stock(id,product_id,color_id,size_id,stock_qty,sku,is_active) VALUES
('62ad4b5b-32c0-4aa7-8484-c7a8386185bb','671549a7-ed15-4eab-886d-4dff3f331d4d','6d99400e-d24b-4dbf-8b1e-caea9b8ab536','f77e05db-fd13-4e08-a04f-4665aee48504',NULL,'PF08C3-ASCIUGAMANO-GRIGIO',true),
('8020805e-e473-42a5-bf78-01426aa12f3c','671549a7-ed15-4eab-886d-4dff3f331d4d','fb3cce5f-6d7e-44db-8bcb-9572ea01058d','f77e05db-fd13-4e08-a04f-4665aee48504',NULL,'PF08C3-ASCIUGAMANO-LIME',true),
('587b37fb-9d98-439d-bd29-22440c5121cf','bd9eb000-971e-4b4d-bdfa-fe0db9b61350','26932cdb-8698-4fdd-8641-1a6f6d979b4c','4dfaccc3-c023-4360-bd7a-099f9cb51a63',NULL,'PF08C3-BASEBALL',true),
('e1ef6585-ecfd-47e2-9541-133c46d4f1e7','9596fe52-7982-4a26-9140-68a1462c3e6d','f46a7db8-4dd8-428a-958c-b6bca33a8208','0a6d574e-6fc0-4cf6-9d68-bd7edd8d684b',NULL,'PF08C3-BORSONE',true),
('4a3eca79-9eca-4c4f-a158-8fabab995655','641f2fe6-8fc7-471c-a35e-118ccaa5d4d8','0a89ec45-930e-40a0-b5e5-6ddfc492dbb5','2712ccf4-7993-44aa-8ada-ffc09891594c',NULL,'PF08C3-FELPA-DONNA',true),
('0dad07b0-ceac-45be-929f-172f18334215','6f71f1cd-6058-4521-b762-3a3689c45e79','20dcc8d1-af5d-404a-bc31-91f5f17ef669','1bcc3bb9-a27e-4ef8-8b5a-dffd6d1607e5',NULL,'PF08C3-FELPA-UOMO',true),
('7906bede-1e3a-4dc8-be44-03c28ddd1971','e6416369-e3c0-4ec6-97df-c4376a91aa66','8aa98f7a-ae1d-4b60-ac95-ec198bf1bb41','c5e49b7a-fd99-46f3-b5c5-4bacddaa9180',NULL,'PF08C3-GRIP',true),
('7d5b4e22-dd60-4ff0-9059-8a650a3f6692','a79ceb30-7f9c-40ed-a234-c4580c99ca2e','3d9c2444-dd86-476d-92fa-3263b077a460','1aa9307e-9bf5-46cd-a9d2-b1495303b616',NULL,'PF08C3-PANTALONE',true),
('49c9adf5-5728-4258-a380-b5fc40aa81ea','4de0a099-1451-437b-9a57-6d2e5be749ea','cd0fb684-0dd7-47dd-8e3c-bafb59f44a44','9acedba9-71d2-4674-8585-24be6a054118',NULL,'PF08C3-POLSINO',true),
('89602ac2-d6c8-45d4-a8e2-b3cd2fff8049','5a715132-77f5-412e-a817-7135e7e9507f','452265c1-43d5-4d60-a1e8-074747e32820','8b1197c4-cb88-4fe8-ad4a-39d0e5df0204',NULL,'PF08C3-SHORT',true),
('3b5ed903-a874-4318-a0a0-93800d0a2b7f','204baf4f-f236-42c2-a93d-c4c27ca7d2b5','15cab610-3f82-43b2-94a7-c8e703fe516c','1351f11a-c9a3-479e-bafc-f81f9373423f',NULL,'PF08C3-SOFTSHELL',true),
('f8cc10b5-2634-44de-8a25-8a474159801b','dc4d1e5c-c321-430a-b35a-468fcedd0bd0','1248b10e-590c-43e6-9f57-50adda2945ad','46517362-567e-44e7-ba99-da1a1411a9a9',NULL,'PF08C3-TSHIRT-DONNA',true),
('08dc5528-2837-4ae6-a8a6-d5f7e573851e','721949fd-bb78-46e5-a723-75e8c97cd240','1534011e-7199-4c1e-b49c-36152c3203e5','0126ae0a-6b01-4405-ad6e-be63cbf8d9d1',NULL,'PF08C3-TSHIRT-UOMO',true);

INSERT INTO public.rewards_catalog(id,name,description,category,points_cost,is_active,stock_qty,reward_type,store_product_id,requires_store_variant,fulfillment_type) VALUES
('157d2e20-293e-4770-9e8d-e04b03aed110','1 Quota in Partita Guidata','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('71b119b8-3b41-4c2d-a391-2c4aebad3f1b','1 Quota Lezione di coppia','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('314199e2-3e2d-4a53-9abc-9388c0eb60b6','1 Quota Lezione Quadrupla','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('fe82c247-cc46-4097-9697-6a9e2075d2ed','1 Quota Lezione Tripla','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('2797a5b7-d51f-4695-8ff8-2ad1435f0fbb','Lezione Privata','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('f4c0b587-ad8b-4170-a132-a1b41638e8ce','Pacchetto Scalare 100 €','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('4471c0e5-5db1-4525-8884-91facbf8dc08','Pacchetto Scalare 200 €','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('6bef04ae-ca90-4ab8-aef3-a33974392674','Quota Iscrizione Torneo','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('778ebc4e-9559-45c6-9640-042a55aeb209','Quota slot Estiva','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('ca0966bb-79b8-4126-9419-ca2de74ec729','Quota slot Invernale','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('cce9d976-50cb-47d1-9aac-fa20ceb7cd32','Quota Torneo in Coppia','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('f9ec6558-ae36-470f-9c83-11146467d40f','Slot Estiva','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('a2fb6799-cf42-4cb2-9f56-bf75537544da','Slot Invernale','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('46709f62-3f5a-4025-965a-c5fcedcec826','Asciugamano Sport','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL),
('a62ef5f8-355e-4bbc-a235-e19572d3e70f','Baseball Cup','PF08B2C3 fixture','MOVIBACK',100,true,10,'club','bd9eb000-971e-4b4d-bdfa-fe0db9b61350',true,NULL),
('c0aaddaa-6980-4db5-97ac-4e41e2bb4203','Borsone Padel','PF08B2C3 fixture','MOVIBACK',100,true,10,'club','9596fe52-7982-4a26-9140-68a1462c3e6d',false,NULL),
('4a875fa4-5b51-4f4c-9209-0bf3be66b1d9','Felpa Donna','PF08B2C3 fixture','MOVIBACK',100,true,10,'club','641f2fe6-8fc7-471c-a35e-118ccaa5d4d8',true,NULL),
('007de8b9-a69b-4749-a6f2-a4f9498d2a89','Felpa Uomo','PF08B2C3 fixture','MOVIBACK',100,true,10,'club','6f71f1cd-6058-4521-b762-3a3689c45e79',true,NULL),
('a0faea73-495e-47db-9bbb-bfa32f291d5c','Grip in cuoio HEXIA','PF08B2C3 fixture','MOVIBACK',100,true,10,'club','e6416369-e3c0-4ec6-97df-c4376a91aa66',false,NULL),
('86a8408b-4b98-466e-b084-47ff136c1b30','Pantalone Unisex','PF08B2C3 fixture','MOVIBACK',100,true,10,'club','a79ceb30-7f9c-40ed-a234-c4580c99ca2e',true,NULL),
('df69b1e0-f1c2-495c-891f-b1c064f74be6','Polsino XL','PF08B2C3 fixture','MOVIBACK',100,true,10,'club','4de0a099-1451-437b-9a57-6d2e5be749ea',true,NULL),
('bd301b3d-6f20-417a-820c-d0f2b7c69918','Short Uomo Tecnico','PF08B2C3 fixture','MOVIBACK',100,true,10,'club','5a715132-77f5-412e-a817-7135e7e9507f',true,NULL),
('5edf4f7e-965d-4462-b645-df999872bc17','Softshell Unisex','PF08B2C3 fixture','MOVIBACK',100,true,10,'club','204baf4f-f236-42c2-a93d-c4c27ca7d2b5',true,NULL),
('975e5de0-e691-4e6a-b4bc-e002dbfbf42b','T-Shirt Tecnica Donna','PF08B2C3 fixture','MOVIBACK',100,true,10,'club','dc4d1e5c-c321-430a-b35a-468fcedd0bd0',true,NULL),
('bc0249ca-ea94-448f-afc4-27614468c9c6','T-shirt Tecnica UOMO','PF08B2C3 fixture','MOVIBACK',100,true,10,'club','721949fd-bb78-46e5-a723-75e8c97cd240',true,NULL),
('1b1718ab-aba8-44bb-a2de-d90992e596a7','Tubo Palline','PF08B2C3 fixture','MOVIBACK',100,true,10,'club',NULL,false,NULL);

DO $fixture_assert$ BEGIN
 IF (SELECT count(*) FROM public.rewards_catalog WHERE is_active)<>26
    OR (SELECT count(*) FROM public.store_products WHERE sort_order BETWEEN 1001 AND 1013)<>13
    OR EXISTS (SELECT 1 FROM public.store_product_stock WHERE product_id='f442259b-1e5b-437a-b0ba-3d056d9d617d') THEN
  RAISE EXCEPTION 'PF08B2C3_FIXTURE_POSTCONDITION';
 END IF;
END $fixture_assert$;
