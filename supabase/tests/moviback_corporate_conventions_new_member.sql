\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',message; END IF; END $$;
DO $$
DECLARE
  staff uuid := 'f2600000-0000-4000-8000-000000000001';
  u1 uuid := 'a2600000-0000-4000-8000-000000000001';
  u2 uuid := 'a2600000-0000-4000-8000-000000000002';
  u3 uuid := 'a2600000-0000-4000-8000-000000000003';
  u4 uuid := 'a2600000-0000-4000-8000-000000000004';
  u5 uuid := 'a2600000-0000-4000-8000-000000000005';
  u6 uuid := 'a2600000-0000-4000-8000-000000000006';
  u7 uuid := 'a2600000-0000-4000-8000-000000000007';
  u8 uuid := 'a2600000-0000-4000-8000-000000000008';
  agreement_id uuid := 'c2600000-0000-4000-8000-000000000001';
  r jsonb; membership uuid; entitlement uuid; code_id uuid; balance_before bigint;
BEGIN
  INSERT INTO public.staff_users(id,full_name,email,role,is_active)
  VALUES(staff,'Synthetic C5 Operator','c5-operator@example.invalid','admin',true);
  INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
    (u1,'Synthetic C5 Plain','3400000261','c5-plain@example.invalid','M'),
    (u2,'Synthetic C5 Valid','3400000262','c5-valid@example.invalid','F'),
    (u3,'Synthetic C5 Expired','3400000263','c5-expired@example.invalid','M'),
    (u4,'Synthetic C5 Revoked','3400000264','c5-revoked@example.invalid','F'),
    (u5,'Synthetic C5 Suspended','3400000265','c5-suspended@example.invalid','M'),
    (u6,'Synthetic C5 Resubmit','3400000266','c5-resubmit@example.invalid','F'),
    (u7,'Synthetic C5 Revoked Agreement','3400000267','c5-revoked-agreement@example.invalid','M'),
    (u8,'Synthetic C5 Expired Agreement','3400000268','c5-expired-agreement@example.invalid','F');
  UPDATE public.users SET identity_status='active' WHERE id IN (u1,u2,u3,u4,u5,u6,u7,u8);
  INSERT INTO public.moviback_agreements(id,name,slug,status,multiplier,valid_from,valid_until,created_by)
  VALUES(agreement_id,'TEST C5 X3','test-c5-x3','active',3,now()-interval '1 day',now()+interval '30 days',staff);
  INSERT INTO public.moviback_agreement_codes(agreement_id,code_hash,code_suffix,status,valid_from,valid_until,created_by) VALUES
    (agreement_id,'sha256:c5-valid','VALID1','available',now()-interval '1 day',now()+interval '10 days',staff),
    (agreement_id,'sha256:c5-expire','EXPIR1','available',now()-interval '1 day',now()+interval '10 days',staff),
    (agreement_id,'sha256:c5-revoke','REVOK1','available',now()-interval '1 day',now()+interval '10 days',staff),
    (agreement_id,'sha256:c5-suspend','SUSPN1','available',now()-interval '1 day',now()+interval '10 days',staff),
    (agreement_id,'sha256:c5-resubmit','RESUB1','available',now()-interval '1 day',now()+interval '10 days',staff),
    (agreement_id,'sha256:c5-agreement-revoked','AREVK1','available',now()-interval '1 day',now()+interval '10 days',staff),
    (agreement_id,'sha256:c5-agreement-expired','AEXPR1','available',now()-interval '1 day',now()+interval '10 days',staff),
    (agreement_id,'sha256:c5-replacement','REPLC1','available',now()-interval '1 day',now()+interval '10 days',staff);

  r:=public.submit_moviback_membership_request_c5(u1,'02600000-0000-4000-8000-000000000001',repeat('1',64),'TEST-C5-PLAIN','RSSMRA90A01H501U','ASC',0,true,false,null,null,'synthetic/c5-plain.pdf',current_date+30,null);
  PERFORM pg_temp.assert_true((r->>'ok')::boolean,'code-free enrollment failed');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.moviback_agreement_entitlements WHERE membership_id=(r->>'membership_id')::uuid),'code-free enrollment created entitlement');

  r:=public.submit_moviback_membership_request_c5(u2,'02600000-0000-4000-8000-000000000002',repeat('2',64),'TEST-C5-VALID','VRDLGI90A01H501W','ASC',0,true,false,null,null,'synthetic/c5-valid.pdf',current_date+30,'sha256:c5-valid');
  membership:=(r->>'membership_id')::uuid;
  PERFORM pg_temp.assert_true((r->>'ok')::boolean AND r#>>'{agreement,status}'='pending','valid code was not reserved');
  SELECT id INTO code_id FROM public.moviback_agreement_codes WHERE code_hash='sha256:c5-valid';
  PERFORM pg_temp.assert_true((SELECT status='reserved' AND claimed_by_membership_id=membership AND claimed_at IS NOT NULL FROM public.moviback_agreement_codes WHERE id=code_id),'reservation ownership missing');
  PERFORM pg_temp.assert_true((SELECT status='pending' AND effective_from IS NULL AND activated_at IS NULL FROM public.moviback_agreement_entitlements WHERE membership_id=membership),'pending entitlement is effective');
  SELECT coalesce(sum(points_delta),0) INTO balance_before FROM public.loyalty_transactions WHERE membership_id=membership;
  r:=public.submit_moviback_membership_request_c5(u2,'02600000-0000-4000-8000-000000000002',repeat('2',64),'IGNORED','VRDLGI90A01H501W','ASC',0,true,false,null,null,'synthetic/c5-valid.pdf',current_date+30,'sha256:c5-valid');
  PERFORM pg_temp.assert_true((r->>'ok')::boolean AND (r->>'replayed')::boolean,'lost-response replay failed');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.moviback_agreement_entitlements WHERE membership_id=membership),'replay duplicated entitlement');
  r:=public.review_moviback_membership_c5(membership,'approve',null,null,staff);
  PERFORM pg_temp.assert_true(r->>'convention_status'='active','approval did not activate convention');
  PERFORM pg_temp.assert_true((SELECT status='approved' FROM public.loyalty_memberships WHERE id=membership),'membership not approved');
  PERFORM pg_temp.assert_true((SELECT status='used' FROM public.moviback_agreement_codes WHERE id=code_id),'valid code not finalized');
  PERFORM pg_temp.assert_true((SELECT status='active' AND effective_from=activated_at FROM public.moviback_agreement_entitlements WHERE membership_id=membership),'activation timestamps differ');
  PERFORM pg_temp.assert_true((SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions WHERE membership_id=membership)=balance_before,'approval changed balance');
  r:=public.credit_moviback_points('TEST-C5-VALID',10,'CENTALLO','02600000-0000-4000-8000-000000000099','c5_sql','post-approval',staff);
  PERFORM pg_temp.assert_true((r->>'credited_points')::integer=30,'future earn did not use convention');

  r:=public.submit_moviback_membership_request_c5(u3,'02600000-0000-4000-8000-000000000003',repeat('3',64),'TEST-C5-EXP','RSSPLA90A01H501A','ASC',0,true,false,null,null,'synthetic/c5-exp.pdf',current_date+30,'sha256:c5-expire');
  membership:=(r->>'membership_id')::uuid;
  UPDATE public.moviback_agreement_codes SET valid_until=now()-interval '1 second' WHERE code_hash='sha256:c5-expire';
  r:=public.review_moviback_membership_c5(membership,'approve',null,null,staff);
  PERFORM pg_temp.assert_true(r->>'convention_status'='not_activated' AND r->>'convention_reason'='code_expired','expired code outcome wrong');
  PERFORM pg_temp.assert_true((SELECT status='approved' FROM public.loyalty_memberships WHERE id=membership),'expired code blocked membership');
  PERFORM pg_temp.assert_true((SELECT status='expired' FROM public.moviback_agreement_codes WHERE code_hash='sha256:c5-expire'),'expired code final state wrong');

  r:=public.submit_moviback_membership_request_c5(u4,'02600000-0000-4000-8000-000000000004',repeat('4',64),'TEST-C5-REV','RSSPLA90A01H501B','ASC',0,true,false,null,null,'synthetic/c5-rev.pdf',current_date+30,'sha256:c5-revoke');
  membership:=(r->>'membership_id')::uuid;
  SELECT id INTO code_id FROM public.moviback_agreement_codes WHERE code_hash='sha256:c5-revoke';
  PERFORM public.revoke_moviback_agreement_code(code_id,'Synthetic C5 revoke',staff);
  r:=public.review_moviback_membership_c5(membership,'approve',null,null,staff);
  PERFORM pg_temp.assert_true(r->>'convention_reason'='code_revoked','revoked code outcome wrong');
  PERFORM pg_temp.assert_true((SELECT status='approved' FROM public.loyalty_memberships WHERE id=membership),'revoked code blocked membership');
  PERFORM pg_temp.assert_true((SELECT status='revoked' FROM public.moviback_agreement_codes WHERE id=code_id),'revoked code was rewritten');

  r:=public.submit_moviback_membership_request_c5(u5,'02600000-0000-4000-8000-000000000005',repeat('5',64),'TEST-C5-SUS','RSSPLA90A01H501C','ASC',0,true,false,null,null,'synthetic/c5-sus.pdf',current_date+30,'sha256:c5-suspend');
  membership:=(r->>'membership_id')::uuid;
  UPDATE public.moviback_agreements SET status='suspended' WHERE id=agreement_id;
  r:=public.review_moviback_membership_c5(membership,'approve',null,null,staff);
  PERFORM pg_temp.assert_true(r->>'convention_reason'='agreement_suspended','suspended agreement outcome wrong');
  PERFORM pg_temp.assert_true((SELECT status='approved' FROM public.loyalty_memberships WHERE id=membership),'suspended agreement blocked membership');
  PERFORM pg_temp.assert_true((SELECT status='closed' FROM public.moviback_agreement_codes WHERE code_hash='sha256:c5-suspend'),'suspended agreement code not closed');
  UPDATE public.moviback_agreements SET status='active' WHERE id=agreement_id;

  r:=public.submit_moviback_membership_request_c5(u7,'02600000-0000-4000-8000-000000000009',repeat('9',64),'TEST-C5-AREV','RSSPLA90A01H501E','ASC',0,true,false,null,null,'synthetic/c5-arev.pdf',current_date+30,'sha256:c5-agreement-revoked');
  membership:=(r->>'membership_id')::uuid;
  UPDATE public.moviback_agreements SET status='revoked' WHERE id=agreement_id;
  r:=public.review_moviback_membership_c5(membership,'approve',null,null,staff);
  PERFORM pg_temp.assert_true(r->>'convention_reason'='agreement_revoked','revoked agreement outcome wrong');
  PERFORM pg_temp.assert_true((SELECT status='approved' FROM public.loyalty_memberships WHERE id=membership),'revoked agreement blocked membership');
  PERFORM pg_temp.assert_true((SELECT status='closed' FROM public.moviback_agreement_codes WHERE code_hash='sha256:c5-agreement-revoked'),'revoked agreement code not closed');
  UPDATE public.moviback_agreements SET status='active' WHERE id=agreement_id;

  r:=public.submit_moviback_membership_request_c5(u8,'02600000-0000-4000-8000-000000000010',repeat('a',64),'TEST-C5-AEXP','RSSPLA90A01H501F','ASC',0,true,false,null,null,'synthetic/c5-aexp.pdf',current_date+30,'sha256:c5-agreement-expired');
  membership:=(r->>'membership_id')::uuid;
  UPDATE public.moviback_agreements SET valid_until=now()-interval '1 second' WHERE id=agreement_id;
  r:=public.review_moviback_membership_c5(membership,'approve',null,null,staff);
  PERFORM pg_temp.assert_true(r->>'convention_reason'='agreement_expired','expired agreement outcome wrong');
  PERFORM pg_temp.assert_true((SELECT status='approved' FROM public.loyalty_memberships WHERE id=membership),'expired agreement blocked membership');
  PERFORM pg_temp.assert_true((SELECT status='closed' FROM public.moviback_agreement_codes WHERE code_hash='sha256:c5-agreement-expired'),'expired agreement code not closed');
  UPDATE public.moviback_agreements SET valid_until=now()+interval '30 days' WHERE id=agreement_id;

  r:=public.submit_moviback_membership_request_c5(u6,'02600000-0000-4000-8000-000000000006',repeat('6',64),'TEST-C5-RES','RSSPLA90A01H501D','ASC',0,true,false,null,null,'synthetic/c5-res-1.pdf',current_date+30,'sha256:c5-resubmit');
  membership:=(r->>'membership_id')::uuid;
  r:=public.review_moviback_membership_c5(membership,'reject','Synthetic rejection',null,staff);
  PERFORM pg_temp.assert_true((SELECT status='reserved' FROM public.moviback_agreement_codes WHERE code_hash='sha256:c5-resubmit'),'rejection released code');
  PERFORM pg_temp.assert_true((SELECT status='pending' FROM public.moviback_agreement_entitlements WHERE membership_id=membership),'rejection closed entitlement');
  r:=public.submit_moviback_membership_request_c5(u6,'02600000-0000-4000-8000-000000000007',repeat('7',64),'IGNORED-RESUBMIT','RSSPLA90A01H501D','ASC',0,true,false,null,null,'synthetic/c5-res-2.pdf',current_date+30,'sha256:c5-resubmit');
  PERFORM pg_temp.assert_true((r->>'ok')::boolean AND (SELECT count(*)=1 FROM public.moviback_agreement_entitlements WHERE membership_id=membership),'same-code resubmit unsafe');
  SELECT id INTO code_id FROM public.moviback_agreement_codes WHERE code_hash='sha256:c5-resubmit';
  PERFORM public.revoke_moviback_agreement_code(code_id,'Synthetic release by revoke',staff);
  UPDATE public.loyalty_memberships SET status='rejected' WHERE id=membership;
  r:=public.submit_moviback_membership_request_c5(u6,'02600000-0000-4000-8000-000000000011',repeat('b',64),'IGNORED-REPLACEMENT','RSSPLA90A01H501D','ASC',0,true,false,null,null,'synthetic/c5-res-3.pdf',current_date+30,'sha256:c5-replacement');
  PERFORM pg_temp.assert_true((r->>'ok')::boolean,'replacement after explicit revoke failed');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.moviback_agreement_entitlements WHERE membership_id=membership AND status='pending'),'replacement did not preserve single current entitlement');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.moviback_agreement_entitlements WHERE membership_id=membership AND status='not_activated'),'previous entitlement was not closed');
  PERFORM pg_temp.assert_true((SELECT status='reserved' AND claimed_by_membership_id=membership FROM public.moviback_agreement_codes WHERE code_hash='sha256:c5-replacement'),'replacement code not reserved');

  r:=public.submit_moviback_membership_request_c5('a2600000-0000-4000-8000-000000000001','02600000-0000-4000-8000-000000000008',repeat('8',64),'IGNORED','RSSMRA90A01H501U','ASC',0,true,false,null,null,'synthetic/c5-invalid.pdf',current_date+30,'sha256:not-found');
  PERFORM pg_temp.assert_true(r->>'error_code'='MEMBERSHIP_EXISTS','existing membership guard changed');
  PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated','public.submit_moviback_membership_request_c5(uuid,uuid,text,text,text,text,integer,boolean,boolean,text,text,text,date,text)','EXECUTE'),'enrollment RPC exposed');
  PERFORM pg_temp.assert_true((SELECT count(*)>=7 FROM public.moviback_agreement_audit_events e WHERE e.agreement_id='c2600000-0000-4000-8000-000000000001'),'C5 audit events missing');
END $$;
SELECT 'moviback corporate conventions C5 SQL acceptance PASS' AS result;
ROLLBACK;
