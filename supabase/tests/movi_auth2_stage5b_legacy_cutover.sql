\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at) VALUES
 ('5b100000-0000-4000-8000-000000000001','stage5b-linked@example.invalid',now(),now(),now());

INSERT INTO public.users(id,full_name,phone,email,gender,auth_user_id,auth_migration_state) VALUES
 ('5b200000-0000-4000-8000-000000000001','Eligible Legacy','3479600001','eligible.stage5b@example.invalid','M',NULL,'legacy'),
 ('5b200000-0000-4000-8000-000000000002','Pending Legacy','3479600002','pending.stage5b@example.invalid','F',NULL,'activation_pending'),
 ('5b200000-0000-4000-8000-000000000003','Linked Profile','3479600003','stage5b-linked@example.invalid','M','5b100000-0000-4000-8000-000000000001','linked'),
 ('5b200000-0000-4000-8000-000000000004','Review Profile','3479600004','review.stage5b@example.invalid','F',NULL,'review_required'),
 ('5b200000-0000-4000-8000-000000000005','Conflict Profile','3479600005','conflict.stage5b@example.invalid','M',NULL,'conflict'),
 ('5b200000-0000-4000-8000-000000000006','Canonical Profile','3479600006','canonical.stage5b@example.invalid','F',NULL,'legacy'),
 ('5b200000-0000-4000-8000-000000000007','Merged Source','3479600007','merged.stage5b@example.invalid','M',NULL,'legacy');

UPDATE public.users SET identity_status='merged',merged_into_user_id='5b200000-0000-4000-8000-000000000006',merged_at=now()
 WHERE id='5b200000-0000-4000-8000-000000000007';

INSERT INTO public.loyalty_memberships(id,user_id,status,membership_code,tax_code,membership_type) VALUES
 ('5b300000-0000-4000-8000-000000000001','5b200000-0000-4000-8000-000000000001','approved','STAGE5B','STAGE5B-TAX','ASC');
INSERT INTO public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points,customer_name,customer_phone,customer_email) VALUES
 ('5b310000-0000-4000-8000-000000000001','5b200000-0000-4000-8000-000000000001','pending','CENTALLO','euro',10,0,'Snapshot','3479600001','eligible.stage5b@example.invalid');

DO $test$
DECLARE v jsonb; before_profile jsonb; after_profile jsonb; before_users integer; summary jsonb;
  before_success integer; before_not_found integer; before_auth integer; before_review integer; before_conflict integer;
BEGIN
  SELECT to_jsonb(u) INTO before_profile FROM public.users u WHERE id='5b200000-0000-4000-8000-000000000001';
  SELECT count(*) INTO before_users FROM public.users;
  SELECT count(*) INTO before_success FROM public.user_legacy_login_events WHERE event_type='legacy_login_success';
  SELECT count(*) INTO before_not_found FROM public.user_legacy_login_events WHERE event_type='legacy_login_not_found';
  SELECT count(*) INTO before_auth FROM public.user_legacy_login_events WHERE event_type='legacy_login_auth_required';
  SELECT count(*) INTO before_review FROM public.user_legacy_login_events WHERE event_type='legacy_login_review_required';
  SELECT count(*) INTO before_conflict FROM public.user_legacy_login_events WHERE event_type='legacy_login_conflict';

  v:=public.legacy_user_login_lookup('+39 347 960 0001',' ELIGIBLE.STAGE5B@EXAMPLE.INVALID ');
  IF v->>'state'<>'legacy_allowed' OR v->>'public_user_id'<>'5b200000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'eligible normalized lookup failed: %',v;
  END IF;
  IF public.legacy_user_login_lookup('3479600002','pending.stage5b@example.invalid')->>'state'<>'legacy_allowed' THEN
    RAISE EXCEPTION 'activation_pending should remain eligible';
  END IF;
  IF public.legacy_user_login_lookup('3479600001','wrong.stage5b@example.invalid')->>'state'<>'not_found'
    OR public.legacy_user_login_lookup('3479699999','eligible.stage5b@example.invalid')->>'state'<>'not_found'
    OR public.legacy_user_login_lookup('3479699999','missing.stage5b@example.invalid')->>'state'<>'not_found' THEN
    RAISE EXCEPTION 'unknown or mismatched identity was not rejected';
  END IF;
  IF public.legacy_user_login_lookup('3479600003','stage5b-linked@example.invalid')->>'state'<>'auth_required' THEN
    RAISE EXCEPTION 'linked profile was not denied';
  END IF;
  IF public.legacy_user_login_lookup('3479600004','review.stage5b@example.invalid')->>'state'<>'review_required' THEN
    RAISE EXCEPTION 'review profile policy failed';
  END IF;
  IF public.legacy_user_login_lookup('3479600005','conflict.stage5b@example.invalid')->>'state'<>'conflict' THEN
    RAISE EXCEPTION 'conflict profile policy failed';
  END IF;
  IF public.legacy_user_login_lookup('3479600007','merged.stage5b@example.invalid')->>'state'<>'merged' THEN
    RAISE EXCEPTION 'merged profile was not denied';
  END IF;

  SELECT to_jsonb(u) INTO after_profile FROM public.users u WHERE id='5b200000-0000-4000-8000-000000000001';
  IF before_profile<>after_profile OR (SELECT count(*) FROM public.users)<>before_users THEN
    RAISE EXCEPTION 'lookup-only login mutated or created a profile';
  END IF;
  IF (SELECT user_id FROM public.loyalty_memberships WHERE id='5b300000-0000-4000-8000-000000000001')<>'5b200000-0000-4000-8000-000000000001'
    OR (SELECT user_id FROM public.store_orders WHERE id='5b310000-0000-4000-8000-000000000001')<>'5b200000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'business ownership changed';
  END IF;
  IF (SELECT count(*) FROM public.user_legacy_login_events WHERE event_type='legacy_login_success')<>before_success+2
    OR (SELECT count(*) FROM public.user_legacy_login_events WHERE event_type='legacy_login_not_found')<>before_not_found+3
    OR (SELECT count(*) FROM public.user_legacy_login_events WHERE event_type='legacy_login_auth_required')<>before_auth+2
    OR (SELECT count(*) FROM public.user_legacy_login_events WHERE event_type='legacy_login_review_required')<>before_review+1
    OR (SELECT count(*) FROM public.user_legacy_login_events WHERE event_type='legacy_login_conflict')<>before_conflict+1 THEN
    RAISE EXCEPTION 'legacy telemetry counters are inaccurate';
  END IF;
  summary:=public.user_migration_summary();
  IF (summary->>'legacy_logins_30d')::integer<2 OR NOT (summary ? 'auth_linked_active_percent') THEN
    RAISE EXCEPTION 'migration summary missing Stage 5B metrics: %',summary;
  END IF;
END $test$;

DO $immutability$
BEGIN
  BEGIN
    UPDATE public.user_legacy_login_events SET details='{"changed":true}'::jsonb;
    RAISE EXCEPTION 'telemetry unexpectedly mutable';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END $immutability$;

SET LOCAL ROLE authenticated;
DO $browser$
BEGIN
  BEGIN
    PERFORM public.legacy_user_login_lookup('3479600001','eligible.stage5b@example.invalid');
    RAISE EXCEPTION 'authenticated role executed lookup';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.user_legacy_login_events;
    RAISE EXCEPTION 'authenticated role read private telemetry';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $browser$;
RESET ROLE;

ROLLBACK;
\echo 'MOVI Auth 2.0 Stage 5B lookup-only cutover PASS'
