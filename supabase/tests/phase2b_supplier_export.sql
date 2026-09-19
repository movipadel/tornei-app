\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE service_role;

INSERT INTO public.store_products (
  id, category_id, line_id, name, base_price_euro, base_price_points,
  allow_euro, allow_points, allow_mixed, is_active, sort_order
) VALUES
  ('62000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Asciugamano Sport',25,250,true,true,true,true,950),
  ('62000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','Tubo Palline',8,80,true,true,true,true,951);

INSERT INTO public.store_product_colors (id,product_id,color_name,is_active,sort_order)
VALUES ('62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000001','Lime',true,1);
INSERT INTO public.store_product_sizes (id,product_id,size_label,is_active,sort_order)
VALUES ('62000000-0000-4000-8000-000000000012','62000000-0000-4000-8000-000000000001','UNICA',true,1);
INSERT INTO public.store_product_stock (id,product_id,color_id,size_id,stock_qty,sku,is_active)
VALUES ('62000000-0000-4000-8000-000000000013','62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000012',9,'PHASE2B-TOWEL',true);

INSERT INTO public.rewards_catalog (
  id,name,points_cost,is_active,reward_type,store_product_id,requires_store_variant,fulfillment_type
) VALUES
  ('62000000-0000-4000-8000-000000000021','Asciugamano Sport',250,true,'club','62000000-0000-4000-8000-000000000001',true,'store_product'),
  ('62000000-0000-4000-8000-000000000022','Tubo Palline',80,true,'club','62000000-0000-4000-8000-000000000002',false,'store_product'),
  ('62000000-0000-4000-8000-000000000023','Lezione prova',100,true,'club',NULL,false,'service');

INSERT INTO public.reward_redemptions (
  id,membership_id,reward_id,points_cost,status,fulfillment_type,qr_token,manual_code
) VALUES
  ('62000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000002001','62000000-0000-4000-8000-000000000021',250,'requested','store_product','PHASE2B-QR-1','P2BAAAAB'),
  ('62000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000002001','62000000-0000-4000-8000-000000000022',80,'requested','store_product','PHASE2B-QR-2','P2BAAAAC'),
  ('62000000-0000-4000-8000-000000000033','00000000-0000-4000-8000-000000002001','62000000-0000-4000-8000-000000000023',100,'requested','service','PHASE2B-QR-3','P2BAAAAD'),
  ('62000000-0000-4000-8000-000000000034','00000000-0000-4000-8000-000000002001','62000000-0000-4000-8000-000000000021',250,'ready','store_product','PHASE2B-QR-4','P2BAAAAE');

INSERT INTO public.store_orders (
  id,user_id,status,pickup_club,payment_mode,total_euro,total_points,
  customer_name,order_type,related_redemption_id,special_title
) VALUES
  ('62000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',58,0,'PHASE2B STORE','catalog',NULL,NULL),
  ('62000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000001001','pending','CENTALLO','points',0,250,'PHASE2B MOVIBACK TOWEL','reward_redemption','62000000-0000-4000-8000-000000000031','Asciugamano Sport'),
  ('62000000-0000-4000-8000-000000000043','00000000-0000-4000-8000-000000001001','pending','CENTALLO','points',0,80,'PHASE2B MOVIBACK BALLS','reward_redemption','62000000-0000-4000-8000-000000000032','Tubo Palline'),
  ('62000000-0000-4000-8000-000000000044','00000000-0000-4000-8000-000000001001','pending','CENTALLO','points',0,100,'PHASE2B INVALID SERVICE','reward_redemption','62000000-0000-4000-8000-000000000033','Lezione prova'),
  ('62000000-0000-4000-8000-000000000045','00000000-0000-4000-8000-000000001001','ready','CENTALLO','euro',25,0,'PHASE2B READY STORE','catalog',NULL,NULL),
  ('62000000-0000-4000-8000-000000000046','00000000-0000-4000-8000-000000001001','ready','CENTALLO','points',0,250,'PHASE2B READY MOVIBACK','reward_redemption','62000000-0000-4000-8000-000000000034','Asciugamano Sport'),
  ('62000000-0000-4000-8000-000000000047','00000000-0000-4000-8000-000000001001','delivered','CENTALLO','euro',25,0,'PHASE2B DELIVERED','catalog',NULL,NULL),
  ('62000000-0000-4000-8000-000000000048','00000000-0000-4000-8000-000000001001','cancelled','CENTALLO','euro',25,0,'PHASE2B CANCELLED','catalog',NULL,NULL),
  ('62000000-0000-4000-8000-000000000049','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',25,0,'PHASE2B MALFORMED','reward_redemption',NULL,NULL);

