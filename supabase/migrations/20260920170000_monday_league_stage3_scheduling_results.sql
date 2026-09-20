-- Monday League Stage 3: scheduling, admin results, special outcomes and standings.

ALTER TABLE public.league_rounds
    ADD COLUMN schedule_version integer DEFAULT 1 NOT NULL,
    ADD CONSTRAINT league_rounds_schedule_version_check CHECK (schedule_version > 0);

CREATE TABLE public.league_result_submissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id uuid NOT NULL REFERENCES public.league_matches(id) ON DELETE CASCADE,
    revision integer NOT NULL CHECK (revision > 0),
    status text NOT NULL CHECK (status IN ('submitted', 'contested', 'confirmed', 'superseded')),
    submitter_type text NOT NULL DEFAULT 'staff' CHECK (submitter_type IN ('staff', 'captain')),
    submitted_by_staff_id uuid REFERENCES public.staff_users(id) ON DELETE RESTRICT,
    submitted_by_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
    correction_reason text,
    home_sets_won integer NOT NULL CHECK (home_sets_won BETWEEN 0 AND 2),
    away_sets_won integer NOT NULL CHECK (away_sets_won BETWEEN 0 AND 2),
    home_games_won integer NOT NULL CHECK (home_games_won >= 0),
    away_games_won integer NOT NULL CHECK (away_games_won >= 0),
    submitted_at timestamptz NOT NULL DEFAULT now(),
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT league_result_submissions_match_revision_key UNIQUE (match_id, revision),
    CONSTRAINT league_result_submissions_submitter_check CHECK (
      (submitter_type = 'staff' AND submitted_by_staff_id IS NOT NULL AND submitted_by_user_id IS NULL)
      OR (submitter_type = 'captain' AND submitted_by_staff_id IS NULL AND submitted_by_user_id IS NOT NULL)
    ),
    CONSTRAINT league_result_submissions_correction_check CHECK (revision = 1 OR btrim(coalesce(correction_reason, '')) <> ''),
    CONSTRAINT league_result_submissions_confirmed_check CHECK ((status = 'confirmed') = (confirmed_at IS NOT NULL))
);

CREATE INDEX league_result_submissions_match_idx
    ON public.league_result_submissions(match_id, revision DESC);

CREATE TABLE public.league_match_sets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    result_submission_id uuid NOT NULL REFERENCES public.league_result_submissions(id) ON DELETE CASCADE,
    set_number integer NOT NULL CHECK (set_number BETWEEN 1 AND 3),
    home_games integer NOT NULL CHECK (home_games BETWEEN 0 AND 7),
    away_games integer NOT NULL CHECK (away_games BETWEEN 0 AND 7),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT league_match_sets_result_number_key UNIQUE (result_submission_id, set_number)
);

CREATE TABLE public.league_match_special_outcomes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id uuid NOT NULL REFERENCES public.league_matches(id) ON DELETE CASCADE,
    revision integer NOT NULL CHECK (revision > 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
    outcome_type text NOT NULL CHECK (outcome_type IN ('walkover', 'no_show', 'administrative')),
    winner_team_id uuid REFERENCES public.league_teams(id) ON DELETE RESTRICT,
    counts_as_played boolean NOT NULL,
    home_points integer NOT NULL CHECK (home_points BETWEEN 0 AND 3),
    away_points integer NOT NULL CHECK (away_points BETWEEN 0 AND 3),
    home_win boolean NOT NULL,
    away_win boolean NOT NULL,
    home_sets_awarded integer NOT NULL CHECK (home_sets_awarded >= 0),
    away_sets_awarded integer NOT NULL CHECK (away_sets_awarded >= 0),
    home_games_awarded integer NOT NULL CHECK (home_games_awarded >= 0),
    away_games_awarded integer NOT NULL CHECK (away_games_awarded >= 0),
    decision_reason text NOT NULL CHECK (btrim(decision_reason) <> ''),
    decided_by_staff_id uuid NOT NULL REFERENCES public.staff_users(id) ON DELETE RESTRICT,
    decided_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT league_match_special_outcomes_match_revision_key UNIQUE (match_id, revision),
    CONSTRAINT league_match_special_outcomes_win_check CHECK (NOT (home_win AND away_win))
);

