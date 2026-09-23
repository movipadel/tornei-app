\set ON_ERROR_STOP on
BEGIN;

-- Three-profile operator workflow with a realistic historical canonical profile.
INSERT INTO public.users(id,full_name,phone,email,gender,created_at) VALUES
 ('d2000000-0000-4000-8000-000000000001','Massimiliano Rinaudo','3479400001','massimiliano.group-ux@example.invalid','M',now()-interval '3 years'),
 ('d2000000-0000-4000-8000-000000000002','Massimiliano Rinaudo','3479400002',' MASSIMILIANO.GROUP-UX@EXAMPLE.INVALID ','M',now()-interval '2 days'),
 ('d2000000-0000-4000-8000-000000000003','Massimiliano Rinaudo','3479400003','massimiliano.group-ux@example.invalid ','M',now()-interval '1 day');
INSERT INTO public.loyalty_memberships(id,user_id,status,membership_code,tax_code,membership_type)
VALUES ('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','approved','GROUP-UX','MRNTEST','ASC');
INSERT INTO public.loyalty_transactions(id,membership_id,type,source,points_delta,notes)
VALUES ('d3100000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','earn','manual_adjustment',47,'group UX fixture');
INSERT INTO public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points,customer_name,customer_phone,customer_email)
VALUES ('d3400000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','delivered','CENTALLO','euro',12,0,'Historical snapshot','3479400001','snapshot.group-ux@example.invalid');
INSERT INTO public.medical_certificates(id,user_id,file_path,status)
VALUES ('d3600000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','tests/group-ux.pdf','approved');
INSERT INTO public.tournaments(id,name,type,category,date,time,location,max_participants)
VALUES ('d5000000-0000-4000-8000-000000000001','Group UX Tournament','Baraonda','Misto',current_date,'20:00','Local',16);
INSERT INTO public.tournament_registrations(id,tournament_id,position,is_reserve,p1_name,p1_phone,p1_gender,user_id)
VALUES ('d5100000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',1,false,'Massimiliano Rinaudo','3479400001','M','d2000000-0000-4000-8000-000000000001');

SELECT public.run_user_duplicate_scan(NULL);