INSERT INTO public.store_order_items (
  id,order_id,product_id,color_id,size_id,product_name,color_name,size_label,quantity,
  unit_price_euro,total_euro
) VALUES
  ('62000000-0000-4000-8000-000000000051','62000000-0000-4000-8000-000000000041','62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000012','Asciugamano Sport','Lime','UNICA',2,25,50),
  ('62000000-0000-4000-8000-000000000052','62000000-0000-4000-8000-000000000041','62000000-0000-4000-8000-000000000002',NULL,NULL,'Tubo Palline',NULL,NULL,1,8,8),
  ('62000000-0000-4000-8000-000000000053','62000000-0000-4000-8000-000000000042','62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000012','Asciugamano Sport','Lime','UNICA',2,0,0),
  ('62000000-0000-4000-8000-000000000054','62000000-0000-4000-8000-000000000043','62000000-0000-4000-8000-000000000002',NULL,NULL,'Tubo Palline',NULL,NULL,1,0,0),
  ('62000000-0000-4000-8000-000000000055','62000000-0000-4000-8000-000000000044',NULL,NULL,NULL,'Lezione prova',NULL,NULL,1,0,0),
  ('62000000-0000-4000-8000-000000000056','62000000-0000-4000-8000-000000000045','62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000012','Asciugamano Sport','Lime','UNICA',1,25,25),
  ('62000000-0000-4000-8000-000000000057','62000000-0000-4000-8000-000000000046','62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000012','Asciugamano Sport','Lime','UNICA',1,0,0),
  ('62000000-0000-4000-8000-000000000058','62000000-0000-4000-8000-000000000047','62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000012','Asciugamano Sport','Lime','UNICA',1,25,25),
  ('62000000-0000-4000-8000-000000000059','62000000-0000-4000-8000-000000000048','62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000012','Asciugamano Sport','Lime','UNICA',1,25,25),
  ('62000000-0000-4000-8000-000000000060','62000000-0000-4000-8000-000000000049','62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000012','Asciugamano Sport','Lime','UNICA',1,25,25);

DO $test$
DECLARE
  result jsonb;
  replay jsonb;
  batch_id uuid;
  before_stock integer;
  after_stock integer;
  before_points bigint;
  after_points bigint;
  before_notifications integer;
  after_notifications integer;
BEGIN
  IF public.supplier_export_eligible_unit_count() <> 6 THEN
    RAISE EXCEPTION 'PHASE2B_ELIGIBILITY';
  END IF;

  SELECT stock_qty INTO before_stock FROM public.store_product_stock WHERE id='62000000-0000-4000-8000-000000000013';
  SELECT coalesce(sum(points_delta),0) INTO before_points FROM public.loyalty_transactions;
  SELECT count(*) INTO before_notifications FROM public.communications;

  result := public.claim_supplier_export_batch('62000000-0000-4000-8000-000000000071','phase2b-test');
  batch_id := (result->>'batch_id')::uuid;
  IF coalesce((result->>'created')::boolean,false) IS NOT TRUE
     OR (result->>'item_count')::integer <> 4
     OR (result->>'unit_count')::integer <> 6
     OR (SELECT count(*) FROM public.store_order_items WHERE supplier_export_batch_id=batch_id) <> 4
     OR public.supplier_export_eligible_unit_count() <> 0 THEN
    RAISE EXCEPTION 'PHASE2B_FIRST_BATCH';
  END IF;

  IF (SELECT sum(quantity) FROM public.store_order_items WHERE supplier_export_batch_id=batch_id AND product_id='62000000-0000-4000-8000-000000000001' AND color_id='62000000-0000-4000-8000-000000000011' AND size_id='62000000-0000-4000-8000-000000000012') <> 4
     OR (SELECT sum(quantity) FROM public.store_order_items WHERE supplier_export_batch_id=batch_id AND product_id='62000000-0000-4000-8000-000000000002' AND color_id IS NULL AND size_id IS NULL) <> 2 THEN
    RAISE EXCEPTION 'PHASE2B_AGGREGATE_IDENTITIES';
  END IF;

  replay := public.claim_supplier_export_batch('62000000-0000-4000-8000-000000000071','phase2b-test');
  IF coalesce((replay->>'replayed')::boolean,false) IS NOT TRUE
     OR replay->>'batch_id' <> batch_id::text
     OR (SELECT count(*) FROM public.supplier_export_batches WHERE idempotency_key='62000000-0000-4000-8000-000000000071') <> 1 THEN
    RAISE EXCEPTION 'PHASE2B_REPLAY';
  END IF;

  IF coalesce((public.claim_supplier_export_batch('62000000-0000-4000-8000-000000000072','phase2b-test')->>'empty')::boolean,false) IS NOT TRUE
     OR (SELECT count(*) FROM public.supplier_export_batches WHERE idempotency_key='62000000-0000-4000-8000-000000000072') <> 0 THEN
    RAISE EXCEPTION 'PHASE2B_EMPTY_BATCH';
  END IF;

  SELECT stock_qty INTO after_stock FROM public.store_product_stock WHERE id='62000000-0000-4000-8000-000000000013';
  SELECT coalesce(sum(points_delta),0) INTO after_points FROM public.loyalty_transactions;
  SELECT count(*) INTO after_notifications FROM public.communications;
  IF before_stock <> after_stock OR before_points <> after_points OR before_notifications <> after_notifications
     OR (SELECT status FROM public.store_orders WHERE id='62000000-0000-4000-8000-000000000042') <> 'pending'
     OR (SELECT status FROM public.reward_redemptions WHERE id='62000000-0000-4000-8000-000000000031') <> 'requested' THEN
    RAISE EXCEPTION 'PHASE2B_SIDE_EFFECT';
  END IF;

  BEGIN
    UPDATE public.store_order_items SET supplier_export_batch_id=NULL WHERE id='62000000-0000-4000-8000-000000000053';
    RAISE EXCEPTION 'PHASE2B_IMMUTABILITY_NOT_ENFORCED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SUPPLIER_EXPORT_MEMBERSHIP_IMMUTABLE' THEN RAISE; END IF;
  END;