CREATE UNIQUE INDEX league_match_special_outcomes_active_key
    ON public.league_match_special_outcomes(match_id) WHERE status = 'active';

ALTER TABLE public.league_matches
    ADD COLUMN current_special_outcome_id uuid,
    ADD CONSTRAINT league_matches_current_result_fkey
      FOREIGN KEY (current_result_id) REFERENCES public.league_result_submissions(id) ON DELETE RESTRICT,
    ADD CONSTRAINT league_matches_current_special_outcome_fkey
      FOREIGN KEY (current_special_outcome_id) REFERENCES public.league_match_special_outcomes(id) ON DELETE RESTRICT,
    ADD CONSTRAINT league_matches_authoritative_outcome_check
      CHECK (current_result_id IS NULL OR current_special_outcome_id IS NULL);

CREATE FUNCTION public.league_validate_match_sets(p_sets jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO pg_catalog, public
AS $function$
DECLARE
    v_set jsonb;
    v_count integer;
    v_number integer := 0;
    v_home integer;
    v_away integer;
    v_home_sets integer := 0;
    v_away_sets integer := 0;
    v_home_games integer := 0;
    v_away_games integer := 0;
BEGIN
    IF jsonb_typeof(p_sets) <> 'array' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_RESULT_SETS_INVALID';
    END IF;
    v_count := jsonb_array_length(p_sets);
    IF v_count NOT IN (2, 3) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_RESULT_SET_COUNT_INVALID';
    END IF;
    FOR v_set IN SELECT value FROM jsonb_array_elements(p_sets)
    LOOP
        v_number := v_number + 1;
        v_home := (v_set->>'homeGames')::integer;
        v_away := (v_set->>'awayGames')::integer;
        IF NOT (
            (v_home = 6 AND v_away BETWEEN 0 AND 4)
            OR (v_away = 6 AND v_home BETWEEN 0 AND 4)
            OR (v_home = 7 AND v_away IN (5, 6))
            OR (v_away = 7 AND v_home IN (5, 6))
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_RESULT_SET_SCORE_INVALID';
        END IF;
        IF v_home > v_away THEN v_home_sets := v_home_sets + 1;
        ELSE v_away_sets := v_away_sets + 1;
        END IF;
        v_home_games := v_home_games + v_home;
        v_away_games := v_away_games + v_away;
    END LOOP;
    IF greatest(v_home_sets, v_away_sets) <> 2
       OR (v_count = 2 AND least(v_home_sets, v_away_sets) <> 0)
       OR (v_count = 3 AND least(v_home_sets, v_away_sets) <> 1) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_RESULT_MATCH_SCORE_INVALID';
    END IF;
    RETURN jsonb_build_object(
      'homeSetsWon', v_home_sets, 'awaySetsWon', v_away_sets,
      'homeGamesWon', v_home_games, 'awayGamesWon', v_away_games
    );
END;
$function$;

CREATE FUNCTION public.league_set_round_dates(
    p_actor_id uuid, p_phase_id uuid, p_dates jsonb
) RETURNS jsonb
    LANGUAGE plpgsql VOLATILE
    SET search_path TO pg_catalog, public
AS $function$
DECLARE
    v_phase record;
    v_item jsonb;
    v_round record;
    v_date date;
    v_count integer := 0;
BEGIN
    PERFORM public.league_assert_admin(p_actor_id);
    SELECT p.id, p.season_id, p.status INTO v_phase
      FROM public.league_phases p WHERE p.id = p_phase_id FOR UPDATE;
    IF NOT FOUND OR v_phase.status NOT IN ('generated', 'in_progress') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_SCHEDULE_PHASE_INVALID';
    END IF;
    IF jsonb_typeof(p_dates) <> 'array' OR jsonb_array_length(p_dates) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_ROUND_DATES_INVALID';
    END IF;
    IF (SELECT count(DISTINCT value->>'roundId') FROM jsonb_array_elements(p_dates)) <> jsonb_array_length(p_dates) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_ROUND_DATES_DUPLICATE';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_dates)
    LOOP
      SELECT * INTO v_round FROM public.league_rounds
       WHERE id = (v_item->>'roundId')::uuid AND phase_id = p_phase_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_ROUND_NOT_FOUND'; END IF;
      IF v_round.schedule_version <> (v_item->>'expectedScheduleVersion')::integer THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_SCHEDULE_VERSION_CONFLICT';
      END IF;
      v_date := nullif(v_item->>'playDate', '')::date;
      IF v_date IS NOT NULL AND extract(isodow FROM v_date) <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_ROUND_DATE_NOT_MONDAY';
      END IF;

      PERFORM 1 FROM public.league_matches WHERE round_id = v_round.id ORDER BY id FOR UPDATE;
      IF v_date IS NULL THEN
        UPDATE public.league_matches SET venue_id = NULL, scheduled_at = NULL,
          match_status = CASE WHEN match_status IN ('postponed','cancelled','suspended') THEN match_status ELSE 'unscheduled' END,
          schedule_version = schedule_version + 1
        WHERE round_id = v_round.id AND (venue_id IS NOT NULL OR scheduled_at IS NOT NULL);
      ELSIF v_round.play_date IS DISTINCT FROM v_date THEN
        IF EXISTS (
          SELECT 1 FROM public.league_matches m
          WHERE m.round_id = v_round.id AND m.venue_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.league_venue_slots s
              WHERE s.venue_id = m.venue_id AND s.is_active
                AND s.local_time = (m.scheduled_at AT TIME ZONE 'Europe/Rome')::time
            )
        ) THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_OFFICIAL_SLOT_INVALID'; END IF;
        UPDATE public.league_matches m SET
          scheduled_at = (v_date + s.local_time) AT TIME ZONE 'Europe/Rome',
          schedule_version = m.schedule_version + 1
        FROM public.league_venue_slots s
        WHERE m.round_id = v_round.id AND m.venue_id = s.venue_id AND s.is_active
          AND s.local_time = (m.scheduled_at AT TIME ZONE 'Europe/Rome')::time;
      END IF;

      UPDATE public.league_rounds r SET play_date = v_date,
        status = CASE
          WHEN v_date IS NULL THEN 'generated'
          WHEN NOT EXISTS (SELECT 1 FROM public.league_matches m WHERE m.round_id = r.id AND m.match_status <> 'scheduled') THEN 'scheduled'
          ELSE 'scheduling' END,
        schedule_version = schedule_version + 1, updated_at = now()
      WHERE id = v_round.id;

      INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data,after_data)
      VALUES(v_phase.season_id,'round',v_round.id,'round_date_changed','staff',p_actor_id,
        jsonb_build_object('play_date',v_round.play_date,'schedule_version',v_round.schedule_version),
        jsonb_build_object('play_date',v_date,'schedule_version',v_round.schedule_version + 1));
      v_count := v_count + 1;
    END LOOP;
    RETURN jsonb_build_object('ok',true,'updated_rounds',v_count);
