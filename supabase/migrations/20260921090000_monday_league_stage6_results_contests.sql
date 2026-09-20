-- Monday League Stage 6: captain results, contests and immutable admin resolution.

CREATE TABLE public.league_result_contests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id uuid NOT NULL REFERENCES public.league_matches(id) ON DELETE CASCADE,
    result_submission_id uuid NOT NULL REFERENCES public.league_result_submissions(id) ON DELETE RESTRICT,
    opened_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    reason text NOT NULL CHECK (btrim(reason) <> '' AND char_length(btrim(reason)) <= 1000),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved_rejected', 'resolved_corrected')),
    opened_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    resolved_by_staff_id uuid REFERENCES public.staff_users(id) ON DELETE RESTRICT,
    resolution_note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT league_result_contests_resolution_check CHECK (
      (status = 'open' AND resolved_at IS NULL AND resolved_by_staff_id IS NULL AND resolution_note IS NULL)
      OR (status <> 'open' AND resolved_at IS NOT NULL AND resolved_by_staff_id IS NOT NULL
          AND btrim(coalesce(resolution_note, '')) <> '')
    )
);

CREATE UNIQUE INDEX league_result_contests_one_open_result_key
    ON public.league_result_contests(result_submission_id) WHERE status = 'open';
CREATE UNIQUE INDEX league_result_contests_one_open_match_key
    ON public.league_result_contests(match_id) WHERE status = 'open';
CREATE INDEX league_result_contests_match_history_idx
    ON public.league_result_contests(match_id, opened_at DESC);

ALTER TABLE public.league_result_contests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_result_contests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.league_result_contests TO service_role;

CREATE OR REPLACE FUNCTION public.league_effective_result_status(p_result_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT CASE
    WHEN r.status = 'superseded' THEN 'superseded'
    WHEN r.status = 'confirmed' THEN 'confirmed'
    WHEN r.status = 'contested' THEN 'contested'
    WHEN r.status = 'submitted'
      AND now() >= r.submitted_at + interval '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.league_result_contests c
        WHERE c.result_submission_id=r.id AND c.status='open'
      ) THEN 'confirmed'
    ELSE r.status
  END
  FROM public.league_result_submissions r WHERE r.id=p_result_id;
$$;

CREATE OR REPLACE FUNCTION public.league_get_result_states(p_result_ids uuid[])
RETURNS TABLE(
  result_id uuid, effective_status text, submitted_at timestamptz,
  contest_deadline timestamptz, contest_open boolean, persisted_status text
) LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT r.id, public.league_effective_result_status(r.id), r.submitted_at,
    r.submitted_at + interval '48 hours',
    r.status='submitted' AND now() < r.submitted_at + interval '48 hours'
      AND NOT EXISTS (SELECT 1 FROM public.league_result_contests c WHERE c.result_submission_id=r.id AND c.status='open'),
    r.status
  FROM public.league_result_submissions r WHERE r.id=ANY(p_result_ids);
$$;

