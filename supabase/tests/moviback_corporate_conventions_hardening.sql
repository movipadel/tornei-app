\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', message; END IF; END $$;

DO $$
DECLARE
  staff_id uuid := 'f2800000-0000-4000-8000-000000000001';
  user_id uuid := 'a2800000-0000-4000-8000-000000000001';
  membership_id uuid := 'b2800000-0000-4000-8000-000000000001';
  agreement_id uuid := 'c2800000-0000-4000-8000-000000000001';
  entitlement_id uuid := 'd2800000-0000-4000-8000-000000000001';
  failed boolean;
BEGIN
  INSERT INTO public.staff_users(id,full_name,email,role,is_active)
  VALUES(staff_id,'Synthetic C8 Operator','c8-operator@example.invalid','admin',true);
  INSERT INTO public.users(id,full_name,phone,email,gender,identity_status)
  VALUES(user_id,'Synthetic C8 Member','3400000281','c8-member@example.invalid','M','active');
  INSERT INTO public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type)
  VALUES(membership_id,user_id,'approved','TEST-C8-001','RSSMRA90A01H501U',now(),staff_id,'ASC');

  failed:=false;
  BEGIN
    INSERT INTO public.moviback_agreements(name,slug,status,multiplier,valid_from) VALUES('Invalid','c8-invalid','active',0,now());
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'non-positive multiplier accepted');

  failed:=false;
  BEGIN
    INSERT INTO public.moviback_agreements(name,slug,status,multiplier,valid_from,valid_until) VALUES('Invalid dates','c8-invalid-dates','active',2,now(),now());
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'invalid agreement interval accepted');

  INSERT INTO public.moviback_agreements(id,name,slug,status,multiplier,valid_from,valid_until,created_by)
  VALUES(agreement_id,'Synthetic C8 X3','synthetic-c8-x3','active',3,now()-interval '1 day',now()+interval '1 day',staff_id);

  failed:=false;
  BEGIN
    INSERT INTO public.moviback_agreement_codes(agreement_id,code_hash,code_suffix,status,valid_from,claimed_at,claimed_by_membership_id)
    VALUES(agreement_id,'sha256:c8-invalid-available','C8BAD1','available',now(),now(),membership_id);
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'available code with claimant accepted');

  failed:=false;
  BEGIN
    INSERT INTO public.moviback_agreement_codes(agreement_id,code_hash,code_suffix,status,valid_from)
    VALUES(agreement_id,'sha256:c8-invalid-used','C8BAD2','used',now());
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'used code without membership accepted');

  failed:=false;
  BEGIN
    INSERT INTO public.moviback_agreement_entitlements(membership_id,agreement_id,status,activation_source,activated_at,effective_from)
    VALUES(membership_id,agreement_id,'active','admin',now(),NULL);
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'active entitlement without effective_from accepted');

  failed:=false;
  BEGIN
    INSERT INTO public.moviback_agreement_entitlements(membership_id,agreement_id,status,activation_source,activated_at,effective_from)
    VALUES(membership_id,agreement_id,'pending','admin',now(),NULL);
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'pending entitlement with activated_at accepted');

  INSERT INTO public.moviback_agreement_entitlements(id,membership_id,agreement_id,status,activation_source,activated_at,effective_from)
  VALUES(entitlement_id,membership_id,agreement_id,'active','admin',now(),now());
  failed:=false;
  BEGIN
    INSERT INTO public.moviback_agreement_entitlements(membership_id,agreement_id,status,activation_source,activated_at,effective_from)
    VALUES(membership_id,agreement_id,'active','admin',now(),now());
  EXCEPTION WHEN unique_violation THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'duplicate current entitlement accepted');

  failed:=false;
  BEGIN
    INSERT INTO public.loyalty_transactions(membership_id,type,source,points_delta,base_points,applied_multiplier,credited_points,incentive_source,earning_rule_version,source_event_type,source_event_id,idempotency_key)
    VALUES(membership_id,'earn','club_payment',99,10,1,10,'none','moviback-credit-v1','c8','invalid-delta','02800000-0000-4000-8000-000000000001');
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'structured earn with mismatched points accepted');

  INSERT INTO public.moviback_agreement_audit_events(agreement_id,entitlement_id,event_type,actor_staff_id)
  VALUES(agreement_id,entitlement_id,'c8.synthetic',staff_id);
  failed:=false;
  BEGIN UPDATE public.moviback_agreement_audit_events SET reason='tamper' WHERE event_type='c8.synthetic';
  EXCEPTION WHEN raise_exception THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'agreement audit UPDATE accepted');
  failed:=false;
  BEGIN DELETE FROM public.moviback_agreement_audit_events WHERE event_type='c8.synthetic';
  EXCEPTION WHEN raise_exception THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'agreement audit DELETE accepted');

  PERFORM pg_temp.assert_true(NOT has_table_privilege('anon','public.moviback_agreements','SELECT'),'anon can read agreements directly');
  PERFORM pg_temp.assert_true(NOT has_table_privilege('authenticated','public.moviback_agreement_codes','SELECT'),'authenticated can enumerate code hashes');
  PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated','public.claim_moviback_agreement_code(uuid,text)','EXECUTE'),'authenticated can call claim RPC directly');
  PERFORM pg_temp.assert_true(has_function_privilege('service_role','public.claim_moviback_agreement_code(uuid,text)','EXECUTE'),'service role cannot call claim RPC');
END $$;

ROLLBACK;
SELECT 'moviback corporate conventions C8 hardening SQL acceptance PASS' AS result;
