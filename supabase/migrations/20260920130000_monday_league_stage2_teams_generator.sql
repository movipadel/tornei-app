-- Monday League Stage 2: transactional admin team/roster commands and
-- authoritative persistence command for the TypeScript Phase 1 generator.

CREATE FUNCTION public.league_assert_admin(p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql
    STABLE
    SET search_path TO pg_catalog, public
AS $function$
BEGIN
    IF p_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.staff_users
        WHERE id = p_actor_id AND role = 'admin' AND is_active
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_ADMIN_REQUIRED';
    END IF;
END;
$function$;

CREATE FUNCTION public.league_create_season(
    p_actor_id uuid,
    p_name text,
    p_slug text
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_season_id uuid := gen_random_uuid();
    v_phase_id uuid := gen_random_uuid();
BEGIN
    PERFORM public.league_assert_admin(p_actor_id);
    IF btrim(coalesce(p_name, '')) = '' OR btrim(coalesce(p_slug, '')) = '' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_INVALID_SEASON';
    END IF;

    INSERT INTO public.league_seasons (
        id, name, slug, timezone, status, max_teams, lottery_seed
    ) VALUES (
        v_season_id, btrim(p_name), lower(btrim(p_slug)), 'Europe/Rome',
        'draft', 16, encode(gen_random_bytes(16), 'hex')
    );

    INSERT INTO public.league_phases (
        id, season_id, code, name, sequence, status
    ) VALUES (
        v_phase_id, v_season_id, 'phase1', 'Fase 1', 1, 'draft'
    );

    INSERT INTO public.league_audit_events (
        season_id, entity_type, entity_id, event_type, actor_type,
        actor_staff_id, after_data
    ) VALUES (
        v_season_id, 'season', v_season_id, 'season_created', 'staff',
        p_actor_id, jsonb_build_object('name', btrim(p_name), 'slug', lower(btrim(p_slug)))
    );

    RETURN jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object('season_id', v_season_id, 'phase_id', v_phase_id)
    );
END;
$function$;

CREATE FUNCTION public.league_save_team(
    p_actor_id uuid,
    p_season_id uuid,
    p_team_id uuid,
    p_name text,
    p_slug text,
    p_captain_user_id uuid,
    p_roster jsonb
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    SET search_path TO pg_catalog, public
AS $function$
DECLARE
    v_team_id uuid := coalesce(p_team_id, gen_random_uuid());
    v_captain_player_id uuid;
    v_player_id uuid;
    v_existing record;
    v_item jsonb;
    v_user_id uuid;
    v_display_name text;
    v_active_team_count integer;
    v_max_teams integer;
    v_before jsonb;
    v_roster_count integer;
    v_linked_count integer;
    v_distinct_linked_count integer;
    v_is_create boolean := p_team_id IS NULL;
BEGIN
    PERFORM public.league_assert_admin(p_actor_id);

    SELECT max_teams INTO v_max_teams
      FROM public.league_seasons
     WHERE id = p_season_id
       AND status = 'draft'
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_SEASON_NOT_EDITABLE';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.league_phases
        WHERE season_id = p_season_id AND code = 'phase1' AND status = 'draft'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_PHASE1_NOT_EDITABLE';
    END IF;

    IF btrim(coalesce(p_name, '')) = '' OR btrim(coalesce(p_slug, '')) = ''
       OR p_captain_user_id IS NULL OR jsonb_typeof(p_roster) <> 'array' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_INVALID_TEAM_PAYLOAD';
    END IF;

    v_roster_count := jsonb_array_length(p_roster);
    IF v_roster_count < 1 OR v_roster_count > 4 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_ROSTER_SIZE_INVALID';
    END IF;

    SELECT count(*), count(DISTINCT nullif(item->>'user_id', '')::uuid)
      INTO v_linked_count, v_distinct_linked_count
      FROM jsonb_array_elements(p_roster) item
     WHERE nullif(item->>'user_id', '') IS NOT NULL;
    IF v_linked_count <> v_distinct_linked_count THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_DUPLICATE_LINKED_USER';
    END IF;

    IF (SELECT count(*) FROM jsonb_array_elements(p_roster) item
        WHERE nullif(item->>'user_id', '')::uuid = p_captain_user_id) <> 1
       OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_captain_user_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_CAPTAIN_MUST_BE_LINKED_ROSTER_USER';
    END IF;

    SELECT count(*) INTO v_active_team_count
      FROM public.league_teams
     WHERE season_id = p_season_id AND is_active;

    IF v_is_create THEN
        IF v_active_team_count >= v_max_teams THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_MAX_ACTIVE_TEAMS';
        END IF;
    ELSE
        SELECT jsonb_build_object(
            'name', t.name, 'slug', t.slug, 'captain_player_id', t.captain_player_id,
            'is_active', t.is_active,
            'roster', coalesce((
                SELECT jsonb_agg(jsonb_build_object(
                    'id', p.id, 'display_name', p.display_name,
                    'user_id', p.user_id, 'is_active', p.is_active
                ) ORDER BY p.created_at, p.id)
                FROM public.league_team_players p WHERE p.team_id = t.id
            ), '[]'::jsonb)
        ) INTO v_before
        FROM public.league_teams t
        WHERE t.id = v_team_id AND t.season_id = p_season_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_TEAM_NOT_FOUND';
        END IF;
    END IF;

    -- Resolve the future captain player before inserting/updating the team.
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_roster)
    LOOP
        v_user_id := nullif(v_item->>'user_id', '')::uuid;
        IF v_user_id = p_captain_user_id THEN
            v_captain_player_id := nullif(v_item->>'player_id', '')::uuid;
            IF v_captain_player_id IS NULL AND NOT v_is_create THEN
                SELECT id INTO v_captain_player_id
                  FROM public.league_team_players
                 WHERE team_id = v_team_id AND user_id = v_user_id
                 LIMIT 1;
            END IF;
            v_captain_player_id := coalesce(v_captain_player_id, gen_random_uuid());
        END IF;
    END LOOP;

    IF v_is_create THEN
        INSERT INTO public.league_teams (
            id, season_id, name, slug, captain_player_id, is_active
        ) VALUES (
            v_team_id, p_season_id, btrim(p_name), lower(btrim(p_slug)),
            v_captain_player_id, true
        );
    ELSE
        UPDATE public.league_team_players
           SET is_active = false, left_at = coalesce(left_at, now()), updated_at = now()
         WHERE team_id = v_team_id AND is_active;

        UPDATE public.league_teams
           SET name = btrim(p_name), slug = lower(btrim(p_slug)),
               captain_player_id = v_captain_player_id, updated_at = now()
         WHERE id = v_team_id;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_roster)
    LOOP
        v_display_name := btrim(coalesce(v_item->>'display_name', ''));
        v_user_id := nullif(v_item->>'user_id', '')::uuid;
        IF v_display_name = '' THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_PLAYER_NAME_REQUIRED';
        END IF;
        IF v_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_PLAYER_USER_NOT_FOUND';
        END IF;

        v_player_id := nullif(v_item->>'player_id', '')::uuid;
        IF v_player_id IS NULL AND v_user_id IS NOT NULL AND NOT v_is_create THEN
            SELECT id INTO v_player_id
              FROM public.league_team_players
             WHERE team_id = v_team_id AND user_id = v_user_id
             LIMIT 1;
        END IF;
        IF v_user_id = p_captain_user_id THEN
            v_player_id := v_captain_player_id;
        ELSE
            v_player_id := coalesce(v_player_id, gen_random_uuid());
        END IF;

        SELECT id, user_id INTO v_existing
          FROM public.league_team_players
         WHERE id = v_player_id AND team_id = v_team_id;

        IF FOUND THEN
            IF v_existing.user_id IS NOT NULL AND v_existing.user_id IS DISTINCT FROM v_user_id THEN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_LINKED_USER_IMMUTABLE';
            END IF;
            UPDATE public.league_team_players
               SET display_name = v_display_name,
                   user_id = coalesce(v_existing.user_id, v_user_id),
                   is_active = true, left_at = NULL, updated_at = now()
             WHERE id = v_player_id;
        ELSE
            IF nullif(v_item->>'player_id', '') IS NOT NULL THEN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_PLAYER_NOT_IN_TEAM';
            END IF;
            INSERT INTO public.league_team_players (
                id, team_id, display_name, user_id, is_active
            ) VALUES (
                v_player_id, v_team_id, v_display_name, v_user_id, true
            );
        END IF;
    END LOOP;

    INSERT INTO public.league_audit_events (
        season_id, entity_type, entity_id, event_type, actor_type,
        actor_staff_id, before_data, after_data
    ) VALUES (
        p_season_id, 'team', v_team_id,
        CASE WHEN v_is_create THEN 'team_created' ELSE 'team_roster_replaced' END,
        'staff', p_actor_id, v_before,
        jsonb_build_object(
            'name', btrim(p_name), 'slug', lower(btrim(p_slug)),
            'captain_user_id', p_captain_user_id, 'roster', p_roster
        )
    );

    RETURN jsonb_build_object(
        'ok', true, 'data', jsonb_build_object(
            'team_id', v_team_id, 'created', v_is_create,
            'captain_player_id', v_captain_player_id
        )
    );
