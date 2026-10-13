BEGIN;

CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',message; END IF; END $$;

DO $$
DECLARE
  staff uuid := 'f2700000-0000-4000-8000-000000000001';
  canonical_user uuid := 'a2700000-0000-4000-8000-000000000001';
  source_user uuid := 'a2700000-0000-4000-8000-000000000002';
  active_user uuid := 'a2700000-0000-4000-8000-000000000003';
  canonical_membership uuid := 'b2700000-0000-4000-8000-000000000001';
  source_membership uuid := 'b2700000-0000-4000-8000-000000000002';
  active_membership uuid := 'b2700000-0000-4000-8000-000000000003';
  agreement uuid := 'c2700000-0000-4000-8000-000000000001';
  active_entitlement uuid := 'd2700000-0000-4000-8000-000000000001';
  historical_entitlement uuid := 'd2700000-0000-4000-8000-000000000002';
  not_activated_entitlement uuid := 'd2700000-0000-4000-8000-000000000003';
  pending_entitlement uuid := 'd2700000-0000-4000-8000-000000000004';
  batch_one uuid := 'e2700000-0000-4000-8000-000000000001';
  batch_two uuid := 'e2700000-0000-4000-8000-000000000002';
  report_before jsonb; report_after jsonb; history jsonb; group_id uuid; created jsonb; merged jsonb; fp text;
