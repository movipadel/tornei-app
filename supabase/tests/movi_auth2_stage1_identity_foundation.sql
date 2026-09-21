\set ON_ERROR_STOP on

-- MOVI Auth 2.0 Stage 1 local database contract. All rows roll back.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'stage1-auth-1@example.invalid', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', 'stage1-auth-2@example.invalid', now(), now());

INSERT INTO public.users (id, full_name, phone, email, gender, auth_user_id)
VALUES
  ('a2000000-0000-4000-8000-000000000001', 'AUTH2 LEGACY', '40', ' Legacy@Example.Invalid ', 'M', NULL),
  ('a2000000-0000-4000-8000-000000000002', 'AUTH2 SOURCE A', '3471286908', 'SourceA@example.invalid', 'F', 'a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000003', 'AUTH2 SOURCE B', '+393471286909', 'sourceb@example.invalid', 'F', NULL),
  ('a2000000-0000-4000-8000-000000000004', 'AUTH2 CANONICAL', '00393471286910', 'canonical@example.invalid', 'F', 'a1000000-0000-4000-8000-000000000002'),
  ('a2000000-0000-4000-8000-000000000005', 'AUTH2 EXTRA', '+393471286911', 'extra@example.invalid', 'M', NULL);

DO $test$
DECLARE
  v_error boolean := false;
BEGIN
  -- Existing legacy profiles remain valid with a NULL Auth link.
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = 'a2000000-0000-4000-8000-000000000001'
      AND auth_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'AUTH2_ASSERT_LEGACY_NULL_VALID';
  END IF;

  BEGIN
    UPDATE public.users
       SET auth_user_id = 'a1000000-0000-4000-8000-000000000001'
     WHERE id = 'a2000000-0000-4000-8000-000000000003';
  EXCEPTION WHEN unique_violation THEN
    v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'AUTH2_ASSERT_AUTH_USER_UNIQUE'; END IF;

  IF public.normalize_user_email('  Mixed.Case@Example.COM  ') <> 'mixed.case@example.com'
     OR public.normalize_user_email('   ') IS NOT NULL THEN
    RAISE EXCEPTION 'AUTH2_ASSERT_EMAIL_NORMALIZATION';
  END IF;

  IF public.normalize_user_mobile_e164('3471286908') <> '+393471286908'
     OR public.normalize_user_mobile_e164('+393471286908') <> '+393471286908'
     OR public.normalize_user_mobile_e164('00393471286908') <> '+393471286908'
     OR public.normalize_user_mobile_e164('347 128 6908') <> '+393471286908'
     OR public.normalize_user_mobile_e164('+39 347 128 6908') <> '+393471286908'
     OR public.normalize_user_mobile_e164('40') IS NOT NULL
     OR public.normalize_user_mobile_e164('41') IS NOT NULL THEN
    RAISE EXCEPTION 'AUTH2_ASSERT_PHONE_NORMALIZATION';
  END IF;
END
$test$;

-- Deleting an Auth credential detaches rather than deleting business data.
DELETE FROM auth.users WHERE id = 'a1000000-0000-4000-8000-000000000001';

SELECT 1 / CASE WHEN EXISTS (
  SELECT 1 FROM public.users
  WHERE id = 'a2000000-0000-4000-8000-000000000002'
    AND auth_user_id IS NULL
) THEN 1 ELSE 0 END AS auth_delete_sets_null;

INSERT INTO public.user_identity_aliases (
  source_user_id, canonical_user_id, status, reason, merged_at
) VALUES (
  'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000003',
  'active', 'synthetic Stage 1 test', now()
);

DO $test$
DECLARE
  v_error boolean;
BEGIN
  v_error := false;
  BEGIN
    INSERT INTO public.user_identity_aliases (
      source_user_id, canonical_user_id, status, reason, merged_at
    ) VALUES (
      'a2000000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000004',
      'active', 'duplicate source test', now()
    );
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'AUTH2_ASSERT_DUPLICATE_ALIAS'; END IF;

  v_error := false;
  BEGIN
    INSERT INTO public.user_identity_aliases (
      source_user_id, canonical_user_id, reason
    ) VALUES (
      'a2000000-0000-4000-8000-000000000005',
      'a2000000-0000-4000-8000-000000000005',
      'self alias test'
    );
  EXCEPTION WHEN check_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'AUTH2_ASSERT_SELF_ALIAS'; END IF;

  -- A -> B already exists. B -> A must be rejected.
  v_error := false;
  BEGIN
    INSERT INTO public.user_identity_aliases (
      source_user_id, canonical_user_id, status, reason, merged_at
    ) VALUES (
      'a2000000-0000-4000-8000-000000000003',
      'a2000000-0000-4000-8000-000000000002',
      'active', 'short cycle test', now()
    );
  EXCEPTION WHEN check_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'AUTH2_ASSERT_SHORT_CYCLE'; END IF;