END;
$function$;

CREATE FUNCTION public.league_set_team_active(
    p_actor_id uuid,
    p_team_id uuid,
    p_is_active boolean,
    p_reason text
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    SET search_path TO pg_catalog, public
AS $function$
DECLARE
    v_team record;
    v_active_count integer;
    v_max_teams integer;
BEGIN
    PERFORM public.league_assert_admin(p_actor_id);
    SELECT t.*, s.max_teams INTO v_team
      FROM public.league_teams t
      JOIN public.league_seasons s ON s.id = t.season_id
      JOIN public.league_phases p ON p.season_id = s.id AND p.code = 'phase1'
     WHERE t.id = p_team_id AND s.status = 'draft' AND p.status = 'draft'
     FOR UPDATE OF t, s, p;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_TEAM_NOT_EDITABLE';
    END IF;

    IF p_is_active AND NOT v_team.is_active THEN
        SELECT count(*) INTO v_active_count
          FROM public.league_teams WHERE season_id = v_team.season_id AND is_active;
        IF v_active_count >= v_team.max_teams THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_MAX_ACTIVE_TEAMS';
        END IF;
    END IF;

    UPDATE public.league_teams SET is_active = p_is_active, updated_at = now()
     WHERE id = p_team_id;

    INSERT INTO public.league_audit_events (
        season_id, entity_type, entity_id, event_type, actor_type,
        actor_staff_id, before_data, after_data, reason
    ) VALUES (
        v_team.season_id, 'team', p_team_id, 'team_active_changed', 'staff',
        p_actor_id, jsonb_build_object('is_active', v_team.is_active),
        jsonb_build_object('is_active', p_is_active), nullif(btrim(coalesce(p_reason, '')), '')
    );

    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('team_id', p_team_id, 'is_active', p_is_active));
