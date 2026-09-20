\set ON_ERROR_STOP on

-- Monday League Stage 1 schema/security verification. All test data rolls back.
BEGIN;

INSERT INTO public.users (id, full_name, phone, email, gender)
VALUES
  ('21000000-0000-4000-8000-000000000001', 'ML TEST CAPTAIN 1', '+390000009101', 'ml-captain-1@example.invalid', 'M'),
  ('21000000-0000-4000-8000-000000000002', 'ML TEST CAPTAIN 2', '+390000009102', 'ml-captain-2@example.invalid', 'F'),
  ('21000000-0000-4000-8000-000000000003', 'ML TEST CAPTAIN 3', '+390000009103', 'ml-captain-3@example.invalid', 'M');

INSERT INTO public.staff_users (id, full_name, email, role, is_active)
VALUES ('22000000-0000-4000-8000-000000000001', 'ML TEST ADMIN', 'ml-admin@example.invalid', 'admin', true);

SET LOCAL ROLE service_role;
SET CONSTRAINTS ALL DEFERRED;

INSERT INTO public.league_seasons (id, name, slug)
VALUES ('23000000-0000-4000-8000-000000000001', 'ML Test Season', 'ml-test-season');

INSERT INTO public.league_teams (id, season_id, name, slug, captain_player_id)
VALUES
  ('24000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'ML Team One', 'ml-team-one', '25000000-0000-4000-8000-000000000001'),
  ('24000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000001', 'ML Team Two', 'ml-team-two', '25000000-0000-4000-8000-000000000002'),
  ('24000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000001', 'ML Team Three', 'ml-team-three', '25000000-0000-4000-8000-000000000003');

INSERT INTO public.league_team_players (id, team_id, display_name, user_id)
VALUES
  ('25000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'Captain One', '21000000-0000-4000-8000-000000000001'),
  ('25000000-0000-4000-8000-000000000002', '24000000-0000-4000-8000-000000000002', 'Captain Two', '21000000-0000-4000-8000-000000000002'),
  ('25000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000003', 'Captain Three', '21000000-0000-4000-8000-000000000003');

INSERT INTO public.league_phases (id, season_id, code, name, sequence)
VALUES ('26000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'phase1', 'Phase 1', 1);

INSERT INTO public.league_phase_teams (phase_id, team_id, seed_position, tie_break_order)
VALUES
  ('26000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 1, 2),
  ('26000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000002', 2, 1),
  ('26000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000003', 3, 3);

INSERT INTO public.league_rounds (id, phase_id, round_number, play_date)
VALUES
  ('27000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 1, '2026-10-05'),
  ('27000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001', 2, '2026-10-12');

INSERT INTO public.league_matches (
  id, phase_id, round_id, home_team_id, away_team_id
) VALUES (
  '28000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000002'
);

INSERT INTO public.league_match_team_slots (match_id, round_id, team_id, side)
VALUES
  ('28000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'home'),
  ('28000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000002', 'away');

SET CONSTRAINTS ALL IMMEDIATE;

DO $test$
DECLARE v_error boolean;
BEGIN
  v_error := false;
  BEGIN
    INSERT INTO public.league_seasons (name, slug, max_teams) VALUES ('Bad max', 'bad-max', 17);
  EXCEPTION WHEN check_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_MAX_TEAMS'; END IF;

  v_error := false;
  BEGIN
    INSERT INTO public.league_seasons (name, slug) VALUES ('Duplicate slug', 'ml-test-season');
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_SEASON_SLUG'; END IF;

  v_error := false;
  BEGIN
    INSERT INTO public.league_team_players (team_id, display_name, user_id)
    VALUES ('24000000-0000-4000-8000-000000000001', 'Invalid User', 'ffffffff-ffff-4fff-8fff-ffffffffffff');
  EXCEPTION WHEN foreign_key_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_PLAYER_USER_FK'; END IF;

  v_error := false;
  BEGIN
    INSERT INTO public.league_phases (season_id, code, name, sequence)
    VALUES ('23000000-0000-4000-8000-000000000001', 'phase1', 'Duplicate Phase 1', 2);
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_PHASE_CODE'; END IF;

  v_error := false;
  BEGIN
    INSERT INTO public.league_phase_teams (phase_id, team_id, seed_position, tie_break_order)
    VALUES ('26000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000003', 1, 4);
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_PHASE_SEED_UNIQUE'; END IF;

  v_error := false;
  BEGIN
    UPDATE public.league_phase_teams SET tie_break_order = 1
    WHERE phase_id = '26000000-0000-4000-8000-000000000001'
      AND team_id = '24000000-0000-4000-8000-000000000003';
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_TIE_BREAK_UNIQUE'; END IF;

  v_error := false;
  BEGIN
    INSERT INTO public.league_venue_slots (venue_id, weekday, local_time)
    VALUES ('11000000-0000-4000-8000-000000000001', 1, '20:00');
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_VENUE_SLOT_UNIQUE'; END IF;

  v_error := false;
  BEGIN
    INSERT INTO public.league_matches (phase_id, round_id, home_team_id, away_team_id)
    VALUES (
      '26000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000002',
      '24000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN check_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_HOME_AWAY_DIFFER'; END IF;

  v_error := false;
  BEGIN
    INSERT INTO public.league_matches (phase_id, round_id, home_team_id, away_team_id)
    VALUES (
      '26000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000002',
      '24000000-0000-4000-8000-000000000002',
      '24000000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_UNORDERED_PAIR_UNIQUE'; END IF;

  v_error := false;
  BEGIN
    INSERT INTO public.league_generation_runs (
      phase_id, generation_kind, input_team_order, algorithm_version,
      fingerprint, quality_metrics, generated_by_staff_id, completed_at
    ) VALUES (
      '26000000-0000-4000-8000-000000000001', 'phase_schedule', '[]', 'test-v1',
      repeat('a', 64), '{}', '22000000-0000-4000-8000-000000000001', now()
    );
    INSERT INTO public.league_generation_runs (
      phase_id, generation_kind, input_team_order, algorithm_version,
      fingerprint, quality_metrics, generated_by_staff_id, completed_at
    ) VALUES (
      '26000000-0000-4000-8000-000000000001', 'phase_schedule', '[]', 'test-v1',
      repeat('b', 64), '{}', '22000000-0000-4000-8000-000000000001', now()
    );
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_GENERATION_UNIQUE'; END IF;
END
$test$;

-- Team name/slug uniqueness is tested in a deferred transaction because a valid
-- team and captain player must be created together.
SET CONSTRAINTS ALL DEFERRED;
DO $test$
DECLARE v_error boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.league_teams (id, season_id, name, slug, captain_player_id)
    VALUES (
      '24000000-0000-4000-8000-000000000099',
      '23000000-0000-4000-8000-000000000001',
      'ML Team One', 'ml-team-one-copy',
      '25000000-0000-4000-8000-000000000099'
    );
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_TEAM_NAME_UNIQUE'; END IF;

  v_error := false;
  BEGIN
    INSERT INTO public.league_teams (id, season_id, name, slug, captain_player_id)
    VALUES (
      '24000000-0000-4000-8000-000000000098',
      '23000000-0000-4000-8000-000000000001',
      'Different Name', 'ml-team-one',
      '25000000-0000-4000-8000-000000000098'
    );
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_TEAM_SLUG_UNIQUE'; END IF;
END
$test$;
SET CONSTRAINTS ALL IMMEDIATE;

-- A match plus both participation rows is one deferred transaction. The unique
-- (round_id, team_id) key rejects a second appearance in the same round.
SET CONSTRAINTS ALL DEFERRED;
DO $test$
DECLARE v_error boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.league_matches (
      id, phase_id, round_id, home_team_id, away_team_id
    ) VALUES (
      '28000000-0000-4000-8000-000000000002',
      '26000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000003'
    );
    INSERT INTO public.league_match_team_slots (match_id, round_id, team_id, side)
    VALUES
      ('28000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'home'),
      ('28000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000003', 'away');
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_ONE_TEAM_PER_ROUND'; END IF;
END
$test$;
SET CONSTRAINTS ALL IMMEDIATE;

DO $test$
DECLARE
  v_slots jsonb;
  v_table text;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('venue', code, 'time', to_char(local_time, 'HH24:MI')) ORDER BY code, local_time)
    INTO v_slots
    FROM public.league_venues v
    JOIN public.league_venue_slots s ON s.venue_id = v.id
   WHERE v.is_active AND s.is_active AND s.weekday = 1;

  IF jsonb_array_length(v_slots) <> 8
     OR NOT v_slots @> '[{"venue":"COSTIGLIOLE","time":"20:00"},{"venue":"COSTIGLIOLE","time":"21:30"},{"venue":"MANTA","time":"20:00"},{"venue":"MANTA","time":"21:30"},{"venue":"CENTALLO","time":"19:30"},{"venue":"CENTALLO","time":"20:00"},{"venue":"CENTALLO","time":"21:00"},{"venue":"CENTALLO","time":"21:30"}]'::jsonb THEN
    RAISE EXCEPTION 'ML_ASSERT_OFFICIAL_VENUE_SLOTS';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'league_seasons', 'league_teams', 'league_team_players', 'league_phases',
    'league_phase_teams', 'league_venues', 'league_venue_slots', 'league_rounds',
    'league_matches', 'league_match_team_slots', 'league_audit_events',
    'league_generation_runs'
  ] LOOP
    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE') THEN
      RAISE EXCEPTION 'ML_ASSERT_APPLICATION_ROLE_DENIED:%', v_table;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_table)::regclass) THEN
      RAISE EXCEPTION 'ML_ASSERT_RLS_ENABLED:%', v_table;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.league_seasons', 'SELECT,INSERT,UPDATE,DELETE')
     OR NOT has_table_privilege('service_role', 'public.league_matches', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'ML_ASSERT_SERVICE_ROLE_OPERATIONS';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.league_audit_events', 'SELECT,INSERT')
     OR has_table_privilege('service_role', 'public.league_audit_events', 'UPDATE')
     OR has_table_privilege('service_role', 'public.league_audit_events', 'DELETE') THEN
    RAISE EXCEPTION 'ML_ASSERT_AUDIT_APPEND_ONLY';
  END IF;
END
$test$;

-- A scheduled venue/instant can be occupied only once.
UPDATE public.league_matches
SET venue_id = '11000000-0000-4000-8000-000000000003',
    scheduled_at = '2026-10-05 19:30:00+02',
    match_status = 'scheduled'
WHERE id = '28000000-0000-4000-8000-000000000001';

DO $test$
DECLARE v_error boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.league_matches (
      id, phase_id, round_id, home_team_id, away_team_id,
      venue_id, scheduled_at, match_status
    ) VALUES (
      '28000000-0000-4000-8000-000000000003',
      '26000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000002',
      '24000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000003',
      '11000000-0000-4000-8000-000000000003',
      '2026-10-05 19:30:00+02',
      'scheduled'
    );
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_ASSERT_VENUE_INSTANT_UNIQUE'; END IF;
END
$test$;

ROLLBACK;

SELECT 'MONDAY_LEAGUE_STAGE1_FOUNDATION_OK' AS result;
