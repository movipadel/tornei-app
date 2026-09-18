\set ON_ERROR_STOP on
-- LOCAL ONLY. Requires fixture + successful candidate. Everything rolls back.
BEGIN;
SET LOCAL ROLE service_role;

DO $structure$ DECLARE bad integer; BEGIN
 IF (SELECT count(*) FROM public.rewards_catalog WHERE is_active)<>26
 OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type='service')<>13
 OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type='store_product')<>13
 OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type IN('custom_physical','partner'))<>0
 OR (SELECT count(*) FROM public.rewards_catalog WHERE is_active AND fulfillment_type IS NULL)<>0 THEN
  RAISE EXCEPTION 'PF08B2C3_VALIDATION_TOTALS'; END IF;

 SELECT count(*) INTO bad FROM (VALUES
 ('46709f62-3f5a-4025-965a-c5fcedcec826'::uuid,'671549a7-ed15-4eab-886d-4dff3f331d4d'::uuid,true),
 ('a62ef5f8-355e-4bbc-a235-e19572d3e70f','bd9eb000-971e-4b4d-bdfa-fe0db9b61350',true),
 ('c0aaddaa-6980-4db5-97ac-4e41e2bb4203','9596fe52-7982-4a26-9140-68a1462c3e6d',false),
 ('4a875fa4-5b51-4f4c-9209-0bf3be66b1d9','641f2fe6-8fc7-471c-a35e-118ccaa5d4d8',true),
 ('007de8b9-a69b-4749-a6f2-a4f9498d2a89','6f71f1cd-6058-4521-b762-3a3689c45e79',true),
 ('a0faea73-495e-47db-9bbb-bfa32f291d5c','e6416369-e3c0-4ec6-97df-c4376a91aa66',false),
 ('86a8408b-4b98-466e-b084-47ff136c1b30','a79ceb30-7f9c-40ed-a234-c4580c99ca2e',true),
 ('df69b1e0-f1c2-495c-891f-b1c064f74be6','4de0a099-1451-437b-9a57-6d2e5be749ea',true),
 ('bd301b3d-6f20-417a-820c-d0f2b7c69918','5a715132-77f5-412e-a817-7135e7e9507f',true),
 ('5edf4f7e-965d-4462-b645-df999872bc17','204baf4f-f236-42c2-a93d-c4c27ca7d2b5',true),
 ('975e5de0-e691-4e6a-b4bc-e002dbfbf42b','dc4d1e5c-c321-430a-b35a-468fcedd0bd0',true),
 ('bc0249ca-ea94-448f-afc4-27614468c9c6','721949fd-bb78-46e5-a723-75e8c97cd240',true),
 ('1b1718ab-aba8-44bb-a2de-d90992e596a7','f442259b-1e5b-437a-b0ba-3d056d9d617d',false)
 ) e(reward_id,product_id,variant_flag)
 LEFT JOIN public.rewards_catalog r ON r.id=e.reward_id
 LEFT JOIN public.store_products p ON p.id=e.product_id
 WHERE r.fulfillment_type IS DISTINCT FROM 'store_product' OR r.store_product_id IS DISTINCT FROM e.product_id
 OR r.requires_store_variant IS DISTINCT FROM e.variant_flag OR p.id IS NULL OR NOT p.is_active;
 IF bad<>0 THEN RAISE EXCEPTION 'PF08B2C3_VALIDATION_STORE_MAP'; END IF;
 IF EXISTS(SELECT 1 FROM public.rewards_catalog WHERE is_active AND fulfillment_type='service' AND (store_product_id IS NOT NULL OR requires_store_variant)) THEN
  RAISE EXCEPTION 'PF08B2C3_VALIDATION_SERVICE_CONFIG'; END IF;
END $structure$;

SAVEPOINT service_case;
DO $test$ DECLARE r jsonb; rid uuid; BEGIN
 r:=public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','52000000-0000-4000-8000-000000000001','157d2e20-293e-4770-9e8d-e04b03aed110',NULL,NULL); rid:=(r#>>'{data,id}')::uuid;
 IF r#>>'{data,status}'<>'ready' OR EXISTS(SELECT 1 FROM public.store_orders WHERE related_redemption_id=rid) THEN RAISE EXCEPTION 'PF08B2C3_SERVICE_RPC'; END IF;
END $test$;
ROLLBACK TO SAVEPOINT service_case;

SAVEPOINT asciugamano_rejections;
DO $test$ DECLARE err text; BEGIN
 BEGIN PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','52000000-0000-4000-8000-000000000002','46709f62-3f5a-4025-965a-c5fcedcec826',NULL,NULL); err:='NO'; EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM; END;
 IF err<>'PF08_MISSING_REQUIRED_VARIANT' THEN RAISE EXCEPTION 'PF08B2C3_ASCIUGAMANO_MISSING'; END IF;
 BEGIN PERFORM public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','52000000-0000-4000-8000-000000000003','46709f62-3f5a-4025-965a-c5fcedcec826','333f9e39-712e-48e6-b4e6-25ea61bf8a76','f77e05db-fd13-4e08-a04f-4665aee48504'); err:='NO'; EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM; END;
 IF err<>'PF08_INVALID_STORE_VARIANT' THEN RAISE EXCEPTION 'PF08B2C3_ASCIUGAMANO_INVALID'; END IF;