DO $test$
DECLARE g uuid; created jsonb; executed jsonb; winners jsonb;
BEGIN
  SELECT id INTO g FROM public.user_duplicate_review_groups
   WHERE signal_type='normalized_email' AND signal_value='massimiliano.group-ux@example.invalid' AND NOT is_stale;
  winners:=jsonb_build_object('full_name','d2000000-0000-4000-8000-000000000001','phone','d2000000-0000-4000-8000-000000000001',
    'email','d2000000-0000-4000-8000-000000000001','gender','d2000000-0000-4000-8000-000000000001');
  PERFORM public.save_user_duplicate_review_decision(g,'approved','d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002',
    ARRAY['d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000003']::uuid[],winners,'group UX first source',NULL);
  created:=public.create_reviewed_user_merge_operation(g,'d2000000-0000-4000-8000-000000000002',NULL,'group UX first source');
  executed:=public.execute_reviewed_user_merge((created->>'operation_id')::uuid,created->'preview'->>'fingerprint',NULL);
  IF executed->>'state'<>'completed' THEN RAISE EXCEPTION 'first source failed: %',executed; END IF;

  PERFORM public.save_user_duplicate_review_decision(g,'approved','d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003',
    ARRAY['d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003']::uuid[],winners,'group UX second source',NULL);
  created:=public.create_reviewed_user_merge_operation(g,'d2000000-0000-4000-8000-000000000003',NULL,'group UX second source');
  executed:=public.execute_reviewed_user_merge((created->>'operation_id')::uuid,created->'preview'->>'fingerprint',NULL);
  IF executed->>'state'<>'completed' THEN RAISE EXCEPTION 'second source failed: %',executed; END IF;

  IF (SELECT count(*) FROM public.users WHERE id IN('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000003') AND identity_status='active')<>1 THEN
    RAISE EXCEPTION 'three-profile workflow did not leave one active profile';
  END IF;
  IF EXISTS(SELECT 1 FROM public.users WHERE id IN('d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000003') AND merged_into_user_id<>'d2000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'source alias is incorrect';
  END IF;
  IF (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id='d3000000-0000-4000-8000-000000000001')<>47
     OR NOT EXISTS(SELECT 1 FROM public.store_orders WHERE id='d3400000-0000-4000-8000-000000000001' AND user_id='d2000000-0000-4000-8000-000000000001' AND customer_email='snapshot.group-ux@example.invalid')
     OR NOT EXISTS(SELECT 1 FROM public.medical_certificates WHERE id='d3600000-0000-4000-8000-000000000001' AND user_id='d2000000-0000-4000-8000-000000000001')
     OR NOT EXISTS(SELECT 1 FROM public.tournament_registrations WHERE id='d5100000-0000-4000-8000-000000000001' AND user_id='d2000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'historical business data changed';
  END IF;
  IF (SELECT count(DISTINCT operation_id) FROM public.user_merge_journal WHERE canonical_user_id='d2000000-0000-4000-8000-000000000001')<>2 THEN
    RAISE EXCEPTION 'pairwise evidence was not retained';
  END IF;
END $test$;

-- Exact partial-group regression: merge one member, scan, recover successor, merge remainder.
INSERT INTO public.users(id,full_name,phone,email,gender,created_at) VALUES
 ('e2000000-0000-4000-8000-000000000011','Partial Canonical','3479410011','partial.group-ux@example.invalid','F',now()-interval '2 years'),
 ('e2000000-0000-4000-8000-000000000012','Partial Empty One','3479410012',' PARTIAL.GROUP-UX@EXAMPLE.INVALID ','F',now()-interval '2 days'),
 ('e2000000-0000-4000-8000-000000000013','Partial Empty Two','3479410013','partial.group-ux@example.invalid ','F',now()-interval '1 day');
SELECT public.run_user_duplicate_scan(NULL);

DO $test$
DECLARE old_g uuid; current_g uuid; created jsonb; executed jsonb; winners jsonb;
BEGIN
  SELECT id INTO old_g FROM public.user_duplicate_review_groups
   WHERE signal_type='normalized_email' AND signal_value='partial.group-ux@example.invalid' AND NOT is_stale;
  winners:=jsonb_build_object('full_name','e2000000-0000-4000-8000-000000000011','phone','e2000000-0000-4000-8000-000000000011',
    'email','e2000000-0000-4000-8000-000000000011','gender','e2000000-0000-4000-8000-000000000011');
  PERFORM public.save_user_duplicate_review_decision(old_g,'approved','e2000000-0000-4000-8000-000000000011','e2000000-0000-4000-8000-000000000012',
    ARRAY['e2000000-0000-4000-8000-000000000011','e2000000-0000-4000-8000-000000000012','e2000000-0000-4000-8000-000000000013']::uuid[],winners,'partial first source',NULL);
  created:=public.create_reviewed_user_merge_operation(old_g,'e2000000-0000-4000-8000-000000000012',NULL,'partial first source');
  executed:=public.execute_reviewed_user_merge((created->>'operation_id')::uuid,created->'preview'->>'fingerprint',NULL);
  IF executed->>'state'<>'completed' THEN RAISE EXCEPTION 'partial first source failed: %',executed; END IF;
  PERFORM public.run_user_duplicate_scan(NULL);
  IF NOT (SELECT is_stale FROM public.user_duplicate_review_groups WHERE id=old_g) THEN RAISE EXCEPTION 'original partial group was not marked stale'; END IF;
  SELECT id INTO current_g FROM public.user_duplicate_review_groups
   WHERE signal_type='normalized_email' AND signal_value='partial.group-ux@example.invalid' AND NOT is_stale AND id<>old_g ORDER BY updated_at DESC LIMIT 1;
  IF current_g IS NULL THEN RAISE EXCEPTION 'successor group was not rebuilt'; END IF;
  PERFORM public.save_user_duplicate_review_decision(current_g,'approved','e2000000-0000-4000-8000-000000000011','e2000000-0000-4000-8000-000000000013',
    ARRAY['e2000000-0000-4000-8000-000000000011','e2000000-0000-4000-8000-000000000013']::uuid[],winners,'partial remaining source',NULL);
  created:=public.create_reviewed_user_merge_operation(current_g,'e2000000-0000-4000-8000-000000000013',NULL,'partial remaining source');
  executed:=public.execute_reviewed_user_merge((created->>'operation_id')::uuid,created->'preview'->>'fingerprint',NULL);
  IF executed->>'state'<>'completed' OR EXISTS(SELECT 1 FROM public.users WHERE id IN('e2000000-0000-4000-8000-000000000012','e2000000-0000-4000-8000-000000000013') AND identity_status<>'merged') THEN
    RAISE EXCEPTION 'partial recovery did not resolve remainder: %',executed;
  END IF;
END $test$;

ROLLBACK;
