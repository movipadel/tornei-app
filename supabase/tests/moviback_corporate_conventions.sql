\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',message; END IF; END $$;

DO $$
DECLARE
  v_staff uuid := 'f2300000-0000-4000-8000-000000000001';
  v_user uuid := 'a2300000-0000-4000-8000-000000000001';
  v_canonical_user uuid := 'a2300000-0000-4000-8000-000000000002';
  v_membership uuid := 'b2300000-0000-4000-8000-000000000001';
  v_agreement uuid := 'c2300000-0000-4000-8000-000000000001';
  v_entitlement uuid := 'd2300000-0000-4000-8000-000000000001';
  v_promo uuid := 'e2300000-0000-4000-8000-000000000001';
  v_global uuid := 'e2300000-0000-4000-8000-000000000002';
  r jsonb; first_tx uuid; before_balance bigint; after_balance bigint; failed boolean;
BEGIN
  PERFORM pg_temp.assert_true((SELECT count(*)=4 FROM information_schema.tables WHERE table_schema='public' AND table_name IN
    ('moviback_agreements','moviback_agreement_codes','moviback_agreement_entitlements','moviback_agreement_audit_events')),'C1 tables missing');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='moviback_agreement_codes' AND column_name IN ('code','plaintext_code')),'plaintext code column exists');
  PERFORM pg_temp.assert_true((SELECT count(*)=10 FROM information_schema.columns WHERE table_schema='public' AND table_name='loyalty_transactions' AND column_name IN
    ('base_points','applied_multiplier','credited_points','agreement_id','entitlement_id','incentive_source','earning_rule_version','source_event_type','source_event_id','idempotency_key')),'structured ledger columns missing');

  INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES(v_staff,'Synthetic Operator','moviback-c1c2-operator@example.invalid','admin',true);
  INSERT INTO public.users(id,full_name,phone,email,gender) VALUES(v_user,'Synthetic Member','3400000001','moviback-c1c2-member@example.invalid','M');
  INSERT INTO public.users(id,full_name,phone,email,gender) VALUES(v_canonical_user,'Synthetic Canonical','3400000002','moviback-c1c2-canonical@example.invalid','M');
  INSERT INTO public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type)
    VALUES(v_membership,v_user,'approved','TEST-C1C2-001','RSSMRA90A01H501U',now(),v_staff,'ASC');
  INSERT INTO public.medical_certificates(user_id,file_path,status,expiry_date,reviewed_at,reviewed_by)
    VALUES(v_user,'synthetic/c1c2.pdf','approved',current_date+30,now(),v_staff);
  INSERT INTO public.loyalty_transactions(membership_id,type,source,points_delta,notes)
    VALUES(v_membership,'adjustment','manual_adjustment',7,'Synthetic historical row');
  SELECT sum(points_delta) INTO before_balance FROM public.loyalty_transactions WHERE membership_id=v_membership;

  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000001','sql_acceptance','event-none',v_staff);
  PERFORM pg_temp.assert_true((r->>'base_points')::integer=10 AND (r->>'credited_points')::integer=10 AND r->>'effective_incentive_source'='none','standard x1 credit');
  first_tx:=(r->>'transaction_id')::uuid;
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000001','sql_acceptance','event-none',v_staff);
  PERFORM pg_temp.assert_true((r->>'transaction_id')::uuid=first_tx AND (r->>'replayed')::boolean,'sequential replay did not return original');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.loyalty_transactions WHERE idempotency_key='02300000-0000-4000-8000-000000000001'),'sequential replay duplicated ledger');

  UPDATE public.loyalty_memberships SET membership_type='FITP' WHERE id=v_membership;
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000002','sql_acceptance','event-fitp',v_staff);
  PERFORM pg_temp.assert_true((r->>'base_points')::integer=12 AND (r->>'credited_points')::integer=12,'FITP factor changed');

  INSERT INTO public.moviback_agreements(id,name,slug,status,multiplier,valid_from,created_by)
    VALUES(v_agreement,'TEST AGREEMENT X3','test-agreement-x3','active',3,transaction_timestamp()-interval '1 day',v_staff);
  INSERT INTO public.moviback_agreement_entitlements(id,membership_id,agreement_id,status,activation_source,activated_at,effective_from)
    VALUES(v_entitlement,v_membership,v_agreement,'active','admin',transaction_timestamp(),transaction_timestamp());
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000003','sql_acceptance','event-agreement',v_staff);
  PERFORM pg_temp.assert_true((r->>'credited_points')::integer=36 AND r->>'effective_incentive_source'='agreement' AND (r->>'agreement_id')::uuid=v_agreement,'agreement x3 failed');

  INSERT INTO public.loyalty_user_promos(id,membership_id,multiplier,starts_at,ends_at,is_active,notes)
    VALUES(v_promo,v_membership,2,transaction_timestamp()-interval '1 day',transaction_timestamp()+interval '1 day',true,'Synthetic individual x2');
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000004','sql_acceptance','event-max-agreement',v_staff);
  PERFORM pg_temp.assert_true((r->>'credited_points')::integer=36 AND r->>'effective_incentive_source'='agreement','max promo x2 agreement x3 failed');
  UPDATE public.loyalty_user_promos SET multiplier=4 WHERE id=v_promo;
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000005','sql_acceptance','event-max-promo',v_staff);
  PERFORM pg_temp.assert_true((r->>'credited_points')::integer=48 AND r->>'effective_incentive_source'='promo' AND r->>'agreement_id' IS NULL,'max promo x4 agreement x3 failed');
  UPDATE public.loyalty_user_promos SET multiplier=3 WHERE id=v_promo;
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000006','sql_acceptance','event-tie',v_staff);
  PERFORM pg_temp.assert_true(r->>'effective_incentive_source'='promo','deterministic promo tie rule failed');

  UPDATE public.loyalty_user_promos SET is_active=false WHERE id=v_promo;
  UPDATE public.moviback_agreements SET multiplier=1.5 WHERE id=v_agreement;
  r:=public.credit_moviback_points('TEST-C1C2-001',9,'CENTALLO','02300000-0000-4000-8000-000000000007','sql_acceptance','event-decimal',v_staff);
  PERFORM pg_temp.assert_true((r->>'base_points')::integer=10 AND (r->>'credited_points')::integer=15,'numeric x1.5 floor failed');

  UPDATE public.moviback_agreement_entitlements SET status='expired',effective_until=transaction_timestamp()+interval '1 second' WHERE id=v_entitlement;
  INSERT INTO public.loyalty_global_promos(id,title,multiplier,starts_at,ends_at,is_active,schedule_type,target_type)
    VALUES(v_global,'Synthetic Global X2',2,transaction_timestamp()-interval '1 day',transaction_timestamp()+interval '1 day',true,'always','all');
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000008','sql_acceptance','event-global',v_staff);
  PERFORM pg_temp.assert_true((r->>'credited_points')::integer=24 AND r->>'promo_type'='global','global promo regression');
  UPDATE public.loyalty_user_promos SET is_active=true,multiplier=2 WHERE id=v_promo;
  UPDATE public.loyalty_global_promos SET multiplier=4 WHERE id=v_global;
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000009','sql_acceptance','event-individual-priority',v_staff);
  PERFORM pg_temp.assert_true((r->>'credited_points')::integer=24 AND r->>'promo_type'='individual','individual promo priority changed');

  -- Active entitlement uniqueness, with expired/revoked history retained.
  UPDATE public.loyalty_user_promos SET is_active=false WHERE id=v_promo;
  UPDATE public.loyalty_global_promos SET is_active=false WHERE id=v_global;
  INSERT INTO public.moviback_agreement_entitlements(membership_id,agreement_id,status,activation_source,activated_at,effective_from)
    VALUES(v_membership,v_agreement,'active','admin',transaction_timestamp(),transaction_timestamp());
  failed:=false;
  BEGIN
    INSERT INTO public.moviback_agreement_entitlements(membership_id,agreement_id,status,activation_source,activated_at,effective_from)
      VALUES(v_membership,v_agreement,'active','admin',transaction_timestamp(),transaction_timestamp());
  EXCEPTION WHEN unique_violation THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'second active entitlement accepted');
  UPDATE public.moviback_agreement_entitlements SET status='revoked',revoked_at=transaction_timestamp(),revocation_reason='Synthetic test' WHERE membership_id=v_membership AND status='active';
  INSERT INTO public.moviback_agreement_entitlements(membership_id,agreement_id,status,activation_source,activated_at,effective_from)
    VALUES(v_membership,v_agreement,'active','admin',transaction_timestamp(),transaction_timestamp());

  -- [start,end) and revoked boundary semantics use the authoritative transaction timestamp.
  UPDATE public.moviback_agreement_entitlements SET effective_from=transaction_timestamp()+interval '1 second' WHERE membership_id=v_membership AND status='active';
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000010','sql_acceptance','event-before-start',v_staff);
  PERFORM pg_temp.assert_true(r->>'effective_incentive_source'='none','future entitlement applied');
  UPDATE public.moviback_agreement_entitlements SET effective_from=transaction_timestamp(),effective_until=transaction_timestamp()+interval '1 second' WHERE membership_id=v_membership AND status='active';
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000011','sql_acceptance','event-at-start',v_staff);
  PERFORM pg_temp.assert_true(r->>'effective_incentive_source'='agreement','effective_from boundary inactive');
  UPDATE public.moviback_agreement_entitlements SET effective_from=transaction_timestamp()-interval '1 day',effective_until=transaction_timestamp() WHERE membership_id=v_membership AND status='active';
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000012','sql_acceptance','event-at-end',v_staff);
  PERFORM pg_temp.assert_true(r->>'effective_incentive_source'='none','effective_until boundary active');
  UPDATE public.moviback_agreement_entitlements SET effective_until=NULL,revoked_at=transaction_timestamp() WHERE membership_id=v_membership AND status='active';
  r:=public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000013','sql_acceptance','event-at-revoke',v_staff);
  PERFORM pg_temp.assert_true(r->>'effective_incentive_source'='none','revoked_at boundary active');

  -- Code foundation: hash-only storage, FK lifecycle and structural uniqueness.
  INSERT INTO public.moviback_agreement_codes(agreement_id,code_hash,code_suffix,status,valid_from,claimed_at,claimed_by_membership_id,created_by)
    VALUES(v_agreement,'sha256:synthetic-one','ONE1','claimed',transaction_timestamp(),transaction_timestamp(),v_membership,v_staff);
  failed:=false;
  BEGIN INSERT INTO public.moviback_agreement_codes(agreement_id,code_hash,code_suffix,status,valid_from)
    VALUES(v_agreement,'sha256:synthetic-one','TWO2','available',transaction_timestamp());
  EXCEPTION WHEN unique_violation THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'duplicate code hash accepted');

  -- Legacy and non-commercial rows remain nullable and are never multiplied.
  INSERT INTO public.loyalty_transactions(membership_id,type,source,points_delta,notes) VALUES
    (v_membership,'adjustment','manual_adjustment',5,'Synthetic positive adjustment'),
    (v_membership,'adjustment','manual_adjustment',-2,'Synthetic negative adjustment'),
    (v_membership,'refund','reward_redemption',3,'Synthetic refund'),
    (v_membership,'redeem','reward_redemption',-1,'Synthetic reward debit'),
    (v_membership,'redeem','membership_fee',-1,'Synthetic membership fee');
  PERFORM pg_temp.assert_true((SELECT count(*)=6 FROM public.loyalty_transactions WHERE membership_id=v_membership AND earning_rule_version IS NULL AND applied_multiplier IS NULL),'legacy/exclusion fields populated');
  PERFORM pg_temp.assert_true((SELECT points_delta=7 AND base_points IS NULL FROM public.loyalty_transactions WHERE notes='Synthetic historical row'),'historical row mutated');
  SELECT sum(points_delta) INTO after_balance FROM public.loyalty_transactions WHERE membership_id=v_membership;
  PERFORM pg_temp.assert_true(after_balance=(SELECT (r->>'resulting_balance')::bigint+4),'ledger balance no longer derives from SUM');

  -- Append-only audit and least-privilege grants.
  INSERT INTO public.moviback_agreement_audit_events(agreement_id,event_type,actor_staff_id,after_state)
    VALUES(v_agreement,'synthetic_created',v_staff,'{}');
  failed:=false;
  BEGIN UPDATE public.moviback_agreement_audit_events SET reason='mutated';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%APPEND_ONLY%' THEN failed:=true; ELSE RAISE; END IF; END;
  PERFORM pg_temp.assert_true(failed,'audit event mutable');
  PERFORM pg_temp.assert_true(NOT has_function_privilege('anon','public.credit_moviback_points(text,numeric,text,uuid,text,text,uuid)','EXECUTE'),'anon can execute credit RPC');
  PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated','public.credit_moviback_points(text,numeric,text,uuid,text,text,uuid)','EXECUTE'),'authenticated can execute credit RPC');
  PERFORM pg_temp.assert_true(has_function_privilege('service_role','public.credit_moviback_points(text,numeric,text,uuid,text,text,uuid)','EXECUTE'),'service role cannot execute credit RPC');

  -- Eligibility failures preserve current membership/account/certificate rules.
  UPDATE public.medical_certificates SET expiry_date=current_date-61 WHERE user_id=v_user;
  BEGIN
    PERFORM public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000014','sql_acceptance','event-standby',v_staff);
    RAISE EXCEPTION 'EXPECTED_STANDBY_FAILURE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='EXPECTED_STANDBY_FAILURE_NOT_RAISED' OR SQLERRM NOT LIKE '%CERTIFICATE_STANDBY%' THEN RAISE; END IF; END;
  UPDATE public.medical_certificates SET expiry_date=current_date-60 WHERE user_id=v_user;
  PERFORM public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000015','sql_acceptance','event-grace',v_staff);
  UPDATE public.loyalty_memberships SET status='pending_review' WHERE id=v_membership;
  BEGIN
    PERFORM public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000016','sql_acceptance','event-pending',v_staff);
    RAISE EXCEPTION 'EXPECTED_PENDING_FAILURE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='EXPECTED_PENDING_FAILURE_NOT_RAISED' OR SQLERRM NOT LIKE '%MEMBERSHIP_NOT_APPROVED%' THEN RAISE; END IF; END;
  UPDATE public.loyalty_memberships SET status='approved' WHERE id=v_membership;
  UPDATE public.users SET identity_status='merged',merged_into_user_id=v_canonical_user,merged_at=transaction_timestamp() WHERE id=v_user;
  BEGIN
    PERFORM public.credit_moviback_points('TEST-C1C2-001',10,'CENTALLO','02300000-0000-4000-8000-000000000017','sql_acceptance','event-inactive',v_staff);
    RAISE EXCEPTION 'EXPECTED_ACCOUNT_FAILURE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='EXPECTED_ACCOUNT_FAILURE_NOT_RAISED' OR SQLERRM NOT LIKE '%ACCOUNT_INACTIVE%' THEN RAISE; END IF; END;
END $$;

SELECT 'moviback corporate conventions SQL acceptance PASS' AS result;
ROLLBACK;
