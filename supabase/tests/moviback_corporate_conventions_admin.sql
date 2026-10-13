\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',message; END IF; END $$;
DO $$
DECLARE
 v_staff uuid:='f2400000-0000-4000-8000-000000000001'; v_user uuid:='a2400000-0000-4000-8000-000000000001'; v_membership uuid:='b2400000-0000-4000-8000-000000000001';
 v_agreement public.moviback_agreements%rowtype; v_entitlement public.moviback_agreement_entitlements%rowtype; v_code public.moviback_agreement_codes%rowtype; r jsonb; balance_before bigint; failed boolean;
BEGIN
 PERFORM pg_temp.assert_true(to_regclass('public.moviback_agreement_code_batches') IS NOT NULL,'batch table missing');
 INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES(v_staff,'Synthetic C3 Operator','moviback-c3-operator@example.invalid','admin',true);
 INSERT INTO public.users(id,full_name,phone,email,gender) VALUES(v_user,'Synthetic C3 Member','3400000031','moviback-c3-member@example.invalid','M');
 INSERT INTO public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type) VALUES(v_membership,v_user,'approved','TEST-C3-001','RSSMRA90A01H501U',now(),v_staff,'ASC');
 INSERT INTO public.medical_certificates(user_id,file_path,status,expiry_date,reviewed_at,reviewed_by) VALUES(v_user,'synthetic/c3.pdf','approved',current_date+30,now(),v_staff);
 INSERT INTO public.loyalty_transactions(membership_id,type,source,points_delta,notes) VALUES(v_membership,'adjustment','manual_adjustment',25,'Synthetic C3 opening balance');
 SELECT * INTO v_agreement FROM public.create_moviback_agreement('TEST AGREEMENT X3','test-agreement-x3','active',3,now()-interval '1 day',now()+interval '30 days',v_staff);
 PERFORM pg_temp.assert_true(v_agreement.multiplier=3,'agreement create failed');
 failed:=false; BEGIN PERFORM public.create_moviback_agreement('Duplicate','test-agreement-x3','draft',2,now(),NULL,v_staff); EXCEPTION WHEN unique_violation THEN failed:=true; END; PERFORM pg_temp.assert_true(failed,'duplicate slug accepted');
 r:=public.generate_moviback_agreement_code_batch(v_agreement.id,'02400000-0000-4000-8000-000000000001','[{"hash":"sha256:synthetic-c3-one","suffix":"C3ONE1"},{"hash":"sha256:synthetic-c3-two","suffix":"C3TWO2"}]',now(),now()+interval '10 days',v_staff);
 PERFORM pg_temp.assert_true((r->>'created')::boolean AND (r->>'quantity')::integer=2,'batch create failed');
 r:=public.generate_moviback_agreement_code_batch(v_agreement.id,'02400000-0000-4000-8000-000000000001','[{"hash":"sha256:different-value-1","suffix":"DIFF01"},{"hash":"sha256:different-value-2","suffix":"DIFF02"}]',now(),now()+interval '10 days',v_staff);
 PERFORM pg_temp.assert_true(NOT (r->>'created')::boolean AND NOT (r->>'plaintext_recoverable')::boolean,'batch replay leaked recovery');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.moviback_agreement_codes WHERE agreement_id=v_agreement.id),'batch duplicated codes');
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='moviback_agreement_codes' AND column_name IN('code','plaintext_code')),'plaintext column exists');
 SELECT * INTO v_code FROM public.moviback_agreement_codes WHERE agreement_id=v_agreement.id LIMIT 1;
 SELECT * INTO v_code FROM public.revoke_moviback_agreement_code(v_code.id,'Synthetic unused code revoke',v_staff);
 PERFORM pg_temp.assert_true(v_code.status='revoked' AND v_code.revoked_at IS NOT NULL,'code revoke failed');
 SELECT * INTO v_code FROM public.revoke_moviback_agreement_code(v_code.id,'Replay',v_staff);
 SELECT sum(points_delta) INTO balance_before FROM public.loyalty_transactions WHERE membership_id=v_membership;
 SELECT * INTO v_entitlement FROM public.assign_moviback_agreement(v_membership,v_agreement.id,NULL,NULL,v_staff);
 PERFORM pg_temp.assert_true(v_entitlement.activation_source='admin' AND v_entitlement.code_id IS NULL AND v_entitlement.status='active','manual assignment malformed');
 PERFORM pg_temp.assert_true((SELECT sum(points_delta) FROM public.loyalty_transactions WHERE membership_id=v_membership)=balance_before,'assignment changed balance');
 r:=public.credit_moviback_points('TEST-C3-001',10,'CENTALLO','02400000-0000-4000-8000-000000000002','c3_sql','earn-x3',v_staff);
 PERFORM pg_temp.assert_true((r->>'credited_points')::integer=30 AND r->>'effective_incentive_source'='agreement','assigned agreement not used');
 SELECT * INTO v_agreement FROM public.update_moviback_agreement(v_agreement.id,v_agreement.name,v_agreement.slug,'active',1.5,v_agreement.valid_from,v_agreement.valid_until,v_staff);
 PERFORM pg_temp.assert_true((SELECT applied_multiplier=3 FROM public.loyalty_transactions WHERE id=(r->>'transaction_id')::uuid),'historical earn rewritten');
 r:=public.credit_moviback_points('TEST-C3-001',10,'CENTALLO','02400000-0000-4000-8000-000000000003','c3_sql','earn-x15',v_staff);
 PERFORM pg_temp.assert_true((r->>'credited_points')::integer=15,'prospective multiplier update failed');
 SELECT sum(points_delta) INTO balance_before FROM public.loyalty_transactions WHERE membership_id=v_membership;
 failed:=false; BEGIN PERFORM public.revoke_moviback_agreement_entitlement(v_entitlement.id,'',v_staff); EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%REASON_REQUIRED%' THEN failed:=true; ELSE RAISE; END IF; END; PERFORM pg_temp.assert_true(failed,'empty revoke reason accepted');
 SELECT * INTO v_entitlement FROM public.revoke_moviback_agreement_entitlement(v_entitlement.id,'Synthetic contract ended',v_staff);
 PERFORM pg_temp.assert_true(v_entitlement.status='revoked' AND v_entitlement.revoked_at IS NOT NULL,'entitlement revoke failed');
 PERFORM pg_temp.assert_true((SELECT sum(points_delta) FROM public.loyalty_transactions WHERE membership_id=v_membership)=balance_before,'revoke changed balance');
 r:=public.credit_moviback_points('TEST-C3-001',10,'CENTALLO','02400000-0000-4000-8000-000000000004','c3_sql','earn-after-revoke',v_staff);
 PERFORM pg_temp.assert_true((r->>'credited_points')::integer=10 AND r->>'effective_incentive_source'='none','revoked agreement still used');
 PERFORM pg_temp.assert_true((SELECT count(*)=6 FROM public.moviback_agreement_audit_events WHERE agreement_id=v_agreement.id AND event_type IN('agreement_created','agreement_updated','code_batch_generated','code_revoked','entitlement_assigned','entitlement_revoked')),'C3 audit events missing');
 PERFORM pg_temp.assert_true(NOT has_table_privilege('anon','public.moviback_agreement_code_batches','SELECT') AND NOT has_function_privilege('authenticated','public.assign_moviback_agreement(uuid,uuid,timestamptz,timestamptz,uuid)','EXECUTE'),'C3 grants exposed');
END $$;
SELECT 'moviback corporate conventions C3 SQL acceptance PASS' AS result;
ROLLBACK;
