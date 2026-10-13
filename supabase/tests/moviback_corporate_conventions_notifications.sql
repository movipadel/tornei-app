\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_true(value boolean,message text)
returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'ASSERTION FAILED: %',message; end if;
end $$;

do $$
declare
  staff uuid := 'f2800000-0000-4000-8000-000000000001';
  c4_user uuid := 'a2800000-0000-4000-8000-000000000001';
  admin_user uuid := 'a2800000-0000-4000-8000-000000000002';
  c5_user uuid := 'a2800000-0000-4000-8000-000000000003';
  not_user uuid := 'a2800000-0000-4000-8000-000000000004';
  canonical_user uuid := 'a2800000-0000-4000-8000-000000000005';
  merged_user uuid := 'a2800000-0000-4000-8000-000000000006';
  c4_membership uuid := 'b2800000-0000-4000-8000-000000000001';
  admin_membership uuid := 'b2800000-0000-4000-8000-000000000002';
  merged_membership uuid := 'b2800000-0000-4000-8000-000000000003';
  agreement uuid := 'c2800000-0000-4000-8000-000000000001';
  entitlement uuid;
  membership uuid;
  result jsonb;
begin
  insert into public.staff_users(id,full_name,email,role,is_active)
  values(staff,'Synthetic C7 Operator','c7-operator@example.invalid','admin',true);

  insert into public.users(id,full_name,phone,email,gender) values
    (c4_user,'Synthetic C7 C4','3400000281','c7-c4@example.invalid','M'),
    (admin_user,'Synthetic C7 Admin','3400000282','c7-admin@example.invalid','F'),
    (c5_user,'Synthetic C7 C5','3400000283','c7-c5@example.invalid','M'),
    (not_user,'Synthetic C7 Not Activated','3400000284','c7-not@example.invalid','F'),
    (canonical_user,'Synthetic C7 Canonical','3400000285','c7-canonical@example.invalid','M');
  insert into public.users(id,full_name,phone,email,gender,identity_status,merged_into_user_id,merged_at,auth_migration_state)
  values(merged_user,'Synthetic C7 Historical','3400000286','c7-historical@example.invalid','F','merged',canonical_user,now(),'merged');
  insert into public.user_identity_aliases(source_user_id,canonical_user_id,status,reason,merged_at)
  values(merged_user,canonical_user,'active','Synthetic C7 merge recipient test',now());

  insert into public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type) values
    (c4_membership,c4_user,'approved','TEST-C7-C4','RSSMRA90A01H501U',now(),staff,'ASC'),
    (admin_membership,admin_user,'approved','TEST-C7-ADMIN','VRDLGI90A01H501W',now(),staff,'FITP'),
    (merged_membership,merged_user,'approved','TEST-C7-MERGED','RSSPLA90A01H501A',now(),staff,'ASC');

  insert into public.moviback_agreements(id,name,slug,status,multiplier,valid_from,valid_until,created_by)
  values(agreement,'Synthetic C7 Agreement','synthetic-c7-agreement','active',3,now()-interval '1 day',now()+interval '30 days',staff);
  insert into public.moviback_agreement_codes(agreement_id,code_hash,code_suffix,status,valid_from,valid_until,created_by) values
    (agreement,'sha256:c7-c4','C7C401','available',now()-interval '1 day',now()+interval '10 days',staff),
    (agreement,'sha256:c7-c5','C7C501','available',now()-interval '1 day',now()+interval '10 days',staff),
    (agreement,'sha256:c7-not','C7NOT1','available',now()-interval '1 day',now()+interval '10 days',staff);

  -- C4 activation and replay: one durable event and one delivery.
  result:=public.claim_moviback_agreement_code(c4_user,'sha256:c7-c4');
  entitlement:=(result->>'entitlement_id')::uuid;
  perform pg_temp.assert_true((result->>'ok')::boolean,'C4 activation failed');
  result:=public.claim_moviback_agreement_code(c4_user,'sha256:c7-c4');
  perform pg_temp.assert_true((result->>'replayed')::boolean,'C4 replay not detected');
  perform pg_temp.assert_true((select count(*)=1 from public.notification_events where idempotency_key='moviback.agreement.activated:entitlement:'||entitlement),'C4 activation duplicated event');
  perform pg_temp.assert_true((select count(*)=1 from public.notification_deliveries d join public.notification_events e on e.id=d.event_id where e.aggregate_id=entitlement::text),'C4 activation duplicated delivery');

  -- C3 immediate assignment activates; effective revoke emits once.
  select id into entitlement from public.assign_moviback_agreement(admin_membership,agreement,null,null,staff);
  perform pg_temp.assert_true((select count(*)=1 from public.notification_events where idempotency_key='moviback.agreement.activated:entitlement:'||entitlement),'Admin assignment event missing');
  perform public.revoke_moviback_agreement_entitlement(entitlement,'Synthetic C7 end',staff);
  perform public.revoke_moviback_agreement_entitlement(entitlement,'Synthetic C7 replay',staff);
  perform pg_temp.assert_true((select count(*)=1 from public.notification_events where idempotency_key='moviback.agreement.revoked:entitlement:'||entitlement),'Revoke event missing or duplicated');

  -- C5 valid approval activates the reserved convention.
  result:=public.submit_moviback_membership_request_c5(c5_user,'02800000-0000-4000-8000-000000000001',repeat('3',64),'TEST-C7-C5','RSSPLA90A01H501B','ASC',0,true,false,null,null,'synthetic/c7-c5.pdf',current_date+30,'sha256:c7-c5');
  membership:=(result->>'membership_id')::uuid;
  result:=public.review_moviback_membership_c5(membership,'approve',null,null,staff);
  entitlement:=(result->>'entitlement_id')::uuid;
  perform pg_temp.assert_true(result->>'convention_status'='active','C5 activation failed');
  perform pg_temp.assert_true((select count(*)=1 from public.notification_events where idempotency_key='moviback.agreement.activated:entitlement:'||entitlement),'C5 activation event missing');

  -- Preference-off retains the event and skips delivery. An expired code leads
  -- only to not_activated, never to activated.
  update public.user_notification_preferences set transactional_email_enabled=false where user_id=not_user;
  result:=public.submit_moviback_membership_request_c5(not_user,'02800000-0000-4000-8000-000000000002',repeat('4',64),'TEST-C7-NOT','RSSPLA90A01H501C','ASC',0,true,false,null,null,'synthetic/c7-not.pdf',current_date+30,'sha256:c7-not');
  membership:=(result->>'membership_id')::uuid;
  update public.moviback_agreement_codes set valid_until=now()-interval '1 second' where code_hash='sha256:c7-not';
  result:=public.review_moviback_membership_c5(membership,'approve',null,null,staff);
  entitlement:=(result->>'entitlement_id')::uuid;
  perform pg_temp.assert_true(result->>'convention_status'='not_activated','C5 not_activated outcome missing');
  perform pg_temp.assert_true((select count(*)=1 from public.notification_events where idempotency_key='moviback.agreement.not_activated:entitlement:'||entitlement),'not_activated event missing');
  perform pg_temp.assert_true((select d.status='skipped' and d.last_error_code='preferences_disabled' from public.notification_deliveries d join public.notification_events e on e.id=d.event_id where e.idempotency_key='moviback.agreement.not_activated:entitlement:'||entitlement),'Preference-off delivery was not skipped');
  perform pg_temp.assert_true(not exists(select 1 from public.notification_events where idempotency_key='moviback.agreement.activated:entitlement:'||entitlement),'not_activated also emitted activated');

  -- A historical merged profile resolves to the canonical recipient exactly once.
  insert into public.moviback_agreement_entitlements(id,membership_id,agreement_id,status,activation_source,activated_at,effective_from,effective_until)
  values('e2800000-0000-4000-8000-000000000001',merged_membership,agreement,'active','admin',now(),now(),now()+interval '10 days');
  insert into public.moviback_agreement_audit_events(agreement_id,entitlement_id,event_type,actor_staff_id,after_state)
  values(agreement,'e2800000-0000-4000-8000-000000000001','entitlement_assigned',staff,jsonb_build_object('status','active'));
  perform pg_temp.assert_true((select count(*)=1 from public.notification_events where aggregate_id='e2800000-0000-4000-8000-000000000001'),'Merged identity event missing or duplicated');
  perform pg_temp.assert_true((select recipient_user_id=canonical_user from public.notification_events where aggregate_id='e2800000-0000-4000-8000-000000000001'),'Merged identity recipient is not canonical');
  perform pg_temp.assert_true(not exists(select 1 from public.notification_events where recipient_user_id=merged_user),'Historical merged profile received notification');

  perform pg_temp.assert_true(not has_function_privilege('authenticated','public.enqueue_moviback_agreement_user_notification()','EXECUTE'),'C7 producer exposed');
end $$;

select 'moviback corporate conventions C7 notifications SQL acceptance PASS' as result;
rollback;