END;
$function$;

CREATE FUNCTION public.league_generate_phase1(
    p_actor_id uuid,
    p_phase_id uuid,
    p_ordered_team_ids uuid[],
    p_tie_break_team_ids uuid[],
    p_algorithm_version text,
    p_fingerprint text,
    p_fingerprint_payload text,
    p_rounds jsonb,
    p_quality_metrics jsonb
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_phase record;
    v_existing record;
    v_team_count integer;
    v_expected_rounds integer;
    v_expected_matches integer;
    v_round_json jsonb;
    v_match_json jsonb;
    v_round_id uuid;
    v_match_id uuid;
    v_round_number integer;
    v_match_count integer := 0;
    v_home_team_id uuid;
    v_away_team_id uuid;
    v_payload jsonb;
BEGIN
    PERFORM public.league_assert_admin(p_actor_id);

    SELECT p.*, s.status AS season_status INTO v_phase
      FROM public.league_phases p
      JOIN public.league_seasons s ON s.id = p.season_id
     WHERE p.id = p_phase_id AND p.code = 'phase1'
     FOR UPDATE OF p, s;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_PHASE1_NOT_FOUND';
    END IF;

    IF v_phase.status = 'generated' THEN
        SELECT fingerprint, completed_at INTO v_existing
          FROM public.league_generation_runs
         WHERE phase_id = p_phase_id AND generation_kind = 'phase_schedule';
        IF v_existing.fingerprint = p_fingerprint THEN
            RETURN jsonb_build_object(
                'ok', true, 'created', false, 'replayed', true,
                'data', jsonb_build_object(
                    'phase_id', p_phase_id, 'fingerprint', v_existing.fingerprint,
                    'generated_at', v_existing.completed_at
                )
            );
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_GENERATION_CONFLICT';
    END IF;

    IF v_phase.status <> 'draft' OR v_phase.season_status <> 'draft' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_PHASE1_NOT_GENERATABLE';
    END IF;

    v_team_count := cardinality(p_ordered_team_ids);
    IF v_team_count < 2 OR v_team_count > 16
       OR cardinality(p_tie_break_team_ids) <> v_team_count
       OR (SELECT count(DISTINCT id) FROM unnest(p_ordered_team_ids) id) <> v_team_count
       OR (SELECT count(DISTINCT id) FROM unnest(p_tie_break_team_ids) id) <> v_team_count THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_GENERATION_TEAM_SET_INVALID';
    END IF;

    IF EXISTS (
        (SELECT id FROM public.league_teams WHERE season_id = v_phase.season_id AND is_active
         EXCEPT SELECT unnest(p_ordered_team_ids))
        UNION ALL
        (SELECT unnest(p_ordered_team_ids)
         EXCEPT SELECT id FROM public.league_teams WHERE season_id = v_phase.season_id AND is_active)
    ) OR EXISTS (
        (SELECT unnest(p_ordered_team_ids) EXCEPT SELECT unnest(p_tie_break_team_ids))
        UNION ALL
        (SELECT unnest(p_tie_break_team_ids) EXCEPT SELECT unnest(p_ordered_team_ids))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_GENERATION_TEAM_SET_MISMATCH';
    END IF;

    IF jsonb_typeof(p_rounds) <> 'array' OR jsonb_typeof(p_quality_metrics) <> 'object'
       OR jsonb_array_length(coalesce(p_quality_metrics->'invariantViolations', '[]'::jsonb)) <> 0
       OR btrim(coalesce(p_algorithm_version, '')) = ''
       OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_GENERATION_PAYLOAD_INVALID';
    END IF;

    IF encode(digest(convert_to(p_fingerprint_payload, 'UTF8'), 'sha256'), 'hex') <> p_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_GENERATION_FINGERPRINT_INVALID';
    END IF;
    v_payload := p_fingerprint_payload::jsonb;
    IF v_payload->>'phaseId' <> p_phase_id::text
       OR v_payload->>'algorithmVersion' <> p_algorithm_version
       OR v_payload->'orderedTeamIds' <> to_jsonb(p_ordered_team_ids)
       OR v_payload->'tieBreakOrder' <> to_jsonb(p_tie_break_team_ids)
       OR v_payload->'rounds' <> p_rounds THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_GENERATION_FINGERPRINT_PAYLOAD_MISMATCH';
    END IF;

    v_expected_rounds := CASE WHEN v_team_count % 2 = 0 THEN v_team_count - 1 ELSE v_team_count END;
    v_expected_matches := v_team_count * (v_team_count - 1) / 2;
    IF jsonb_array_length(p_rounds) <> v_expected_rounds THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_GENERATION_ROUND_COUNT_INVALID';
    END IF;

    IF EXISTS (SELECT 1 FROM public.league_phase_teams WHERE phase_id = p_phase_id)
       OR EXISTS (SELECT 1 FROM public.league_rounds WHERE phase_id = p_phase_id)
       OR EXISTS (SELECT 1 FROM public.league_generation_runs WHERE phase_id = p_phase_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_GENERATION_DIRTY_DRAFT';
    END IF;

    INSERT INTO public.league_phase_teams (
        phase_id, team_id, seed_position, tie_break_order
    )
    SELECT p_phase_id, p_ordered_team_ids[index], index,
           array_position(p_tie_break_team_ids, p_ordered_team_ids[index])
      FROM generate_subscripts(p_ordered_team_ids, 1) index;

    FOR v_round_json IN SELECT value FROM jsonb_array_elements(p_rounds)
    LOOP
        v_round_number := (v_round_json->>'roundNumber')::integer;
        IF v_round_number < 1 OR v_round_number > v_expected_rounds
           OR jsonb_typeof(v_round_json->'matches') <> 'array'
           OR jsonb_array_length(v_round_json->'matches') <> floor(v_team_count::numeric / 2)::integer THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_GENERATION_ROUND_INVALID';
        END IF;

        INSERT INTO public.league_rounds (phase_id, round_number, status)
        VALUES (p_phase_id, v_round_number, 'generated')
        RETURNING id INTO v_round_id;

        FOR v_match_json IN SELECT value FROM jsonb_array_elements(v_round_json->'matches')
        LOOP
            v_home_team_id := (v_match_json->>'homeTeamId')::uuid;
            v_away_team_id := (v_match_json->>'awayTeamId')::uuid;
            IF v_home_team_id = v_away_team_id
               OR NOT (v_home_team_id = ANY(p_ordered_team_ids))
               OR NOT (v_away_team_id = ANY(p_ordered_team_ids)) THEN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_GENERATION_MATCH_INVALID';
            END IF;

            INSERT INTO public.league_matches (
                phase_id, round_id, home_team_id, away_team_id,
                venue_id, scheduled_at, match_status
            ) VALUES (
                p_phase_id, v_round_id, v_home_team_id, v_away_team_id,
                NULL, NULL, 'unscheduled'
            ) RETURNING id INTO v_match_id;

            INSERT INTO public.league_match_team_slots (match_id, round_id, team_id, side)
            VALUES
                (v_match_id, v_round_id, v_home_team_id, 'home'),
                (v_match_id, v_round_id, v_away_team_id, 'away');
            v_match_count := v_match_count + 1;
        END LOOP;
    END LOOP;

    IF v_match_count <> v_expected_matches THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_GENERATION_MATCH_COUNT_INVALID';
    END IF;

    INSERT INTO public.league_generation_runs (
        phase_id, generation_kind, input_team_order, algorithm_version,
        fingerprint, quality_metrics, generated_by_staff_id, completed_at
    ) VALUES (
        p_phase_id, 'phase_schedule', to_jsonb(p_ordered_team_ids), p_algorithm_version,
        p_fingerprint, p_quality_metrics, p_actor_id, now()
    );

    UPDATE public.league_phases
       SET status = 'generated', algorithm_version = p_algorithm_version,
           generation_fingerprint = p_fingerprint, generated_at = now(), updated_at = now()
     WHERE id = p_phase_id;
    UPDATE public.league_seasons SET status = 'phase1', updated_at = now()
     WHERE id = v_phase.season_id;

    INSERT INTO public.league_audit_events (
        season_id, entity_type, entity_id, event_type, actor_type,
        actor_staff_id, after_data, metadata
    ) VALUES (
        v_phase.season_id, 'phase', p_phase_id, 'phase1_generated', 'staff',
        p_actor_id,
        jsonb_build_object(
            'team_count', v_team_count, 'round_count', v_expected_rounds,
            'match_count', v_match_count, 'fingerprint', p_fingerprint
        ),
        jsonb_build_object('algorithm_version', p_algorithm_version, 'quality', p_quality_metrics)
    );

    RETURN jsonb_build_object(
        'ok', true, 'created', true, 'replayed', false,
        'data', jsonb_build_object(
            'phase_id', p_phase_id, 'team_count', v_team_count,
            'round_count', v_expected_rounds, 'match_count', v_match_count,
            'fingerprint', p_fingerprint
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.league_assert_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.league_create_season(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.league_save_team(uuid, uuid, uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.league_set_team_active(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.league_generate_phase1(uuid, uuid, uuid[], uuid[], text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.league_assert_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_create_season(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_save_team(uuid, uuid, uuid, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_set_team_active(uuid, uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_generate_phase1(uuid, uuid, uuid[], uuid[], text, text, text, jsonb, jsonb) TO service_role;