BEGIN
  INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES(staff,'Synthetic C6 Operator','c6-operator@example.invalid','admin',true);
  INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
    (canonical_user,'Synthetic C6 Canonical','3400000271','c6-merge@example.invalid','M'),
    (source_user,'Synthetic C6 Source','3400000272',' C6-MERGE@EXAMPLE.INVALID ','M'),
    (active_user,'Synthetic C6 Active','3400000275','c6-active@example.invalid','F');
  INSERT INTO public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type) VALUES
    (canonical_membership,canonical_user,'approved','C6-CANONICAL','C6-SAME-TAX',now(),staff,'FITP'),
    (source_membership,source_user,'approved','C6-SOURCE','C6-SAME-TAX',now(),staff,'FITP'),
    (active_membership,active_user,'approved','C6-ACTIVE','C6-ACTIVE-TAX',now(),staff,'FITP');
  INSERT INTO public.moviback_agreements(id,name,slug,status,multiplier,valid_from,valid_until,created_by)
    VALUES(agreement,'Synthetic C6 Agreement','synthetic-c6-agreement','active',3,now()-interval '10 days',now()+interval '30 days',staff);
  INSERT INTO public.moviback_agreement_code_batches(id,agreement_id,idempotency_key,quantity,generated_by,valid_from,valid_until) VALUES
    (batch_one,agreement,'02700000-0000-4000-8000-000000000001',4,staff,now()-interval '2 days',now()+interval '20 days'),
    (batch_two,agreement,'02700000-0000-4000-8000-000000000002',3,staff,now()-interval '2 days',now()+interval '20 days');
  INSERT INTO public.moviback_agreement_codes(id,agreement_id,code_hash,code_suffix,batch_id,status,valid_from,valid_until,claimed_at,claimed_by_membership_id,revoked_at,created_by) VALUES
    ('c2710000-0000-4000-8000-000000000001',agreement,'sha256:c6-available','A001',batch_one,'available',now()-interval '1 day',now()+interval '10 days',NULL,NULL,NULL,staff),
    ('c2710000-0000-4000-8000-000000000002',agreement,'sha256:c6-reserved','R002',batch_one,'reserved',now()-interval '1 day',now()+interval '10 days',now(),source_membership,NULL,staff),
    ('c2710000-0000-4000-8000-000000000003',agreement,'sha256:c6-used','U003',batch_one,'used',now()-interval '1 day',now()+interval '10 days',now(),active_membership,NULL,staff),
    ('c2710000-0000-4000-8000-000000000004',agreement,'sha256:c6-closed','C004',batch_one,'closed',now()-interval '1 day',now()+interval '10 days',now(),source_membership,NULL,staff),
    ('c2710000-0000-4000-8000-000000000005',agreement,'sha256:c6-revoked','V005',batch_two,'revoked',now()-interval '1 day',now()+interval '10 days',NULL,NULL,now(),staff),
    ('c2710000-0000-4000-8000-000000000006',agreement,'sha256:c6-expired','E006',batch_two,'expired',now()-interval '10 days',now()-interval '1 day',NULL,NULL,NULL,staff),
    ('c2710000-0000-4000-8000-000000000007',agreement,'sha256:c6-used-source','L007',batch_two,'used',now()-interval '1 day',now()+interval '10 days',now(),source_membership,NULL,staff);
  INSERT INTO public.moviback_agreement_entitlements(id,membership_id,agreement_id,code_id,status,activation_source,activated_at,effective_from,effective_until,revoked_at,revocation_reason,not_activation_reason) VALUES
    (active_entitlement,active_membership,agreement,'c2710000-0000-4000-8000-000000000003','active','code',now()-interval '1 day',now()-interval '1 day',now()+interval '10 days',NULL,NULL,NULL),
    (historical_entitlement,source_membership,agreement,NULL,'revoked','admin',now()-interval '8 days',now()-interval '8 days',NULL,now()-interval '5 days','Synthetic C6 historical revoke',NULL),
    (not_activated_entitlement,source_membership,agreement,'c2710000-0000-4000-8000-000000000004','not_activated','code',NULL,NULL,NULL,NULL,NULL,'agreement_suspended_at_approval'),
    (pending_entitlement,source_membership,agreement,'c2710000-0000-4000-8000-000000000002','pending','code',NULL,NULL,NULL,NULL,NULL,NULL);

  INSERT INTO public.loyalty_transactions(id,membership_id,type,source,euro_amount,points_delta,club,notes,base_points,applied_multiplier,credited_points,agreement_id,entitlement_id,incentive_source,earning_rule_version,source_event_type,source_event_id,idempotency_key) VALUES
    ('72700000-0000-4000-8000-000000000001',active_membership,'earn','club_payment',10,30,'CENTALLO','C6 A',10,3,30,agreement,active_entitlement,'agreement','moviback-credit-v1','c6_test','agreement-a','12700000-0000-4000-8000-000000000001'),
    ('72700000-0000-4000-8000-000000000002',active_membership,'earn','club_payment',10,36,'CENTALLO','C6 B FITP',12,3,36,agreement,active_entitlement,'agreement','moviback-credit-v1','c6_test','agreement-b','12700000-0000-4000-8000-000000000002'),
    ('72700000-0000-4000-8000-000000000003',source_membership,'earn','club_payment',10,30,'MANTA','C6 D agreement wins',10,3,30,agreement,historical_entitlement,'agreement','moviback-credit-v1','c6_test','agreement-d','12700000-0000-4000-8000-000000000003'),
    ('72700000-0000-4000-8000-000000000004',active_membership,'earn','club_payment',10,40,'CENTALLO','C6 C promo wins',10,4,40,NULL,NULL,'promo','moviback-credit-v1','c6_test','promo-c','12700000-0000-4000-8000-000000000004'),
    ('72700000-0000-4000-8000-000000000005',active_membership,'earn','club_payment',10,30,'CENTALLO','C6 E promo tie wins',10,3,30,NULL,NULL,'promo','moviback-credit-v1','c6_test','promo-e','12700000-0000-4000-8000-000000000005');
  INSERT INTO public.loyalty_transactions(membership_id,type,source,points_delta,notes)
    VALUES(source_membership,'earn','manual_adjustment',7,'Synthetic C6 legacy unclassified');

  report_before:=public.get_moviback_agreement_report(agreement);
  PERFORM pg_temp.assert_true(report_before->'codes'=jsonb_build_object('total',7,'available',1,'reserved',1,'claimed',0,'used',2,'closed',1,'revoked',1,'expired',1),'code metrics inaccurate');
  PERFORM pg_temp.assert_true((report_before->'entitlements'->>'active')::int=1 AND (report_before->'entitlements'->>'pending')::int=1 AND (report_before->'entitlements'->>'not_activated')::int=1 AND (report_before->'entitlements'->>'revoked')::int=1,'entitlement metrics inaccurate');
  PERFORM pg_temp.assert_true((report_before->'memberships'->>'unique_involved')::int=2 AND (report_before->'memberships'->>'currently_active')::int=1,'membership metrics inaccurate');
  PERFORM pg_temp.assert_true((report_before->'points'->>'earn_transactions')::int=3 AND (report_before->'points'->>'base_points')::int=32 AND (report_before->'points'->>'credited_points')::int=96 AND (report_before->'points'->>'bonus_points')::int=64,'agreement points attribution inaccurate');
  PERFORM pg_temp.assert_true((report_before->'points'->>'legacy_unclassified_rows')::int=1,'legacy row classification inaccurate');
  PERFORM pg_temp.assert_true(jsonb_array_length(report_before->'batches')=2 AND jsonb_array_length(report_before->'point_activity')=3,'batch or trace rows inaccurate');
  PERFORM pg_temp.assert_true(report_before::text !~* '(code_hash|sha256:c6-)','report leaked hash');
  UPDATE public.moviback_agreements SET status='suspended' WHERE id=agreement;
  PERFORM pg_temp.assert_true((public.get_moviback_agreement_report(agreement)->'memberships'->>'currently_active')::int=0,'suspended agreement reported as currently active');
  UPDATE public.moviback_agreements SET status='active' WHERE id=agreement;
  history:=public.get_moviback_membership_agreement_history(source_membership);
  PERFORM pg_temp.assert_true(jsonb_array_length(history)=3 AND history::text !~* 'code_hash','membership history inaccurate or unsafe');

  PERFORM public.run_user_duplicate_scan(staff);
  SELECT id INTO group_id FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='c6-merge@example.invalid';
  PERFORM public.save_user_duplicate_review_decision(group_id,'approved',canonical_user,source_user,ARRAY[canonical_user,source_user],jsonb_build_object('full_name',canonical_user,'phone',canonical_user,'email',canonical_user,'gender',canonical_user),'Synthetic C6 safe history merge',staff);
  created:=public.create_reviewed_user_merge_operation(group_id,source_user,staff,'Synthetic C6 safe history merge');
  fp:=created->'preview'->>'fingerprint';
  PERFORM pg_temp.assert_true((created->'preview'->'moviback'->'source_membership'->>'entitlements')::int=3,'entitlements absent from preview');
  merged:=public.execute_reviewed_user_merge((created->>'operation_id')::uuid,fp,staff);
  PERFORM pg_temp.assert_true(merged->>'state'='completed' AND (merged->'verification'->>'passed')::boolean,'reviewed C6 merge failed');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.moviback_agreement_entitlements WHERE membership_id=source_membership),'orphan source entitlement');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.moviback_agreement_codes WHERE claimed_by_membership_id=source_membership),'orphan source code claim');
  PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM public.moviback_agreement_audit_events WHERE entitlement_id=historical_entitlement AND event_type='membership_reconciled'),'entitlement reconciliation audit missing');
  report_after:=public.get_moviback_agreement_report(agreement);
  PERFORM pg_temp.assert_true(report_before->'codes'=report_after->'codes' AND report_before->'entitlements'=report_after->'entitlements' AND report_before->'points'=report_after->'points','agreement totals changed after merge');
  PERFORM pg_temp.assert_true((report_after->'memberships'->>'unique_involved')::int=2,'membership identity was not consolidated');