END;
$function$;

CREATE FUNCTION public.league_schedule_round(
    p_actor_id uuid, p_round_id uuid, p_expected_schedule_version integer,
    p_play_date date, p_assignments jsonb
) RETURNS jsonb
    LANGUAGE plpgsql VOLATILE
    SET search_path TO pg_catalog, public
AS $function$
DECLARE
    v_round record;
    v_item jsonb;
    v_match record;
    v_slot record;
    v_assigned integer := 0;
    v_total integer;
    v_instant timestamptz;
    v_before jsonb;
BEGIN
    PERFORM public.league_assert_admin(p_actor_id);
    SELECT r.*, p.season_id, p.status AS phase_status INTO v_round
      FROM public.league_rounds r JOIN public.league_phases p ON p.id = r.phase_id
      WHERE r.id = p_round_id FOR UPDATE OF r, p;
    IF NOT FOUND OR v_round.phase_status NOT IN ('generated','in_progress') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_SCHEDULE_ROUND_INVALID';
    END IF;
    IF v_round.schedule_version <> p_expected_schedule_version THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_SCHEDULE_VERSION_CONFLICT';
    END IF;
    IF p_play_date IS NULL OR extract(isodow FROM p_play_date) <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_ROUND_DATE_NOT_MONDAY';
    END IF;
    IF jsonb_typeof(p_assignments) <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_SCHEDULE_ASSIGNMENTS_INVALID';
    END IF;
    PERFORM 1 FROM public.league_matches WHERE round_id = p_round_id ORDER BY id FOR UPDATE;
    SELECT count(*) INTO v_total FROM public.league_matches WHERE round_id = p_round_id;
    IF v_total > 8 OR jsonb_array_length(p_assignments) <> v_total
       OR (SELECT count(DISTINCT value->>'matchId') FROM jsonb_array_elements(p_assignments)) <> v_total
       OR EXISTS (
         (SELECT id::text FROM public.league_matches WHERE round_id = p_round_id
          EXCEPT SELECT value->>'matchId' FROM jsonb_array_elements(p_assignments))
       ) THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_SCHEDULE_ASSIGNMENTS_INVALID'; END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(p_assignments) WHERE nullif(value->>'venueSlotId','') IS NOT NULL)
       <> (SELECT count(DISTINCT value->>'venueSlotId') FROM jsonb_array_elements(p_assignments) WHERE nullif(value->>'venueSlotId','') IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_SCHEDULE_SLOT_DUPLICATE';
    END IF;
    SELECT jsonb_agg(jsonb_build_object('id',id,'venue_id',venue_id,'scheduled_at',scheduled_at,'schedule_version',schedule_version,'status',match_status) ORDER BY id)
      INTO v_before FROM public.league_matches WHERE round_id = p_round_id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_assignments)
    LOOP
      SELECT * INTO v_match FROM public.league_matches WHERE id = (v_item->>'matchId')::uuid AND round_id = p_round_id;
      IF v_match.match_status NOT IN ('unscheduled','scheduled','postponed') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ML_SCHEDULE_MATCH_STATE_INVALID';
      END IF;
      IF nullif(v_item->>'venueSlotId','') IS NULL THEN
        UPDATE public.league_matches SET venue_id=NULL, scheduled_at=NULL, match_status='unscheduled',
          schedule_version=schedule_version+1 WHERE id=v_match.id;
      ELSE
        SELECT s.id,s.venue_id,s.local_time INTO v_slot FROM public.league_venue_slots s
          JOIN public.league_venues v ON v.id=s.venue_id
          WHERE s.id=(v_item->>'venueSlotId')::uuid AND s.is_active AND v.is_active AND s.weekday=1;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_OFFICIAL_SLOT_INVALID'; END IF;
        v_instant := (p_play_date + v_slot.local_time) AT TIME ZONE 'Europe/Rome';
        UPDATE public.league_matches SET venue_id=v_slot.venue_id,scheduled_at=v_instant,
          match_status='scheduled',schedule_version=schedule_version+1 WHERE id=v_match.id;
        v_assigned := v_assigned+1;
      END IF;
    END LOOP;
    UPDATE public.league_rounds SET play_date=p_play_date,
      status=CASE WHEN v_assigned=v_total THEN 'scheduled' ELSE 'scheduling' END,
      schedule_version=schedule_version+1,updated_at=now() WHERE id=p_round_id;
    UPDATE public.league_phases SET status='in_progress',updated_at=now() WHERE id=v_round.phase_id AND status='generated';
    INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data,after_data)
    VALUES(v_round.season_id,'round',p_round_id,'round_schedule_saved','staff',p_actor_id,
      jsonb_build_object('play_date',v_round.play_date,'schedule_version',v_round.schedule_version,'matches',coalesce(v_before,'[]'::jsonb)),
      jsonb_build_object('play_date',p_play_date,'schedule_version',v_round.schedule_version+1,'assigned_matches',v_assigned,'total_matches',v_total));
    RETURN jsonb_build_object('ok',true,'round_id',p_round_id,'schedule_version',v_round.schedule_version+1,'scheduled_matches',v_assigned,'total_matches',v_total);
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SCHEDULE_SLOT_CONFLICT';
END;
$function$;

