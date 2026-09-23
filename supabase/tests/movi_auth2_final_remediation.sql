\set ON_ERROR_STOP on
BEGIN;

-- M-02: the set-based aggregator returns the same complete shape for 210 users.
INSERT INTO public.users(id,full_name,phone,email,gender)
SELECT ('d2000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
       'M02 Synthetic '||g,
       '347'||lpad(g::text,7,'0'),
       'm02-'||g||'@example.invalid',
       CASE WHEN g%2=0 THEN 'F' ELSE 'M' END
FROM generate_series(1,210) g;

DO $test$
DECLARE
  ids uuid[];
  actual jsonb;
  expected jsonb;
  zero_counts constant jsonb := jsonb_build_object(
    'communications',0,'league_audit_events',0,'lineups_submitted',0,
    'contests_opened',0,'results_submitted',0,'league_rosters',0,
    'moviback_memberships',0,'medical_certificates',0,'store_orders',0,
    'open_store_orders',0,'tournament_registrations',0,'tournament_participants',0
  );
BEGIN
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.users WHERE id::text LIKE 'd2000000-%';
  IF (SELECT count(*) FROM public.duplicate_user_reference_counts(ids)) <> 210 THEN
    RAISE EXCEPTION 'M02_EXPECTED_210_ROWS';
  END IF;
  IF EXISTS(SELECT 1 FROM public.duplicate_user_reference_counts(ids) WHERE reference_counts<>zero_counts) THEN
    RAISE EXCEPTION 'M02_ZERO_COUNT_SHAPE_CHANGED';
  END IF;

  SELECT reference_counts INTO actual
  FROM public.duplicate_user_reference_counts(ARRAY['00000000-0000-4000-8000-000000001001'::uuid]);
  SELECT jsonb_build_object(
    'communications',(SELECT count(*) FROM public.communication_user_states WHERE user_id='00000000-0000-4000-8000-000000001001'),
    'league_audit_events',(SELECT count(*) FROM public.league_audit_events WHERE actor_user_id='00000000-0000-4000-8000-000000001001'),
    'lineups_submitted',(SELECT count(*) FROM public.league_lineups WHERE submitted_by_user_id='00000000-0000-4000-8000-000000001001'),
    'contests_opened',(SELECT count(*) FROM public.league_result_contests WHERE opened_by_user_id='00000000-0000-4000-8000-000000001001'),
    'results_submitted',(SELECT count(*) FROM public.league_result_submissions WHERE submitted_by_user_id='00000000-0000-4000-8000-000000001001'),
    'league_rosters',(SELECT count(*) FROM public.league_team_players WHERE user_id='00000000-0000-4000-8000-000000001001'),
    'moviback_memberships',(SELECT count(*) FROM public.loyalty_memberships WHERE user_id='00000000-0000-4000-8000-000000001001'),
    'medical_certificates',(SELECT count(*) FROM public.medical_certificates WHERE user_id='00000000-0000-4000-8000-000000001001'),
    'store_orders',(SELECT count(*) FROM public.store_orders WHERE user_id='00000000-0000-4000-8000-000000001001'),
    'open_store_orders',(SELECT count(*) FROM public.store_orders WHERE user_id='00000000-0000-4000-8000-000000001001' AND status NOT IN('delivered','cancelled')),
    'tournament_registrations',(SELECT count(*) FROM public.tournament_registrations WHERE user_id='00000000-0000-4000-8000-000000001001'),
    'tournament_participants',(SELECT count(*) FROM public.tournament_run_participants WHERE user_id='00000000-0000-4000-8000-000000001001')
  ) INTO expected;
  IF actual<>expected THEN RAISE EXCEPTION 'M02_BUSINESS_OUTPUT_CHANGED actual=% expected=%',actual,expected; END IF;
END $test$;

-- M-03: eight attempts are allowed, the ninth is blocked, another client is isolated,
-- and a new window resets without deleting earlier attempts on success.
DO $test$
DECLARE
  result jsonb;
  base timestamptz := '2026-09-23 10:00:00+00';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result:=public.consume_legacy_login_rate_limit(repeat('a',64),repeat('b',64),base);
    IF (result->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'M03_EARLY_BLOCK_%',i; END IF;
  END LOOP;
  result:=public.consume_legacy_login_rate_limit(repeat('a',64),repeat('b',64),base);
  IF (result->>'allowed')::boolean IS NOT FALSE OR (result->>'retry_after_seconds')::int<>900 THEN
    RAISE EXCEPTION 'M03_THRESHOLD_OR_RETRY_AFTER %',result;
  END IF;
  result:=public.consume_legacy_login_rate_limit(repeat('c',64),repeat('d',64),base);
  IF (result->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'M03_SEPARATE_CLIENT_BLOCKED'; END IF;
  result:=public.consume_legacy_login_rate_limit(repeat('a',64),repeat('b',64),base+interval '16 minutes');
  IF (result->>'allowed')::boolean IS NOT TRUE OR (result->>'identity_attempts')::int<>1 THEN
    RAISE EXCEPTION 'M03_EXPIRATION_FAILED %',result;
  END IF;
END $test$;

DO $test$
BEGIN
  IF EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='legacy_login_rate_limits'
      AND column_name IN('email','phone','ip','password','cookie','token')
  ) THEN RAISE EXCEPTION 'M03_RAW_PII_COLUMN'; END IF;
  IF has_table_privilege('anon','public.legacy_login_rate_limits','SELECT')
     OR has_table_privilege('authenticated','public.legacy_login_rate_limits','SELECT')
     OR has_table_privilege('service_role','public.legacy_login_rate_limits','SELECT') THEN
    RAISE EXCEPTION 'M03_TABLE_EXPOSED';
  END IF;
  IF has_function_privilege('anon','public.consume_legacy_login_rate_limit(text,text,timestamptz)','EXECUTE')
     OR has_function_privilege('authenticated','public.consume_legacy_login_rate_limit(text,text,timestamptz)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.consume_legacy_login_rate_limit(text,text,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'M03_FUNCTION_GRANTS';
  END IF;
END $test$;

ROLLBACK;
SELECT 'MOVI_AUTH2_FINAL_REMEDIATION_SQL_PASS' AS result;