END $$;

DO $$
DECLARE staff uuid := 'f2700000-0000-4000-8000-000000000001'; preview jsonb; before_fp text; after_fp text;
BEGIN
  INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
    ('a2720000-0000-4000-8000-000000000001','Synthetic Conflict Canonical','3400000273','c6-conflict-c@example.invalid','F'),
    ('a2720000-0000-4000-8000-000000000002','Synthetic Conflict Source','3400000274','c6-conflict-s@example.invalid','F');
  INSERT INTO public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type) VALUES
    ('b2720000-0000-4000-8000-000000000001','a2720000-0000-4000-8000-000000000001','approved','C6-CONFLICT-C','C6-CONFLICT-TAX',now(),staff,'ASC'),
    ('b2720000-0000-4000-8000-000000000002','a2720000-0000-4000-8000-000000000002','approved','C6-CONFLICT-S','C6-CONFLICT-TAX',now(),staff,'ASC');
  INSERT INTO public.moviback_agreement_entitlements(membership_id,agreement_id,status,activation_source,activated_at,effective_from) VALUES
    ('b2720000-0000-4000-8000-000000000001','c2700000-0000-4000-8000-000000000001','active','admin',now(),now()),
    ('b2720000-0000-4000-8000-000000000002','c2700000-0000-4000-8000-000000000001','active','admin',now(),now());
  preview:=public.preview_dual_moviback_reconciliation('a2720000-0000-4000-8000-000000000002','a2720000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true(NOT (preview->>'safe')::boolean AND preview->'blockers' @> '["agreement_active_or_scheduled_conflict"]'::jsonb,'active-active convention conflict not blocked');
  before_fp:=preview->>'fingerprint';
  UPDATE public.moviback_agreement_entitlements SET effective_until=now()+interval '5 days' WHERE membership_id='b2720000-0000-4000-8000-000000000002';
  after_fp:=public.preview_dual_moviback_reconciliation('a2720000-0000-4000-8000-000000000002','a2720000-0000-4000-8000-000000000001')->>'fingerprint';
  PERFORM pg_temp.assert_true(before_fp<>after_fp,'convention state absent from merge fingerprint');
END $$;

SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.get_moviback_agreement_report('c2700000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'browser reporting allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.get_moviback_membership_agreement_history('b2700000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'browser history allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT 'moviback corporate conventions C6 reporting SQL acceptance PASS' AS result;
ROLLBACK;