END;
$test$;

-- A later order enters a distinct batch; ready-before-export never enters it.
INSERT INTO public.store_orders (id,user_id,status,pickup_club,payment_mode,total_euro,total_points,customer_name,order_type)
VALUES
 ('62000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',75,0,'PHASE2B LATER','catalog'),
 ('62000000-0000-4000-8000-000000000062','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',25,0,'PHASE2B READY FIRST','catalog');
INSERT INTO public.store_order_items (id,order_id,product_id,color_id,size_id,product_name,color_name,size_label,quantity,unit_price_euro,total_euro)
VALUES
 ('62000000-0000-4000-8000-000000000063','62000000-0000-4000-8000-000000000061','62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000012','Asciugamano Sport','Lime','UNICA',3,25,75),
 ('62000000-0000-4000-8000-000000000064','62000000-0000-4000-8000-000000000062','62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000011','62000000-0000-4000-8000-000000000012','Asciugamano Sport','Lime','UNICA',1,25,25);

SELECT public.mark_physical_store_order_ready(
 '00000000-0000-4000-8000-000000001001',
 '62000000-0000-4000-8000-000000000073',
 '62000000-0000-4000-8000-000000000062'
);

DO $test$
DECLARE result jsonb; batch_id uuid;
BEGIN
  IF public.supplier_export_eligible_unit_count() <> 3 THEN RAISE EXCEPTION 'PHASE2B_READY_BEFORE'; END IF;
  result := public.claim_supplier_export_batch('62000000-0000-4000-8000-000000000074','phase2b-test');
  batch_id := (result->>'batch_id')::uuid;
  IF (result->>'unit_count')::integer <> 3
     OR (SELECT supplier_export_batch_id FROM public.store_order_items WHERE id='62000000-0000-4000-8000-000000000064') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE2B_SECOND_BATCH';
  END IF;
END;
$test$;

-- Ready-after-export preserves the original batch while normal MoviBack sync runs.
SELECT public.mark_physical_store_order_ready(
 '00000000-0000-4000-8000-000000001001',
 '62000000-0000-4000-8000-000000000075',
 '62000000-0000-4000-8000-000000000042'
);

DO $test$
BEGIN
  IF (SELECT status FROM public.store_orders WHERE id='62000000-0000-4000-8000-000000000042') <> 'ready'
     OR (SELECT status FROM public.reward_redemptions WHERE id='62000000-0000-4000-8000-000000000031') <> 'ready'
     OR (SELECT supplier_export_batch_id FROM public.store_order_items WHERE id='62000000-0000-4000-8000-000000000053') IS NULL
     OR (SELECT stock_qty FROM public.store_product_stock WHERE id='62000000-0000-4000-8000-000000000013') <> 9 THEN
    RAISE EXCEPTION 'PHASE2B_READY_AFTER';
  END IF;
END;
$test$;

SELECT 'PHASE2B_SUPPLIER_EXPORT_PASS' AS result;
ROLLBACK;