END
$test$;

INSERT INTO public.user_identity_aliases (
  source_user_id, canonical_user_id, status, reason, merged_at
) VALUES (
  'a2000000-0000-4000-8000-000000000003',
  'a2000000-0000-4000-8000-000000000004',
  'active', 'synthetic chained alias test', now()
);

DO $test$
DECLARE
  v_error boolean := false;
BEGIN
  -- Existing chain is A -> B -> C. C -> A must be rejected.
  BEGIN
    INSERT INTO public.user_identity_aliases (
      source_user_id, canonical_user_id, status, reason, merged_at
    ) VALUES (
      'a2000000-0000-4000-8000-000000000004',
      'a2000000-0000-4000-8000-000000000002',
      'active', 'long cycle test', now()
    );
  EXCEPTION WHEN check_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'AUTH2_ASSERT_LONG_CYCLE'; END IF;

  IF public.resolve_canonical_user_id('a2000000-0000-4000-8000-000000000002')
       <> 'a2000000-0000-4000-8000-000000000004'
     OR public.resolve_canonical_user_id('a2000000-0000-4000-8000-000000000004')
       <> 'a2000000-0000-4000-8000-000000000004'
     OR public.resolve_canonical_user_id('ffffffff-ffff-4fff-8fff-ffffffffffff') IS NOT NULL THEN
    RAISE EXCEPTION 'AUTH2_ASSERT_CANONICAL_RESOLUTION';
  END IF;
END
$test$;

INSERT INTO public.staff_users (id, full_name, email, role, is_active)
VALUES (
  'a3000000-0000-4000-8000-000000000001',
  'AUTH2 TEST ADMIN', 'auth2-admin@example.invalid', 'admin', true
);

INSERT INTO public.user_merge_operations (
  id, request_id, source_user_id, canonical_user_id, reason, created_by_staff_id
) VALUES (
  'a4000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000004',
  'synthetic journal test',
  'a3000000-0000-4000-8000-000000000001'
);

INSERT INTO public.user_merge_journal (
  operation_id, source_user_id, canonical_user_id,
  event_type, status, actor_staff_id, details
) VALUES (
  'a4000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000004',
  'requested', 'planned',
  'a3000000-0000-4000-8000-000000000001',
  '{"synthetic":true}'::jsonb
);

DO $test$
DECLARE
  v_error boolean := false;
BEGIN
  BEGIN
    UPDATE public.user_merge_journal SET status = 'completed';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'AUTH2_ASSERT_JOURNAL_IMMUTABLE'; END IF;
END
$test$;

-- The browser roles have neither table privileges nor helper execution rights.
SELECT 1 / CASE WHEN
  NOT has_table_privilege('anon', 'public.user_identity_aliases', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.user_identity_aliases', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.user_identity_aliases', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.user_identity_aliases', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.user_merge_operations', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.user_merge_journal', 'INSERT')
  AND NOT has_function_privilege('anon', 'public.resolve_canonical_user_id(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.resolve_canonical_user_id(uuid)', 'EXECUTE')
THEN 1 ELSE 0 END AS browser_privileges_denied;

SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_error boolean := false;
BEGIN
  BEGIN
    PERFORM source_user_id FROM public.user_identity_aliases LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'AUTH2_ASSERT_ALIAS_BROWSER_READ_DENIED'; END IF;
END
$test$;
RESET ROLE;

-- Known business dependencies and copied historical fields still exist.
SELECT 1 / CASE WHEN
  to_regclass('public.business_operation_idempotency') IS NOT NULL
  AND to_regclass('public.communication_user_states') IS NOT NULL
  AND to_regclass('public.communications') IS NOT NULL
  AND to_regclass('public.league_audit_events') IS NOT NULL
  AND to_regclass('public.league_lineups') IS NOT NULL
  AND to_regclass('public.league_notification_events') IS NOT NULL
  AND to_regclass('public.league_result_contests') IS NOT NULL
  AND to_regclass('public.league_result_submissions') IS NOT NULL
  AND to_regclass('public.league_team_players') IS NOT NULL
  AND to_regclass('public.loyalty_memberships') IS NOT NULL
  AND to_regclass('public.medical_certificates') IS NOT NULL
  AND to_regclass('public.store_orders') IS NOT NULL
  AND to_regclass('public.tournament_registrations') IS NOT NULL
  AND to_regclass('public.tournament_run_participants') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_orders'
      AND column_name IN ('customer_phone', 'customer_email')
    GROUP BY table_schema, table_name HAVING count(*) = 2
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'circuit_results'
      AND column_name = 'player_phone'
  )
THEN 1 ELSE 0 END AS dependency_contract_unchanged;

ROLLBACK;