CREATE FUNCTION public.league_insert_result_revision(
    p_actor_id uuid, p_match_id uuid, p_revision integer, p_sets jsonb, p_reason text
) RETURNS uuid
    LANGUAGE plpgsql VOLATILE
    SET search_path TO pg_catalog, public
AS $function$
DECLARE v_totals jsonb; v_result_id uuid; v_set jsonb; v_number integer:=0;
BEGIN
    v_totals:=public.league_validate_match_sets(p_sets);
    INSERT INTO public.league_result_submissions(match_id,revision,status,submitter_type,submitted_by_staff_id,correction_reason,home_sets_won,away_sets_won,home_games_won,away_games_won)
    VALUES(p_match_id,p_revision,'submitted','staff',p_actor_id,nullif(btrim(coalesce(p_reason,'')),''),
      (v_totals->>'homeSetsWon')::integer,(v_totals->>'awaySetsWon')::integer,
      (v_totals->>'homeGamesWon')::integer,(v_totals->>'awayGamesWon')::integer)
    RETURNING id INTO v_result_id;
    FOR v_set IN SELECT value FROM jsonb_array_elements(p_sets) LOOP
      v_number:=v_number+1;
      INSERT INTO public.league_match_sets(result_submission_id,set_number,home_games,away_games)
      VALUES(v_result_id,v_number,(v_set->>'homeGames')::integer,(v_set->>'awayGames')::integer);
    END LOOP;
    RETURN v_result_id;
