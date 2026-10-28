BEGIN;

DO $$
DECLARE
  v_staff constant uuid := '03010000-0000-4000-8000-000000000001';
  v_agreement constant uuid := '03010000-0000-4000-8000-000000000002';
  v_entitlement constant uuid := '03010000-0000-4000-8000-000000000003';
  v_result jsonb;
  v_error text;
  v_user uuid;
  v_membership uuid;
  v_index integer;
  v_codes text[] := ARRAY[
    'TEST-LEGACY-CERT-1', 'TEST-LEGACY-CERT-2', 'TEST-LEGACY-CERT-3',
    'TEST-LEGACY-CERT-4', 'TEST-LEGACY-CERT-5', 'TEST-LEGACY-CERT-6',
    'TEST-LEGACY-CERT-7', 'TEST-LEGACY-CERT-8'
  ];
BEGIN
  INSERT INTO public.staff_users(id,full_name,email,role,is_active)
  VALUES(v_staff,'Synthetic Legacy Compatibility Operator','legacy-compat-operator@example.invalid','staff',true);

  FOR v_index IN 1..8 LOOP
    v_user := ('03010000-0000-4000-8000-' || lpad((100 + v_index)::text,12,'0'))::uuid;
    v_membership := ('03010000-0000-4000-8000-' || lpad((200 + v_index)::text,12,'0'))::uuid;
    INSERT INTO public.users(id,full_name,phone,email,gender,identity_status)
    VALUES(v_user,'Synthetic Legacy Compatibility ' || v_index,'34903010' || lpad(v_index::text,2,'0'),'legacy-compat-' || v_index || '@example.invalid','M','active');
    INSERT INTO public.loyalty_memberships(
      id,user_id,status,membership_code,tax_code,membership_type,approved_at,approved_by,created_at
    ) VALUES(
      v_membership,v_user,'approved',v_codes[v_index],'RSSMRA90A01H50' || v_index::text,'ASC',
      CASE
        WHEN v_index=2 THEN NULL
        WHEN v_index=4 THEN '2026-10-28T15:13:45Z'::timestamptz
        ELSE '2026-10-28T15:13:44.999Z'::timestamptz
      END,
      v_staff,
      CASE WHEN v_index=5 THEN '2026-10-28T15:13:45.001Z'::timestamptz ELSE '2026-01-01T00:00:00Z'::timestamptz END
    );
  END LOOP;

  INSERT INTO public.medical_certificates(user_id,file_path,status,expiry_date,uploaded_at)
  VALUES
    ('03010000-0000-4000-8000-000000000101','synthetic/legacy-1.pdf','pending_review','2027-12-31','2026-10-28T15:13:44.999Z'),
    ('03010000-0000-4000-8000-000000000102','synthetic/legacy-2.pdf','pending_review','2027-12-31','2026-10-28T15:13:44.999Z'),
    ('03010000-0000-4000-8000-000000000103','synthetic/cutover-cert.pdf','pending_review','2027-12-31','2026-10-28T15:13:45Z'),
    ('03010000-0000-4000-8000-000000000104','synthetic/cutover-member.pdf','pending_review','2027-12-31','2026-10-28T15:13:44.999Z'),
    ('03010000-0000-4000-8000-000000000105','synthetic/new-pending.pdf','pending_review','2027-12-31','2026-10-28T15:13:45.001Z'),
    ('03010000-0000-4000-8000-000000000106','synthetic/rejected.pdf','rejected','2027-12-31','2026-10-28T15:13:44.999Z'),
    ('03010000-0000-4000-8000-000000000108','synthetic/approved.pdf','approved',current_date+30,'2026-10-28T15:13:45.001Z');

  INSERT INTO public.moviback_agreements(id,name,slug,status,multiplier,valid_from,created_by)
  VALUES(v_agreement,'Synthetic Legacy Compatibility X2','synthetic-legacy-compatibility-x2','active',2,clock_timestamp()-interval '1 day',v_staff);
  INSERT INTO public.moviback_agreement_entitlements(id,membership_id,agreement_id,status,activation_source,activated_at,effective_from)
  VALUES(v_entitlement,'03010000-0000-4000-8000-000000000201',v_agreement,'active','admin',clock_timestamp(),clock_timestamp()-interval '1 hour');
  INSERT INTO public.loyalty_transactions(membership_id,type,source,points_delta,notes)
  VALUES('03010000-0000-4000-8000-000000000201','adjustment','manual_adjustment',5,'Synthetic pre-existing balance');

  v_result := public.credit_moviback_points(
    'TEST-LEGACY-CERT-1',10,'CENTALLO','03010000-0000-4000-8000-000000000301',
    'legacy_compatibility','legacy-qualifying',v_staff
  );
  IF (v_result->>'credited_points')::integer <> 20 OR v_result->>'effective_incentive_source' <> 'agreement' THEN
    RAISE EXCEPTION 'legacy credit did not preserve prospective convention multiplier: %',v_result;
  END IF;
  IF (SELECT sum(points_delta) FROM public.loyalty_transactions WHERE membership_id='03010000-0000-4000-8000-000000000201') <> 25 THEN
    RAISE EXCEPTION 'legacy credit changed historical balance unexpectedly';
  END IF;

  v_result := public.credit_moviback_points(
    'TEST-LEGACY-CERT-2',10,'CENTALLO','03010000-0000-4000-8000-000000000302',
    'legacy_compatibility','legacy-null-approved-at',v_staff
  );
  IF (v_result->>'credited_points')::integer <> 10 THEN
    RAISE EXCEPTION 'approved_at null fallback did not qualify: %',v_result;
  END IF;

  FOR v_index IN 3..7 LOOP
    v_error := NULL;
    BEGIN
      PERFORM public.credit_moviback_points(
        v_codes[v_index],10,'CENTALLO',
        ('03010000-0000-4000-8000-' || lpad((300 + v_index)::text,12,'0'))::uuid,
        'legacy_compatibility','expected-rejection-' || v_index,v_staff
      );
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;
    IF v_error <> 'MOVIBACK_CREDIT_CERTIFICATE_MISSING' THEN
      RAISE EXCEPTION 'case % expected certificate rejection, got %',v_index,coalesce(v_error,'success');
    END IF;
  END LOOP;

  v_result := public.credit_moviback_points(
    'TEST-LEGACY-CERT-8',10,'CENTALLO','03010000-0000-4000-8000-000000000308',
    'legacy_compatibility','approved-certificate',v_staff
  );
  IF (v_result->>'credited_points')::integer <> 10 THEN
    RAISE EXCEPTION 'approved certificate behavior regressed: %',v_result;
  END IF;
END
$$;

ROLLBACK;