CREATE OR REPLACE FUNCTION public.league_captain_submit_result(
  p_actor_user_id uuid, p_match_id uuid, p_sets jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_match record; v_totals jsonb; v_result_id uuid:=gen_random_uuid(); v_set jsonb; v_number integer:=0;
BEGIN
  SELECT m.*,ph.season_id,ph.status AS phase_status,s.status AS season_status
    INTO v_match FROM public.league_matches m
    JOIN public.league_phases ph ON ph.id=m.phase_id
    JOIN public.league_seasons s ON s.id=ph.season_id
    WHERE m.id=p_match_id FOR UPDATE OF m,ph,s;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_MATCH_NOT_FOUND'; END IF;
  IF p_actor_user_id IS NULL OR NOT public.league_is_captain(p_actor_user_id,v_match.home_team_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_HOME_CAPTAIN_REQUIRED';
  END IF;
  IF v_match.season_status NOT IN ('phase1','phase2') OR v_match.phase_status NOT IN ('generated','in_progress') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_SEASON_INACTIVE';
  END IF;
  IF v_match.match_status <> 'scheduled' OR v_match.scheduled_at IS NULL OR now() < v_match.scheduled_at THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_SUBMISSION_NOT_OPEN';
  END IF;
  IF v_match.current_result_id IS NOT NULL OR v_match.current_special_outcome_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_ALREADY_EXISTS';
  END IF;
  v_totals:=public.league_validate_match_sets(p_sets);
  INSERT INTO public.league_result_submissions(
    id,match_id,revision,status,submitter_type,submitted_by_user_id,
    home_sets_won,away_sets_won,home_games_won,away_games_won
  ) VALUES (
    v_result_id,p_match_id,1,'submitted','captain',p_actor_user_id,
    (v_totals->>'homeSetsWon')::integer,(v_totals->>'awaySetsWon')::integer,
    (v_totals->>'homeGamesWon')::integer,(v_totals->>'awayGamesWon')::integer
  );
  FOR v_set IN SELECT value FROM jsonb_array_elements(p_sets) LOOP
    v_number:=v_number+1;
    INSERT INTO public.league_match_sets(result_submission_id,set_number,home_games,away_games)
    VALUES(v_result_id,v_number,(v_set->>'homeGames')::integer,(v_set->>'awayGames')::integer);
  END LOOP;
  UPDATE public.league_matches SET current_result_id=v_result_id,match_status='submitted',updated_at=now()
    WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(
    season_id,entity_type,entity_id,event_type,actor_type,actor_user_id,after_data
  ) VALUES (
    v_match.season_id,'match',p_match_id,'captain_result_submitted','user',p_actor_user_id,
    jsonb_build_object('result_id',v_result_id,'revision',1,'status','submitted')
  );
  RETURN jsonb_build_object('ok',true,'result_id',v_result_id,'revision',1,'status','submitted',
    'contest_deadline',(SELECT submitted_at+interval '48 hours' FROM public.league_result_submissions WHERE id=v_result_id));
END; $$;

CREATE OR REPLACE FUNCTION public.league_away_captain_contest_result(
  p_actor_user_id uuid, p_match_id uuid, p_expected_result_id uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_match record; v_result record; v_contest_id uuid:=gen_random_uuid(); v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
  SELECT m.*,ph.season_id INTO v_match FROM public.league_matches m
    JOIN public.league_phases ph ON ph.id=m.phase_id WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.current_result_id IS DISTINCT FROM p_expected_result_id THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  IF p_actor_user_id IS NULL OR NOT public.league_is_captain(p_actor_user_id,v_match.away_team_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_AWAY_CAPTAIN_REQUIRED'; END IF;
  IF v_reason='' OR char_length(v_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_CONTEST_REASON_INVALID'; END IF;
  SELECT * INTO v_result FROM public.league_result_submissions WHERE id=p_expected_result_id FOR UPDATE;
  IF NOT FOUND OR v_result.status<>'submitted' OR v_result.submitter_type<>'captain' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_CONTEST_NOT_OPEN'; END IF;
  IF now() >= v_result.submitted_at + interval '48 hours' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_CONTEST_DEADLINE_EXPIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_result_contests WHERE result_submission_id=v_result.id AND status='open') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_CONTEST_ALREADY_OPEN'; END IF;
  INSERT INTO public.league_result_contests(id,match_id,result_submission_id,opened_by_user_id,reason)
    VALUES(v_contest_id,p_match_id,v_result.id,p_actor_user_id,v_reason);
  UPDATE public.league_result_submissions SET status='contested' WHERE id=v_result.id;
  UPDATE public.league_matches SET match_status='contested',updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(
    season_id,entity_type,entity_id,event_type,actor_type,actor_user_id,after_data,reason
  ) VALUES(v_match.season_id,'contest',v_contest_id,'result_contested','user',p_actor_user_id,
    jsonb_build_object('match_id',p_match_id,'result_id',v_result.id),v_reason);
  RETURN jsonb_build_object('ok',true,'contest_id',v_contest_id,'result_id',v_result.id,'status','contested');
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_CONTEST_ALREADY_OPEN';
END; $$;

CREATE OR REPLACE FUNCTION public.league_finalize_expired_result(p_result_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_result record; v_match record;
BEGIN
  SELECT * INTO v_result FROM public.league_result_submissions WHERE id=p_result_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_NOT_FOUND'; END IF;
  SELECT m.*,ph.season_id INTO v_match FROM public.league_matches m
    JOIN public.league_phases ph ON ph.id=m.phase_id WHERE m.id=v_result.match_id FOR UPDATE OF m;
  IF v_match.current_result_id IS DISTINCT FROM p_result_id OR v_result.status<>'submitted'
     OR now()<v_result.submitted_at+interval '48 hours'
     OR EXISTS(SELECT 1 FROM public.league_result_contests WHERE result_submission_id=p_result_id AND status='open') THEN
    RETURN jsonb_build_object('ok',true,'finalized',false,'effective_status',public.league_effective_result_status(p_result_id));
  END IF;
  UPDATE public.league_result_submissions SET status='confirmed',confirmed_at=now() WHERE id=p_result_id;
  UPDATE public.league_matches SET match_status='confirmed',updated_at=now() WHERE id=v_match.id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,after_data)
    VALUES(v_match.season_id,'match',v_match.id,'result_auto_finalized','system',jsonb_build_object('result_id',p_result_id));
  RETURN jsonb_build_object('ok',true,'finalized',true,'effective_status','confirmed');
END; $$;

CREATE OR REPLACE FUNCTION public.league_admin_resolve_contest(
  p_actor_id uuid, p_match_id uuid, p_expected_result_id uuid, p_expected_contest_id uuid,
  p_resolution text, p_sets jsonb, p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_match record; v_old record; v_contest record; v_result uuid; v_revision integer; v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  IF p_resolution NOT IN ('reject','correct') OR v_reason='' OR char_length(v_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_CONTEST_RESOLUTION_INVALID'; END IF;
  SELECT m.*,ph.season_id INTO v_match FROM public.league_matches m JOIN public.league_phases ph ON ph.id=m.phase_id
    WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.current_result_id IS DISTINCT FROM p_expected_result_id THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  SELECT * INTO v_old FROM public.league_result_submissions WHERE id=p_expected_result_id FOR UPDATE;
  SELECT * INTO v_contest FROM public.league_result_contests
    WHERE id=p_expected_contest_id AND match_id=p_match_id AND result_submission_id=p_expected_result_id FOR UPDATE;
  IF NOT FOUND OR v_contest.status<>'open' OR v_old.status<>'contested' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_CONTEST_VERSION_CONFLICT'; END IF;
  IF p_resolution='reject' THEN
    UPDATE public.league_result_submissions SET status='confirmed',confirmed_at=now() WHERE id=v_old.id;
    UPDATE public.league_matches SET match_status='confirmed',updated_at=now() WHERE id=p_match_id;
    UPDATE public.league_result_contests SET status='resolved_rejected',resolved_at=now(),
      resolved_by_staff_id=p_actor_id,resolution_note=v_reason WHERE id=v_contest.id;
    INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,after_data,reason)
      VALUES(v_match.season_id,'contest',v_contest.id,'contest_rejected','staff',p_actor_id,
        jsonb_build_object('result_id',v_old.id,'status','confirmed'),v_reason);
    RETURN jsonb_build_object('ok',true,'result_id',v_old.id,'revision',v_old.revision,'status','confirmed','resolution','rejected');
  END IF;
  v_revision:=v_old.revision+1;
  UPDATE public.league_result_submissions SET status='superseded',confirmed_at=NULL WHERE id=v_old.id;
  v_result:=public.league_insert_result_revision(p_actor_id,p_match_id,v_revision,p_sets,v_reason);
  UPDATE public.league_result_submissions SET status='confirmed',confirmed_at=now() WHERE id=v_result;
  UPDATE public.league_matches SET current_result_id=v_result,match_status='confirmed',updated_at=now() WHERE id=p_match_id;
  UPDATE public.league_result_contests SET status='resolved_corrected',resolved_at=now(),
    resolved_by_staff_id=p_actor_id,resolution_note=v_reason WHERE id=v_contest.id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data,after_data,reason)
    VALUES(v_match.season_id,'contest',v_contest.id,'contest_corrected','staff',p_actor_id,
      jsonb_build_object('result_id',v_old.id,'revision',v_old.revision),
      jsonb_build_object('result_id',v_result,'revision',v_revision,'status','confirmed'),v_reason);
  RETURN jsonb_build_object('ok',true,'result_id',v_result,'revision',v_revision,'status','confirmed','resolution','corrected');
END; $$;

CREATE OR REPLACE FUNCTION public.league_admin_correct_result(
  p_actor_id uuid,p_match_id uuid,p_expected_result_id uuid,p_expected_status text,p_sets jsonb,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_match record; v_old record; v_result uuid; v_revision integer; v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT m.*,p.season_id INTO v_match FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id
    WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.current_result_id IS DISTINCT FROM p_expected_result_id THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  IF v_reason='' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_CORRECTION_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.league_result_submissions WHERE id=p_expected_result_id FOR UPDATE;
  IF NOT FOUND OR v_old.status='superseded' OR v_old.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  v_revision:=v_old.revision+1;
  UPDATE public.league_result_submissions SET status='superseded',confirmed_at=NULL WHERE id=v_old.id;
  v_result:=public.league_insert_result_revision(p_actor_id,p_match_id,v_revision,p_sets,v_reason);
  UPDATE public.league_result_submissions SET status='confirmed',confirmed_at=now() WHERE id=v_result;
  UPDATE public.league_result_contests SET status='resolved_corrected',resolved_at=now(),resolved_by_staff_id=p_actor_id,
    resolution_note=v_reason WHERE result_submission_id=v_old.id AND status='open';
  UPDATE public.league_matches SET current_result_id=v_result,match_status='confirmed',updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data,after_data,reason)
  VALUES(v_match.season_id,'match',p_match_id,'result_corrected','staff',p_actor_id,
    jsonb_build_object('result_id',v_old.id,'revision',v_old.revision),
    jsonb_build_object('result_id',v_result,'revision',v_revision,'status','confirmed'),v_reason);
  RETURN jsonb_build_object('ok',true,'result_id',v_result,'revision',v_revision,'status','confirmed');
END; $$;

-- Stage 3's explicit confirm command remains valid and becomes idempotent for
-- Stage 6 corrections, which are final immediately.
CREATE OR REPLACE FUNCTION public.league_admin_confirm_result(
  p_actor_id uuid,p_match_id uuid,p_expected_result_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_match record; v_status text;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT m.*,p.season_id INTO v_match FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id
    WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.current_result_id IS DISTINCT FROM p_expected_result_id THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  SELECT status INTO v_status FROM public.league_result_submissions WHERE id=p_expected_result_id FOR UPDATE;
  IF v_status='confirmed' THEN
    INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,after_data)
      VALUES(v_match.season_id,'match',p_match_id,'result_confirmed','staff',p_actor_id,
        jsonb_build_object('result_id',p_expected_result_id,'replayed',true));
    RETURN jsonb_build_object('ok',true,'result_id',p_expected_result_id,'status','confirmed','replayed',true);
  END IF;
  IF v_status NOT IN ('submitted','contested') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  UPDATE public.league_result_submissions SET status='confirmed',confirmed_at=now() WHERE id=p_expected_result_id;
  UPDATE public.league_result_contests SET status='resolved_rejected',resolved_at=now(),resolved_by_staff_id=p_actor_id,
    resolution_note='Conferma amministrativa del risultato' WHERE result_submission_id=p_expected_result_id AND status='open';
  UPDATE public.league_matches SET match_status='confirmed',updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,after_data)
    VALUES(v_match.season_id,'match',p_match_id,'result_confirmed','staff',p_actor_id,jsonb_build_object('result_id',p_expected_result_id));
  RETURN jsonb_build_object('ok',true,'result_id',p_expected_result_id,'status','confirmed','replayed',false);
END; $$;

CREATE OR REPLACE FUNCTION public.league_get_captain_result_context(p_user_id uuid,p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE v_match record; v_result record; v_effective text; v_deadline timestamptz; v_is_home boolean; v_is_away boolean; v_sets jsonb;
BEGIN
  IF p_user_id IS NULL OR NOT public.league_is_captain(p_user_id,p_team_id) THEN RETURN NULL; END IF;
  SELECT m.*,ph.season_id,ph.status phase_status,s.status season_status,r.submitted_at,r.status result_status
    INTO v_match FROM public.league_matches m
    JOIN public.league_phases ph ON ph.id=m.phase_id JOIN public.league_seasons s ON s.id=ph.season_id
    LEFT JOIN public.league_result_submissions r ON r.id=m.current_result_id
    WHERE p_team_id IN(m.home_team_id,m.away_team_id) AND (
      m.current_result_id IS NOT NULL OR
      (m.home_team_id=p_team_id AND m.match_status='scheduled' AND m.current_special_outcome_id IS NULL
       AND m.scheduled_at IS NOT NULL AND now()>=m.scheduled_at)
    )
    ORDER BY CASE
      WHEN m.away_team_id=p_team_id AND r.status='submitted' AND now()<r.submitted_at+interval '48 hours' THEN 0
      WHEN m.home_team_id=p_team_id AND m.current_result_id IS NULL AND m.match_status='scheduled' THEN 1
      WHEN r.status IN('submitted','contested') THEN 2 ELSE 3 END,
      coalesce(r.submitted_at,m.scheduled_at) DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('match_id',NULL,'can_submit_result',false,'can_contest_result',false); END IF;
  v_is_home:=p_team_id=v_match.home_team_id; v_is_away:=p_team_id=v_match.away_team_id;
  IF v_match.current_result_id IS NULL THEN
    RETURN jsonb_build_object(
      'match_id',v_match.id,'result_id',NULL,
      'is_home_captain',v_is_home,'is_away_captain',v_is_away,
      'can_submit_result',v_is_home AND v_match.current_special_outcome_id IS NULL
        AND v_match.match_status='scheduled' AND v_match.scheduled_at IS NOT NULL AND now()>=v_match.scheduled_at
        AND v_match.season_status IN('phase1','phase2') AND v_match.phase_status IN('generated','in_progress'),
      'can_contest_result',false,'contest_deadline',NULL,'contest_open',false,
      'result_locked_for_captain',false,'effective_status',NULL,'persisted_status',NULL,
      'submitted_at',NULL,'summary',NULL,'sets','[]'::jsonb,'contest_submitted',false
    );
  END IF;
  IF v_match.current_result_id IS NOT NULL THEN
    SELECT * INTO v_result FROM public.league_result_submissions WHERE id=v_match.current_result_id;
    v_effective:=public.league_effective_result_status(v_result.id);
    v_deadline:=v_result.submitted_at+interval '48 hours';
    SELECT coalesce(jsonb_agg(jsonb_build_object('number',set_number,'homeGames',home_games,'awayGames',away_games) ORDER BY set_number),'[]')
      INTO v_sets FROM public.league_match_sets WHERE result_submission_id=v_result.id;
  END IF;
  RETURN jsonb_build_object(
    'match_id',v_match.id,'result_id',v_match.current_result_id,
    'is_home_captain',v_is_home,'is_away_captain',v_is_away,
    'can_submit_result',v_is_home AND v_match.current_result_id IS NULL AND v_match.current_special_outcome_id IS NULL
      AND v_match.match_status='scheduled' AND v_match.scheduled_at IS NOT NULL AND now()>=v_match.scheduled_at
      AND v_match.season_status IN('phase1','phase2') AND v_match.phase_status IN('generated','in_progress'),
    'can_contest_result',v_is_away AND v_match.current_result_id IS NOT NULL AND v_result.status='submitted' AND v_result.submitter_type='captain'
      AND now()<v_deadline AND NOT EXISTS(SELECT 1 FROM public.league_result_contests c WHERE c.result_submission_id=v_result.id AND c.status='open'),
    'contest_deadline',v_deadline,
    'contest_open',v_match.current_result_id IS NOT NULL AND v_result.status='submitted' AND v_result.submitter_type='captain' AND now()<v_deadline,
    'result_locked_for_captain',v_match.current_result_id IS NOT NULL,
    'effective_status',v_effective,'persisted_status',v_result.status,'submitted_at',v_result.submitted_at,
    'summary',CASE WHEN v_result.id IS NULL THEN NULL ELSE v_result.home_sets_won::text||'–'||v_result.away_sets_won::text END,
    'sets',coalesce(v_sets,'[]'::jsonb),
    'contest_submitted',EXISTS(SELECT 1 FROM public.league_result_contests c WHERE c.result_submission_id=v_result.id AND c.opened_by_user_id=p_user_id)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.league_get_standings(p_phase_id uuid) RETURNS jsonb
  LANGUAGE sql STABLE SET search_path TO pg_catalog, public AS $$
WITH standard AS (
  SELECT m.home_team_id,m.away_team_id,1 AS played,
    (r.home_sets_won=2)::int AS home_win,(r.away_sets_won=2)::int AS away_win,
    CASE WHEN r.home_sets_won=2 AND r.away_sets_won=0 THEN 3 WHEN r.home_sets_won=2 THEN 2 WHEN r.away_sets_won=2 AND r.home_sets_won=1 THEN 1 ELSE 0 END AS home_points,
    CASE WHEN r.away_sets_won=2 AND r.home_sets_won=0 THEN 3 WHEN r.away_sets_won=2 THEN 2 WHEN r.home_sets_won=2 AND r.away_sets_won=1 THEN 1 ELSE 0 END AS away_points,
    r.home_sets_won AS home_sets,r.away_sets_won AS away_sets,r.home_games_won AS home_games,r.away_games_won AS away_games,
    public.league_effective_result_status(r.id) IN ('submitted','contested') AS provisional
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
    UNION ALL SELECT c.played,c.away_win,c.away_points,c.away_sets,c.home_sets,c.away_games,c.home_games FROM contributions c WHERE c.away_team_id=pt.team_id
  ) x ON true WHERE pt.phase_id=p_phase_id GROUP BY pt.team_id,t.name,pt.tie_break_order
), ranked AS (
 SELECT *,sets_won-sets_lost AS set_difference,games_won-games_lost AS game_difference,
 row_number() OVER(ORDER BY points DESC,sets_won-sets_lost DESC,games_won-games_lost DESC,tie_break_order ASC)::int AS position FROM team_rows
)
SELECT jsonb_build_object(
 'rows',coalesce(jsonb_agg(jsonb_build_object('position',position,'team_id',team_id,'team_name',name,'points',points,'played',played,'wins',wins,'losses',losses,'sets_won',sets_won,'sets_lost',sets_lost,'set_difference',set_difference,'games_won',games_won,'games_lost',games_lost,'game_difference',game_difference,'tie_break_order',tie_break_order) ORDER BY position),'[]'::jsonb),
 'has_provisional_results',EXISTS(SELECT 1 FROM standard WHERE provisional)
) FROM ranked;
$$;

CREATE OR REPLACE FUNCTION public.league_block_result_reschedule() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF (OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at OR OLD.venue_id IS DISTINCT FROM NEW.venue_id)
     AND (OLD.current_result_id IS NOT NULL OR OLD.current_special_outcome_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULTED_MATCH_RESCHEDULE_FORBIDDEN';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER league_matches_block_result_reschedule
  BEFORE UPDATE OF scheduled_at,venue_id ON public.league_matches
  FOR EACH ROW EXECUTE FUNCTION public.league_block_result_reschedule();

REVOKE ALL ON FUNCTION public.league_effective_result_status(uuid),
  public.league_get_result_states(uuid[]), public.league_captain_submit_result(uuid,uuid,jsonb),
  public.league_away_captain_contest_result(uuid,uuid,uuid,text), public.league_finalize_expired_result(uuid),
  public.league_admin_resolve_contest(uuid,uuid,uuid,uuid,text,jsonb,text),
  public.league_get_captain_result_context(uuid,uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.league_effective_result_status(uuid),
  public.league_get_result_states(uuid[]), public.league_captain_submit_result(uuid,uuid,jsonb),
  public.league_away_captain_contest_result(uuid,uuid,uuid,text), public.league_finalize_expired_result(uuid),
  public.league_admin_resolve_contest(uuid,uuid,uuid,uuid,text,jsonb,text),
  public.league_get_captain_result_context(uuid,uuid)
TO service_role;