END;
$function$;

CREATE FUNCTION public.league_admin_submit_result(p_actor_id uuid,p_match_id uuid,p_sets jsonb) RETURNS jsonb
    LANGUAGE plpgsql VOLATILE SET search_path TO pg_catalog, public
AS $function$
DECLARE v_match record; v_result uuid; v_season uuid;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT m.*,p.season_id INTO v_match FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.match_status NOT IN ('scheduled','postponed') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_MATCH_STATE_INVALID'; END IF;
  IF v_match.current_result_id IS NOT NULL OR v_match.current_special_outcome_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_ALREADY_EXISTS'; END IF;
  v_result:=public.league_insert_result_revision(p_actor_id,p_match_id,1,p_sets,NULL);
  UPDATE public.league_matches SET current_result_id=v_result,current_special_outcome_id=NULL,match_status='submitted',updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,after_data)
  VALUES(v_match.season_id,'match',p_match_id,'result_submitted','staff',p_actor_id,jsonb_build_object('result_id',v_result,'revision',1));
  RETURN jsonb_build_object('ok',true,'result_id',v_result,'revision',1,'status','submitted');
END;
$function$;

CREATE FUNCTION public.league_admin_correct_result(p_actor_id uuid,p_match_id uuid,p_expected_result_id uuid,p_expected_status text,p_sets jsonb,p_reason text) RETURNS jsonb
    LANGUAGE plpgsql VOLATILE SET search_path TO pg_catalog, public
AS $function$
DECLARE v_match record; v_old record; v_result uuid; v_revision integer;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT m.*,p.season_id INTO v_match FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.current_result_id IS DISTINCT FROM p_expected_result_id THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  IF btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_CORRECTION_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.league_result_submissions WHERE id=p_expected_result_id FOR UPDATE;
  IF NOT FOUND OR v_old.status='superseded' OR v_old.status IS DISTINCT FROM p_expected_status THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  v_revision:=v_old.revision+1;
  UPDATE public.league_result_submissions SET status='superseded',confirmed_at=NULL WHERE id=v_old.id;
  v_result:=public.league_insert_result_revision(p_actor_id,p_match_id,v_revision,p_sets,p_reason);
  UPDATE public.league_matches SET current_result_id=v_result,match_status='submitted',updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data,after_data,reason)
  VALUES(v_match.season_id,'match',p_match_id,'result_corrected','staff',p_actor_id,
    jsonb_build_object('result_id',v_old.id,'revision',v_old.revision),jsonb_build_object('result_id',v_result,'revision',v_revision),p_reason);
  RETURN jsonb_build_object('ok',true,'result_id',v_result,'revision',v_revision,'status','submitted');
END;
$function$;

