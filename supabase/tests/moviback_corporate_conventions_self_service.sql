\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',message; END IF; END $$;
DO $$
DECLARE
 staff uuid := 'f2500000-0000-4000-8000-000000000001';
 user_a uuid := 'a2500000-0000-4000-8000-000000000001'; user_b uuid := 'a2500000-0000-4000-8000-000000000002'; user_c uuid := 'a2500000-0000-4000-8000-000000000003';
 member_a uuid := 'b2500000-0000-4000-8000-000000000001'; member_b uuid := 'b2500000-0000-4000-8000-000000000002'; member_c uuid := 'b2500000-0000-4000-8000-000000000003';
 v_agreement_id uuid := 'c2500000-0000-4000-8000-000000000001'; code_a uuid := 'd2500000-0000-4000-8000-000000000001'; code_b uuid := 'd2500000-0000-4000-8000-000000000002'; code_expired uuid := 'd2500000-0000-4000-8000-000000000003'; code_revoked uuid := 'd2500000-0000-4000-8000-000000000004';
 r jsonb; balance_before bigint;
BEGIN
 INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES(staff,'Synthetic C4 Operator','moviback-c4-operator@example.invalid','admin',true);
 INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
  (user_a,'Synthetic C4 Member A','3400000051','moviback-c4-a@example.invalid','M'),
  (user_b,'Synthetic C4 Member B','3400000052','moviback-c4-b@example.invalid','F'),
  (user_c,'Synthetic C4 Pending','3400000053','moviback-c4-c@example.invalid','M');
 INSERT INTO public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type) VALUES
  (member_a,user_a,'approved','TEST-C4-A','RSSMRA90A01H501U',now(),staff,'ASC'),
  (member_b,user_b,'approved','TEST-C4-B','VRDLGI90A01H501W',now(),staff,'ASC'),
  (member_c,user_c,'pending_review','TEST-C4-C','BNCLCU90A01H501Z',NULL,NULL,'ASC');
 INSERT INTO public.medical_certificates(user_id,file_path,status,expiry_date,reviewed_at,reviewed_by)
 VALUES(user_a,'synthetic/c4-member-a.pdf','approved',current_date+30,now(),staff);
 INSERT INTO public.moviback_agreements(id,name,slug,status,multiplier,valid_from,valid_until,created_by)
 VALUES(v_agreement_id,'TEST C4 X3','test-c4-x3','active',3,now()-interval '1 day',now()+interval '30 days',staff);
 INSERT INTO public.moviback_agreement_codes(id,agreement_id,code_hash,code_suffix,status,valid_from,valid_until,revoked_at,created_by) VALUES
  (code_a,v_agreement_id,'sha256:c4-valid-a','VALIDA','available',now()-interval '1 day',now()+interval '10 days',NULL,staff),
  (code_b,v_agreement_id,'sha256:c4-valid-b','VALIDB','available',now()-interval '1 day',now()+interval '10 days',NULL,staff),
  (code_expired,v_agreement_id,'sha256:c4-expired','EXPIRE','expired',now()-interval '10 days',now()-interval '1 day',NULL,staff),
  (code_revoked,v_agreement_id,'sha256:c4-revoked','REVOKE','revoked',now()-interval '1 day',now()+interval '10 days',now(),staff);
 INSERT INTO public.loyalty_transactions(membership_id,type,source,points_delta,notes) VALUES(member_a,'adjustment','manual_adjustment',40,'Synthetic C4 opening balance');

 r := public.claim_moviback_agreement_code(user_c,'sha256:c4-valid-a');
 PERFORM pg_temp.assert_true(r->>'error_code'='MEMBERSHIP_NOT_ELIGIBLE','pending membership accepted');
 r := public.claim_moviback_agreement_code(user_a,'sha256:not-found');
 PERFORM pg_temp.assert_true(r->>'error_code'='INVALID_CODE','invalid code accepted');
 r := public.claim_moviback_agreement_code(user_b,'sha256:c4-expired');
 PERFORM pg_temp.assert_true(r->>'error_code'='CODE_EXPIRED','expired code accepted');
 r := public.claim_moviback_agreement_code(user_b,'sha256:c4-revoked');
 PERFORM pg_temp.assert_true(r->>'error_code'='CODE_REVOKED','revoked code accepted');

 SELECT coalesce(sum(points_delta),0) INTO balance_before FROM public.loyalty_transactions WHERE membership_id=member_a;
 r := public.claim_moviback_agreement_code(user_a,'sha256:c4-valid-a');
 PERFORM pg_temp.assert_true((r->>'ok')::boolean AND NOT (r->>'replayed')::boolean,'valid claim failed');
 PERFORM pg_temp.assert_true((SELECT status='used' AND claimed_by_membership_id=member_a FROM public.moviback_agreement_codes WHERE id=code_a),'code not consumed atomically');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.moviback_agreement_entitlements WHERE membership_id=member_a AND code_id=code_a AND status='active'),'entitlement missing');
 PERFORM pg_temp.assert_true((SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id=member_a)=balance_before,'activation changed historical balance');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.moviback_agreement_audit_events WHERE code_id=code_a AND actor_user_id=user_a AND event_type='entitlement_activated'),'activation audit missing');
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.moviback_agreement_audit_events WHERE code_id=code_a AND after_state::text LIKE '%c4-valid-a%'),'audit leaked code hash');

 r := public.claim_moviback_agreement_code(user_a,'sha256:c4-valid-a');
 PERFORM pg_temp.assert_true((r->>'ok')::boolean AND (r->>'replayed')::boolean,'self replay not idempotent');
 r := public.claim_moviback_agreement_code(user_b,'sha256:c4-valid-a');
 PERFORM pg_temp.assert_true(r->>'error_code'='CODE_ALREADY_USED','different member reused code');
 r := public.claim_moviback_agreement_code(user_a,'sha256:c4-valid-b');
 PERFORM pg_temp.assert_true(r->>'error_code'='ACTIVE_ENTITLEMENT_EXISTS','second entitlement accepted');
 PERFORM pg_temp.assert_true((SELECT status='available' AND claimed_at IS NULL FROM public.moviback_agreement_codes WHERE id=code_b),'losing code was consumed');

 r := public.credit_moviback_points('TEST-C4-A',10,'CENTALLO','02500000-0000-4000-8000-000000000001','c4_sql','next-earn',staff);
 PERFORM pg_temp.assert_true((r->>'credited_points')::integer=30 AND r->>'effective_incentive_source'='agreement','next earn did not use x3');
 PERFORM pg_temp.assert_true((SELECT applied_multiplier=3 AND agreement_id=v_agreement_id FROM public.loyalty_transactions WHERE id=(r->>'transaction_id')::uuid),'earn attribution missing');
 PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated','public.claim_moviback_agreement_code(uuid,text)','EXECUTE'),'claim RPC exposed directly');
END $$;
SELECT 'moviback corporate conventions C4 SQL acceptance PASS' AS result;
ROLLBACK;