END $test$;
ROLLBACK TO SAVEPOINT asciugamano_rejections;

SAVEPOINT asciugamano_grigio;
DO $test$ DECLARE r jsonb; oid uuid; BEGIN
 r:=public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','52000000-0000-4000-8000-000000000004','46709f62-3f5a-4025-965a-c5fcedcec826','6d99400e-d24b-4dbf-8b1e-caea9b8ab536','f77e05db-fd13-4e08-a04f-4665aee48504'); oid:=(r#>>'{data,store_order_id}')::uuid;
 IF (SELECT count(*) FROM public.store_order_items WHERE order_id=oid AND color_name='Grigio' AND size_label='UNICA')<>1 THEN RAISE EXCEPTION 'PF08B2C3_ASCIUGAMANO_GRIGIO'; END IF;
END $test$;
ROLLBACK TO SAVEPOINT asciugamano_grigio;

SAVEPOINT asciugamano_lime;
DO $test$ DECLARE r jsonb; oid uuid; BEGIN
 r:=public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','52000000-0000-4000-8000-000000000005','46709f62-3f5a-4025-965a-c5fcedcec826','fb3cce5f-6d7e-44db-8bcb-9572ea01058d','f77e05db-fd13-4e08-a04f-4665aee48504'); oid:=(r#>>'{data,store_order_id}')::uuid;
 IF (SELECT count(*) FROM public.store_order_items WHERE order_id=oid AND color_name='Lime')<>1 THEN RAISE EXCEPTION 'PF08B2C3_ASCIUGAMANO_LIME'; END IF;
END $test$;
ROLLBACK TO SAVEPOINT asciugamano_lime;

SAVEPOINT auto_resolve_finite;
UPDATE public.store_product_stock SET stock_qty=2 WHERE id='e1ef6585-ecfd-47e2-9541-133c46d4f1e7';
DO $test$ DECLARE r jsonb; c jsonb; cr jsonb; rid uuid; BEGIN
 r:=public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','52000000-0000-4000-8000-000000000006','c0aaddaa-6980-4db5-97ac-4e41e2bb4203',NULL,NULL); rid:=(r#>>'{data,id}')::uuid;
 IF (SELECT stock_qty FROM public.store_product_stock WHERE id='e1ef6585-ecfd-47e2-9541-133c46d4f1e7')<>1 THEN RAISE EXCEPTION 'PF08B2C3_AUTO_RESOLVE_DECREMENT'; END IF;
 c:=public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000007',rid,'PF08B2C3 test');
 cr:=public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000007',rid,'PF08B2C3 test');
 IF c#>>'{data,status}'<>'cancelled' OR (cr->>'replayed')::boolean IS NOT TRUE OR (SELECT stock_qty FROM public.store_product_stock WHERE id='e1ef6585-ecfd-47e2-9541-133c46d4f1e7')<>2 THEN RAISE EXCEPTION 'PF08B2C3_AUTO_RESOLVE_CANCEL'; END IF;
END $test$;
ROLLBACK TO SAVEPOINT auto_resolve_finite;

SAVEPOINT tubo_stockless;
DO $test$ DECLARE r jsonb; replay jsonb; c jsonb; cr jsonb; rid uuid; oid uuid; reward_before integer; BEGIN
 SELECT stock_qty INTO reward_before FROM public.rewards_catalog WHERE id='1b1718ab-aba8-44bb-a2de-d90992e596a7';
 r:=public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','52000000-0000-4000-8000-000000000008','1b1718ab-aba8-44bb-a2de-d90992e596a7',NULL,NULL);
 replay:=public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','52000000-0000-4000-8000-000000000008','1b1718ab-aba8-44bb-a2de-d90992e596a7',NULL,NULL); rid:=(r#>>'{data,id}')::uuid; oid:=(r#>>'{data,store_order_id}')::uuid;
 IF (replay->>'replayed')::boolean IS NOT TRUE OR (replay->>'should_notify_staff')::boolean IS NOT FALSE
 OR EXISTS(SELECT 1 FROM public.store_product_stock WHERE product_id='f442259b-1e5b-437a-b0ba-3d056d9d617d')
 OR (SELECT count(*) FROM public.store_orders WHERE id=oid AND related_redemption_id=rid)<>1
 OR (SELECT count(*) FROM public.store_order_items WHERE order_id=oid AND product_id='f442259b-1e5b-437a-b0ba-3d056d9d617d')<>1
 OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND points_delta=-100)<>1 THEN RAISE EXCEPTION 'PF08B2C3_TUBO_REDEEM'; END IF;
 c:=public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000009',rid,'PF08B2C3 test');
 cr:=public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000009',rid,'PF08B2C3 test');
 IF c#>>'{data,status}'<>'cancelled' OR (cr->>'replayed')::boolean IS NOT TRUE
 OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='1b1718ab-aba8-44bb-a2de-d90992e596a7')<>reward_before
 OR EXISTS(SELECT 1 FROM public.store_product_stock WHERE product_id='f442259b-1e5b-437a-b0ba-3d056d9d617d') THEN RAISE EXCEPTION 'PF08B2C3_TUBO_CANCEL'; END IF;
END $test$;
ROLLBACK TO SAVEPOINT tubo_stockless;

ROLLBACK;
\echo 'PF-08B2C3 classification and PF-08B2R3 smart-redemption validation PASS'