CREATE FUNCTION public.league_admin_confirm_result(p_actor_id uuid,p_match_id uuid,p_expected_result_id uuid) RETURNS jsonb
    LANGUAGE plpgsql VOLATILE SET search_path TO pg_catalog, public
AS $function$
DECLARE v_match record;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT m.*,p.season_id INTO v_match FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.current_result_id IS DISTINCT FROM p_expected_result_id THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  UPDATE public.league_result_submissions SET status='confirmed',confirmed_at=now() WHERE id=p_expected_result_id AND status IN ('submitted','contested');
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  UPDATE public.league_matches SET match_status='confirmed',updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,after_data)
  VALUES(v_match.season_id,'match',p_match_id,'result_confirmed','staff',p_actor_id,jsonb_build_object('result_id',p_expected_result_id));
  RETURN jsonb_build_object('ok',true,'result_id',p_expected_result_id,'status','confirmed');
END;
$function$;

CREATE FUNCTION public.league_set_match_special_outcome(
  p_actor_id uuid,p_match_id uuid,p_expected_result_id uuid,p_expected_special_outcome_id uuid,
  p_outcome_type text,p_winner_team_id uuid,p_counts_as_played boolean,
  p_home_points integer,p_away_points integer,p_home_win boolean,p_away_win boolean,
  p_home_sets integer,p_away_sets integer,p_home_games integer,p_away_games integer,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path TO pg_catalog, public
AS $function$
DECLARE v_match record; v_id uuid; v_revision integer;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT m.*,p.season_id INTO v_match FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.current_result_id IS DISTINCT FROM p_expected_result_id OR v_match.current_special_outcome_id IS DISTINCT FROM p_expected_special_outcome_id THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_OUTCOME_VERSION_CONFLICT';
  END IF;
  IF p_outcome_type NOT IN ('walkover','no_show','administrative') OR btrim(coalesce(p_reason,''))='' OR p_home_points NOT BETWEEN 0 AND 3 OR p_away_points NOT BETWEEN 0 AND 3
     OR least(p_home_sets,p_away_sets,p_home_games,p_away_games)<0 OR (p_home_win AND p_away_win)
     OR (p_winner_team_id IS NOT NULL AND p_winner_team_id NOT IN (v_match.home_team_id,v_match.away_team_id)) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SPECIAL_OUTCOME_INVALID';
  END IF;
  IF NOT p_counts_as_played AND (p_winner_team_id IS NOT NULL OR p_home_points+p_away_points+p_home_sets+p_away_sets+p_home_games+p_away_games<>0 OR p_home_win OR p_away_win) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SPECIAL_OUTCOME_INVALID';
  END IF;
  IF p_counts_as_played AND ((p_home_win::integer+p_away_win::integer)<>CASE WHEN p_winner_team_id IS NULL THEN 0 ELSE 1 END
     OR (p_winner_team_id=v_match.home_team_id AND NOT p_home_win) OR (p_winner_team_id=v_match.away_team_id AND NOT p_away_win)) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SPECIAL_OUTCOME_INVALID';
  END IF;
  IF p_outcome_type IN ('walkover','no_show') AND NOT (
    p_counts_as_played AND p_winner_team_id IS NOT NULL
    AND ((p_winner_team_id=v_match.home_team_id AND p_home_points=3 AND p_away_points=0 AND p_home_sets=2 AND p_away_sets=0 AND p_home_games=12 AND p_away_games=0)
      OR (p_winner_team_id=v_match.away_team_id AND p_home_points=0 AND p_away_points=3 AND p_home_sets=0 AND p_away_sets=2 AND p_home_games=0 AND p_away_games=12))
  ) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SPECIAL_OUTCOME_INVALID'; END IF;
  IF v_match.current_result_id IS NOT NULL THEN UPDATE public.league_result_submissions SET status='superseded',confirmed_at=NULL WHERE id=v_match.current_result_id; END IF;
  IF v_match.current_special_outcome_id IS NOT NULL THEN UPDATE public.league_match_special_outcomes SET status='superseded' WHERE id=v_match.current_special_outcome_id; END IF;
  SELECT coalesce(max(revision),0)+1 INTO v_revision FROM public.league_match_special_outcomes WHERE match_id=p_match_id;
  INSERT INTO public.league_match_special_outcomes(match_id,revision,outcome_type,winner_team_id,counts_as_played,home_points,away_points,home_win,away_win,home_sets_awarded,away_sets_awarded,home_games_awarded,away_games_awarded,decision_reason,decided_by_staff_id)
  VALUES(p_match_id,v_revision,p_outcome_type,p_winner_team_id,p_counts_as_played,p_home_points,p_away_points,p_home_win,p_away_win,p_home_sets,p_away_sets,p_home_games,p_away_games,p_reason,p_actor_id) RETURNING id INTO v_id;
  UPDATE public.league_matches SET current_result_id=NULL,current_special_outcome_id=v_id,match_status='confirmed',updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,after_data,reason)
  VALUES(v_match.season_id,'match',p_match_id,'special_outcome_set','staff',p_actor_id,jsonb_build_object('outcome_id',v_id,'type',p_outcome_type,'revision',v_revision),p_reason);
  RETURN jsonb_build_object('ok',true,'outcome_id',v_id,'revision',v_revision,'status','confirmed');
