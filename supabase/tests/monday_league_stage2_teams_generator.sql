\set ON_ERROR_STOP on

-- Stage 2 command/generation integration. All fixtures roll back.
BEGIN;

INSERT INTO public.users (id, full_name, phone, email, gender)
VALUES
  ('31000000-0000-4000-8000-000000000001', 'Stage2 Captain One', '+390000008101', 'ml-s2-1@example.invalid', 'M'),
  ('31000000-0000-4000-8000-000000000002', 'Stage2 Captain Two', '+390000008102', 'ml-s2-2@example.invalid', 'F'),
  ('31000000-0000-4000-8000-000000000003', 'Stage2 Captain Three', '+390000008103', 'ml-s2-3@example.invalid', 'M'),
  ('31000000-0000-4000-8000-000000000004', 'Stage2 Captain Four', '+390000008104', 'ml-s2-4@example.invalid', 'F');

INSERT INTO public.users (id, full_name, phone, email, gender)
SELECT
  ('31000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'Stage2 Captain ' || value,
  '+390000008' || lpad(value::text, 3, '0'),
  'ml-s2-' || value || '@example.invalid',
  CASE WHEN value % 2 = 0 THEN 'F' ELSE 'M' END
FROM generate_series(5, 17) value;

INSERT INTO public.staff_users (id, full_name, email, role, is_active)
VALUES ('32000000-0000-4000-8000-000000000001', 'Stage2 Admin', 'ml-s2-admin@example.invalid', 'admin', true);

SET LOCAL ROLE service_role;

DO $test$
DECLARE
  v_actor constant uuid := '32000000-0000-4000-8000-000000000001';
  v_created jsonb;
  v_result jsonb;
  v_season uuid;
  v_phase uuid;
  v_limit_season uuid;
  v_team_ids uuid[] := ARRAY[]::uuid[];
  v_team uuid;
  v_rounds jsonb;
  v_quality jsonb := '{"invariantViolations":[],"maxStreak":2,"totalDoubleStreaks":4,"totalTriplePlusStreaks":0,"alternationPercentage":66.7,"teams":[]}'::jsonb;
  v_payload text;
  v_fingerprint text;
  v_error boolean;
  v_index integer;
BEGIN
  v_created := public.league_create_season(v_actor, 'Stage 2 Integration', 'stage-2-integration');
  v_season := (v_created #>> '{data,season_id}')::uuid;
  v_phase := (v_created #>> '{data,phase_id}')::uuid;

  FOR v_index IN 1..4 LOOP
    v_result := public.league_save_team(
      v_actor,
      v_season,
      NULL,
      'Stage2 Team ' || v_index,
      'stage2-team-' || v_index,
      ('31000000-0000-4000-8000-' || lpad(v_index::text, 12, '0'))::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'display_name', 'Captain ' || v_index,
          'user_id', '31000000-0000-4000-8000-' || lpad(v_index::text, 12, '0')
        ),
        jsonb_build_object('display_name', 'Guest ' || v_index, 'user_id', NULL)
      )
    );
    v_team_ids := array_append(v_team_ids, (v_result #>> '{data,team_id}')::uuid);
  END LOOP;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  IF (SELECT count(*) FROM public.league_teams WHERE season_id = v_season AND is_active) <> 4
     OR (SELECT count(*) FROM public.league_team_players p JOIN public.league_teams t ON t.id = p.team_id WHERE t.season_id = v_season AND p.is_active) <> 8 THEN
    RAISE EXCEPTION 'ML_S2_ASSERT_TEAM_CREATE';
  END IF;

  v_error := false;
  BEGIN
    PERFORM public.league_save_team(
      v_actor, v_season, NULL, 'Too Large', 'too-large',
      '31000000-0000-4000-8000-000000000001',
      '[{"display_name":"1","user_id":"31000000-0000-4000-8000-000000000001"},{"display_name":"2"},{"display_name":"3"},{"display_name":"4"},{"display_name":"5"}]'::jsonb
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_error := SQLERRM = 'ML_ROSTER_SIZE_INVALID';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_S2_ASSERT_MAX_FOUR_PLAYERS'; END IF;

  v_error := false;
  BEGIN
    PERFORM public.league_save_team(
      v_actor, v_season, NULL, 'Missing Captain', 'missing-captain',
      '31000000-0000-4000-8000-000000000001',
      '[{"display_name":"Guest only"}]'::jsonb
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_error := SQLERRM = 'ML_CAPTAIN_MUST_BE_LINKED_ROSTER_USER';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_S2_ASSERT_CAPTAIN_IN_ROSTER'; END IF;

  v_error := false;
  BEGIN
    PERFORM public.league_save_team(
      '32000000-0000-4000-8000-000000000099', v_season, NULL,
      'Unauthorized Team', 'unauthorized-team',
      '31000000-0000-4000-8000-000000000001',
      '[{"display_name":"Captain One","user_id":"31000000-0000-4000-8000-000000000001"}]'::jsonb
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_error := SQLERRM = 'ML_ADMIN_REQUIRED';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_S2_ASSERT_ADMIN_ONLY_MUTATION'; END IF;

  -- Deferred Stage 1 validation rejects one registered user captaining two
  -- active teams in the same season, including through the Stage 2 command.
  v_error := false;
  SET CONSTRAINTS ALL DEFERRED;
  BEGIN
    PERFORM public.league_save_team(
      v_actor, v_season, NULL, 'Duplicate Captain', 'duplicate-captain',
      '31000000-0000-4000-8000-000000000001',
      '[{"display_name":"Captain One Again","user_id":"31000000-0000-4000-8000-000000000001"}]'::jsonb
    );
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN unique_violation THEN
    v_error := SQLERRM = 'LEAGUE_CAPTAIN_ALREADY_ASSIGNED_IN_SEASON';
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_S2_ASSERT_DUPLICATE_CAPTAIN'; END IF;

  -- Replace team one's roster transactionally; omitted guests become inactive.
  v_team := v_team_ids[1];
  PERFORM public.league_save_team(
    v_actor, v_season, v_team, 'Stage2 Team 1', 'stage2-team-1',
    '31000000-0000-4000-8000-000000000001',
    '[{"display_name":"Captain One Updated","user_id":"31000000-0000-4000-8000-000000000001"}]'::jsonb
  );
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT count(*) FROM public.league_team_players WHERE team_id = v_team AND is_active) <> 1
     OR (SELECT count(*) FROM public.league_team_players WHERE team_id = v_team AND NOT is_active) <> 1 THEN
    RAISE EXCEPTION 'ML_S2_ASSERT_ROSTER_REPLACE';
  END IF;

  v_rounds := jsonb_build_array(
    jsonb_build_object('roundNumber', 1, 'byeTeamId', NULL, 'matches', jsonb_build_array(
      jsonb_build_object('homeTeamId', v_team_ids[1], 'awayTeamId', v_team_ids[4]),
      jsonb_build_object('homeTeamId', v_team_ids[2], 'awayTeamId', v_team_ids[3])
    )),
    jsonb_build_object('roundNumber', 2, 'byeTeamId', NULL, 'matches', jsonb_build_array(
      jsonb_build_object('homeTeamId', v_team_ids[4], 'awayTeamId', v_team_ids[3]),
      jsonb_build_object('homeTeamId', v_team_ids[1], 'awayTeamId', v_team_ids[2])
    )),
    jsonb_build_object('roundNumber', 3, 'byeTeamId', NULL, 'matches', jsonb_build_array(
      jsonb_build_object('homeTeamId', v_team_ids[2], 'awayTeamId', v_team_ids[4]),
      jsonb_build_object('homeTeamId', v_team_ids[3], 'awayTeamId', v_team_ids[1])
    ))
  );
  v_payload := jsonb_build_object(
    'phaseId', v_phase::text,
    'algorithmVersion', 'circle-ha-v1',
    'orderedTeamIds', to_jsonb(v_team_ids),
    'tieBreakOrder', to_jsonb(ARRAY[v_team_ids[4], v_team_ids[2], v_team_ids[1], v_team_ids[3]]),
    'rounds', v_rounds
  )::text;
  v_fingerprint := encode(extensions.digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex');

  v_result := public.league_generate_phase1(
    v_actor, v_phase, v_team_ids,
    ARRAY[v_team_ids[4], v_team_ids[2], v_team_ids[1], v_team_ids[3]],
    'circle-ha-v1', v_fingerprint, v_payload, v_rounds, v_quality
  );
  IF coalesce((v_result->>'created')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'ML_S2_ASSERT_GENERATION_CREATED';
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;

  IF (SELECT count(*) FROM public.league_phase_teams WHERE phase_id = v_phase) <> 4
     OR (SELECT count(*) FROM public.league_rounds WHERE phase_id = v_phase) <> 3
     OR (SELECT count(*) FROM public.league_matches WHERE phase_id = v_phase) <> 6
     OR (SELECT count(*) FROM public.league_match_team_slots s JOIN public.league_matches m ON m.id = s.match_id WHERE m.phase_id = v_phase) <> 12
     OR EXISTS (SELECT 1 FROM public.league_matches WHERE phase_id = v_phase AND (match_status <> 'unscheduled' OR venue_id IS NOT NULL OR scheduled_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'ML_S2_ASSERT_GENERATED_STRUCTURE';
  END IF;
  IF (SELECT status FROM public.league_phases WHERE id = v_phase) <> 'generated'
     OR (SELECT status FROM public.league_seasons WHERE id = v_season) <> 'phase1'
     OR (SELECT count(*) FROM public.league_generation_runs WHERE phase_id = v_phase AND fingerprint = v_fingerprint) <> 1
     OR (SELECT count(*) FROM public.league_audit_events WHERE entity_id = v_phase AND event_type = 'phase1_generated') <> 1 THEN
    RAISE EXCEPTION 'ML_S2_ASSERT_GENERATION_EVIDENCE';
  END IF;

  -- Same request is an idempotent replay and creates no duplicate structure.
  v_result := public.league_generate_phase1(
    v_actor, v_phase, v_team_ids,
    ARRAY[v_team_ids[4], v_team_ids[2], v_team_ids[1], v_team_ids[3]],
    'circle-ha-v1', v_fingerprint, v_payload, v_rounds, v_quality
  );
  IF coalesce((v_result->>'replayed')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.league_matches WHERE phase_id = v_phase) <> 6 THEN
    RAISE EXCEPTION 'ML_S2_ASSERT_IDEMPOTENT_REPLAY';
  END IF;

  v_error := false;
  BEGIN
    PERFORM public.league_generate_phase1(
      v_actor, v_phase, v_team_ids,
      ARRAY[v_team_ids[4], v_team_ids[2], v_team_ids[1], v_team_ids[3]],
      'circle-ha-v1', repeat('a', 64), v_payload, v_rounds, v_quality
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_error := SQLERRM = 'ML_GENERATION_CONFLICT';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'ML_S2_ASSERT_CHANGED_REQUEST_REJECTED'; END IF;

  -- The command-level lock/count guard accepts 16 active teams and rejects team 17.
  v_created := public.league_create_season(v_actor, 'Stage 2 Limit', 'stage-2-limit');
  v_limit_season := (v_created #>> '{data,season_id}')::uuid;
  SET CONSTRAINTS ALL DEFERRED;
  FOR v_index IN 1..16 LOOP
    PERFORM public.league_save_team(
      v_actor, v_limit_season, NULL,
      'Limit Team ' || v_index, 'limit-team-' || v_index,
      ('31000000-0000-4000-8000-' || lpad(v_index::text, 12, '0'))::uuid,
      jsonb_build_array(jsonb_build_object(
        'display_name', 'Limit Captain ' || v_index,
        'user_id', '31000000-0000-4000-8000-' || lpad(v_index::text, 12, '0')
      ))
    );
  END LOOP;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  v_error := false;
  BEGIN
    PERFORM public.league_save_team(
      v_actor, v_limit_season, NULL, 'Limit Team 17', 'limit-team-17',
      '31000000-0000-4000-8000-000000000017',
      '[{"display_name":"Limit Captain 17","user_id":"31000000-0000-4000-8000-000000000017"}]'::jsonb
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_error := SQLERRM = 'ML_MAX_ACTIVE_TEAMS';
  END;
  IF NOT v_error OR (SELECT count(*) FROM public.league_teams WHERE season_id = v_limit_season AND is_active) <> 16 THEN
    RAISE EXCEPTION 'ML_S2_ASSERT_MAX_SIXTEEN_TEAMS';
  END IF;
END
$test$;

DO $security$
BEGIN
  IF has_function_privilege('anon', 'public.league_save_team(uuid,uuid,uuid,text,text,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.league_generate_phase1(uuid,uuid,uuid[],uuid[],text,text,text,jsonb,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.league_generate_phase1(uuid,uuid,uuid[],uuid[],text,text,text,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ML_S2_ASSERT_RPC_PRIVILEGES';
  END IF;
END
$security$;

ROLLBACK;
SELECT 'monday_league_stage2_teams_generator: ok' AS result;