END;
$function$;

CREATE FUNCTION public.league_set_match_workflow_state(p_actor_id uuid,p_match_id uuid,p_expected_schedule_version integer,p_state text,p_reason text) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SET search_path TO pg_catalog, public
AS $function$
DECLARE v_match record;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT m.*,p.season_id INTO v_match FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.schedule_version<>p_expected_schedule_version THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SCHEDULE_VERSION_CONFLICT'; END IF;
  IF p_state NOT IN ('postponed','suspended','cancelled') OR btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_MATCH_WORKFLOW_INVALID'; END IF;
  IF v_match.current_result_id IS NOT NULL THEN UPDATE public.league_result_submissions SET status='superseded',confirmed_at=NULL WHERE id=v_match.current_result_id; END IF;
  IF v_match.current_special_outcome_id IS NOT NULL THEN UPDATE public.league_match_special_outcomes SET status='superseded' WHERE id=v_match.current_special_outcome_id; END IF;
  UPDATE public.league_matches SET match_status=p_state,current_result_id=NULL,current_special_outcome_id=NULL,
    venue_id=CASE WHEN p_state='postponed' THEN NULL ELSE venue_id END,
    scheduled_at=CASE WHEN p_state='postponed' THEN NULL ELSE scheduled_at END,
    schedule_version=schedule_version+1,updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data,after_data,reason)
  VALUES(v_match.season_id,'match',p_match_id,'match_workflow_changed','staff',p_actor_id,jsonb_build_object('status',v_match.match_status),jsonb_build_object('status',p_state),p_reason);
  RETURN jsonb_build_object('ok',true,'match_id',p_match_id,'status',p_state,'schedule_version',v_match.schedule_version+1);
END;
$function$;

CREATE FUNCTION public.league_get_standings(p_phase_id uuid) RETURNS jsonb
  LANGUAGE sql STABLE SET search_path TO pg_catalog, public
AS $function$
WITH standard AS (
  SELECT m.home_team_id,m.away_team_id,1 AS played,
    (r.home_sets_won=2)::int AS home_win,(r.away_sets_won=2)::int AS away_win,
    CASE WHEN r.home_sets_won=2 AND r.away_sets_won=0 THEN 3 WHEN r.home_sets_won=2 THEN 2 WHEN r.away_sets_won=2 AND r.home_sets_won=1 THEN 1 ELSE 0 END AS home_points,
    CASE WHEN r.away_sets_won=2 AND r.home_sets_won=0 THEN 3 WHEN r.away_sets_won=2 THEN 2 WHEN r.home_sets_won=2 AND r.away_sets_won=1 THEN 1 ELSE 0 END AS away_points,
    r.home_sets_won AS home_sets,r.away_sets_won AS away_sets,r.home_games_won AS home_games,r.away_games_won AS away_games,
    r.status IN ('submitted','contested') AS provisional
  FROM public.league_matches m JOIN public.league_result_submissions r ON r.id=m.current_result_id
  WHERE m.phase_id=p_phase_id AND r.status IN ('submitted','contested','confirmed')
), special AS (
  SELECT m.home_team_id,m.away_team_id,s.counts_as_played::int AS played,s.home_win::int AS home_win,s.away_win::int AS away_win,
    s.home_points,s.away_points,s.home_sets_awarded AS home_sets,s.away_sets_awarded AS away_sets,
    s.home_games_awarded AS home_games,s.away_games_awarded AS away_games,false AS provisional
  FROM public.league_matches m JOIN public.league_match_special_outcomes s ON s.id=m.current_special_outcome_id
  WHERE m.phase_id=p_phase_id AND s.status='active' AND s.counts_as_played
), contributions AS (SELECT * FROM standard UNION ALL SELECT * FROM special), team_rows AS (
  SELECT pt.team_id,t.name,pt.tie_break_order,
    coalesce(sum(x.played),0)::int AS played,coalesce(sum(x.wins),0)::int AS wins,
    coalesce(sum(x.played-x.wins),0)::int AS losses,coalesce(sum(x.points),0)::int AS points,
    coalesce(sum(x.sets_for),0)::int AS sets_won,coalesce(sum(x.sets_against),0)::int AS sets_lost,
    coalesce(sum(x.games_for),0)::int AS games_won,coalesce(sum(x.games_against),0)::int AS games_lost
  FROM public.league_phase_teams pt JOIN public.league_teams t ON t.id=pt.team_id
  LEFT JOIN LATERAL (
    SELECT c.played,c.home_win AS wins,c.home_points AS points,c.home_sets AS sets_for,c.away_sets AS sets_against,c.home_games AS games_for,c.away_games AS games_against FROM contributions c WHERE c.home_team_id=pt.team_id
    UNION ALL
    SELECT c.played,c.away_win,c.away_points,c.away_sets,c.home_sets,c.away_games,c.home_games FROM contributions c WHERE c.away_team_id=pt.team_id
  ) x ON true WHERE pt.phase_id=p_phase_id GROUP BY pt.team_id,t.name,pt.tie_break_order
), ranked AS (
 SELECT *,sets_won-sets_lost AS set_difference,games_won-games_lost AS game_difference,
 row_number() OVER(ORDER BY points DESC,sets_won-sets_lost DESC,games_won-games_lost DESC,tie_break_order ASC)::int AS position
 FROM team_rows
)
SELECT jsonb_build_object(
 'rows',coalesce(jsonb_agg(jsonb_build_object('position',position,'team_id',team_id,'team_name',name,'points',points,'played',played,'wins',wins,'losses',losses,'sets_won',sets_won,'sets_lost',sets_lost,'set_difference',set_difference,'games_won',games_won,'games_lost',games_lost,'game_difference',game_difference,'tie_break_order',tie_break_order) ORDER BY position),'[]'::jsonb),
 'has_provisional_results',EXISTS(SELECT 1 FROM standard WHERE provisional)
) FROM ranked;
$function$;

ALTER TABLE public.league_result_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_match_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_match_special_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_result_submissions,public.league_match_sets,public.league_match_special_outcomes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.league_result_submissions,public.league_match_sets,public.league_match_special_outcomes TO service_role;

REVOKE ALL ON FUNCTION public.league_validate_match_sets(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.league_set_round_dates(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.league_schedule_round(uuid,uuid,integer,date,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.league_insert_result_revision(uuid,uuid,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.league_admin_submit_result(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.league_admin_correct_result(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.league_admin_confirm_result(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.league_set_match_special_outcome(uuid,uuid,uuid,uuid,text,uuid,boolean,integer,integer,boolean,boolean,integer,integer,integer,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.league_set_match_workflow_state(uuid,uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.league_get_standings(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.league_validate_match_sets(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_set_round_dates(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_schedule_round(uuid,uuid,integer,date,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_admin_submit_result(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_admin_correct_result(uuid,uuid,uuid,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_admin_confirm_result(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_set_match_special_outcome(uuid,uuid,uuid,uuid,text,uuid,boolean,integer,integer,boolean,boolean,integer,integer,integer,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_set_match_workflow_state(uuid,uuid,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.league_get_standings(uuid) TO service_role;
