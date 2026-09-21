-- Monday League pre-release remediation: open-contest finality, canonical team
-- notification links, and trigger-function EXECUTE hardening.

CREATE OR REPLACE FUNCTION public.league_admin_correct_result(
  p_actor_id uuid,p_match_id uuid,p_expected_result_id uuid,p_expected_status text,
  p_sets jsonb,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_match record; v_old record; v_result uuid; v_revision integer;
  v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT m.*,p.season_id INTO v_match FROM public.league_matches m
    JOIN public.league_phases p ON p.id=m.phase_id
    WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.current_result_id IS DISTINCT FROM p_expected_result_id THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_result_contests c WHERE c.match_id=p_match_id AND c.status='open') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='OPEN_CONTEST_REQUIRES_RESOLUTION'; END IF;
  IF v_reason='' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_CORRECTION_REASON_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.league_result_submissions WHERE id=p_expected_result_id FOR UPDATE;
  IF NOT FOUND OR v_old.status='superseded' OR v_old.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  v_revision:=v_old.revision+1;
  UPDATE public.league_result_submissions SET status='superseded',confirmed_at=NULL WHERE id=v_old.id;
  v_result:=public.league_insert_result_revision(p_actor_id,p_match_id,v_revision,p_sets,v_reason);
  UPDATE public.league_result_submissions SET status='confirmed',confirmed_at=now() WHERE id=v_result;
  UPDATE public.league_matches SET current_result_id=v_result,match_status='confirmed',updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data,after_data,reason)
  VALUES(v_match.season_id,'match',p_match_id,'result_corrected','staff',p_actor_id,
    jsonb_build_object('result_id',v_old.id,'revision',v_old.revision),
    jsonb_build_object('result_id',v_result,'revision',v_revision,'status','confirmed'),v_reason);
  RETURN jsonb_build_object('ok',true,'result_id',v_result,'revision',v_revision,'status','confirmed');
END; $$;

CREATE OR REPLACE FUNCTION public.league_set_match_special_outcome(
  p_actor_id uuid,p_match_id uuid,p_expected_result_id uuid,p_expected_special_outcome_id uuid,
  p_outcome_type text,p_winner_team_id uuid,p_counts_as_played boolean,p_home_points integer,
  p_away_points integer,p_home_win boolean,p_away_win boolean,p_home_sets integer,p_away_sets integer,
  p_home_games integer,p_away_games integer,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_match record; v_id uuid; v_revision integer;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT m.*,p.season_id INTO v_match FROM public.league_matches m
    JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.current_result_id IS DISTINCT FROM p_expected_result_id
     OR v_match.current_special_outcome_id IS DISTINCT FROM p_expected_special_outcome_id THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_OUTCOME_VERSION_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_result_contests c WHERE c.match_id=p_match_id AND c.status='open') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='OPEN_CONTEST_REQUIRES_RESOLUTION'; END IF;
  IF p_outcome_type NOT IN ('walkover','no_show','administrative') OR btrim(coalesce(p_reason,''))=''
     OR p_home_points NOT BETWEEN 0 AND 3 OR p_away_points NOT BETWEEN 0 AND 3
     OR least(p_home_sets,p_away_sets,p_home_games,p_away_games)<0 OR (p_home_win AND p_away_win)
     OR (p_winner_team_id IS NOT NULL AND p_winner_team_id NOT IN (v_match.home_team_id,v_match.away_team_id)) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SPECIAL_OUTCOME_INVALID'; END IF;
  IF NOT p_counts_as_played AND (p_winner_team_id IS NOT NULL
     OR p_home_points+p_away_points+p_home_sets+p_away_sets+p_home_games+p_away_games<>0
     OR p_home_win OR p_away_win) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SPECIAL_OUTCOME_INVALID'; END IF;
  IF p_counts_as_played AND ((p_home_win::integer+p_away_win::integer)<>CASE WHEN p_winner_team_id IS NULL THEN 0 ELSE 1 END
     OR (p_winner_team_id=v_match.home_team_id AND NOT p_home_win)
     OR (p_winner_team_id=v_match.away_team_id AND NOT p_away_win)) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SPECIAL_OUTCOME_INVALID'; END IF;
  IF p_outcome_type IN ('walkover','no_show') AND NOT (
    p_counts_as_played AND p_winner_team_id IS NOT NULL
    AND ((p_winner_team_id=v_match.home_team_id AND p_home_points=3 AND p_away_points=0 AND p_home_sets=2 AND p_away_sets=0 AND p_home_games=12 AND p_away_games=0)
      OR (p_winner_team_id=v_match.away_team_id AND p_home_points=0 AND p_away_points=3 AND p_home_sets=0 AND p_away_sets=2 AND p_home_games=0 AND p_away_games=12))
  ) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SPECIAL_OUTCOME_INVALID'; END IF;
  IF v_match.current_result_id IS NOT NULL THEN
    UPDATE public.league_result_submissions SET status='superseded',confirmed_at=NULL WHERE id=v_match.current_result_id; END IF;
  IF v_match.current_special_outcome_id IS NOT NULL THEN
    UPDATE public.league_match_special_outcomes SET status='superseded' WHERE id=v_match.current_special_outcome_id; END IF;
  SELECT coalesce(max(revision),0)+1 INTO v_revision FROM public.league_match_special_outcomes WHERE match_id=p_match_id;
  INSERT INTO public.league_match_special_outcomes(match_id,revision,outcome_type,winner_team_id,counts_as_played,
    home_points,away_points,home_win,away_win,home_sets_awarded,away_sets_awarded,home_games_awarded,
    away_games_awarded,decision_reason,decided_by_staff_id)
  VALUES(p_match_id,v_revision,p_outcome_type,p_winner_team_id,p_counts_as_played,p_home_points,p_away_points,
    p_home_win,p_away_win,p_home_sets,p_away_sets,p_home_games,p_away_games,p_reason,p_actor_id) RETURNING id INTO v_id;
  UPDATE public.league_matches SET current_result_id=NULL,current_special_outcome_id=v_id,
    match_status='confirmed',updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,after_data,reason)
  VALUES(v_match.season_id,'match',p_match_id,'special_outcome_set','staff',p_actor_id,
    jsonb_build_object('outcome_id',v_id,'type',p_outcome_type,'revision',v_revision),p_reason);
  RETURN jsonb_build_object('ok',true,'outcome_id',v_id,'revision',v_revision,'status','confirmed');
END; $$;

CREATE OR REPLACE FUNCTION public.league_set_match_workflow_state(
  p_actor_id uuid,p_match_id uuid,p_expected_schedule_version integer,p_state text,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_match record;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT m.*,p.season_id INTO v_match FROM public.league_matches m
    JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.schedule_version<>p_expected_schedule_version THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SCHEDULE_VERSION_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_result_contests c WHERE c.match_id=p_match_id AND c.status='open') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='OPEN_CONTEST_REQUIRES_RESOLUTION'; END IF;
  IF p_state NOT IN ('postponed','suspended','cancelled') OR btrim(coalesce(p_reason,''))='' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_MATCH_WORKFLOW_INVALID'; END IF;
  IF v_match.current_result_id IS NOT NULL THEN
    UPDATE public.league_result_submissions SET status='superseded',confirmed_at=NULL WHERE id=v_match.current_result_id; END IF;
  IF v_match.current_special_outcome_id IS NOT NULL THEN
    UPDATE public.league_match_special_outcomes SET status='superseded' WHERE id=v_match.current_special_outcome_id; END IF;
  UPDATE public.league_matches SET match_status=p_state,current_result_id=NULL,current_special_outcome_id=NULL,
    venue_id=CASE WHEN p_state='postponed' THEN NULL ELSE venue_id END,
    scheduled_at=CASE WHEN p_state='postponed' THEN NULL ELSE scheduled_at END,
    schedule_version=schedule_version+1,updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data,after_data,reason)
  VALUES(v_match.season_id,'match',p_match_id,'match_workflow_changed','staff',p_actor_id,
    jsonb_build_object('status',v_match.match_status),jsonb_build_object('status',p_state),p_reason);
  RETURN jsonb_build_object('ok',true,'match_id',p_match_id,'status',p_state,'schedule_version',v_match.schedule_version+1);
END; $$;

-- All lifecycle transitions take the season row before match rows. This makes
-- contest opening serialize with Phase 2 generation and season completion.
CREATE OR REPLACE FUNCTION public.league_away_captain_contest_result(
  p_actor_user_id uuid,p_match_id uuid,p_expected_result_id uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_match record; v_result record; v_contest_id uuid:=gen_random_uuid();
  v_reason text:=btrim(coalesce(p_reason,'')); v_season_id uuid; v_season_status text;
BEGIN
  SELECT ph.season_id INTO v_season_id FROM public.league_matches m
    JOIN public.league_phases ph ON ph.id=m.phase_id WHERE m.id=p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  SELECT status INTO v_season_status FROM public.league_seasons WHERE id=v_season_id FOR UPDATE;
  SELECT m.*,ph.season_id,ph.code AS phase_code INTO v_match FROM public.league_matches m
    JOIN public.league_phases ph ON ph.id=m.phase_id WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR v_match.season_id IS DISTINCT FROM v_season_id
     OR v_match.current_result_id IS DISTINCT FROM p_expected_result_id THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_VERSION_CONFLICT'; END IF;
  IF NOT ((v_season_status='phase1' AND v_match.phase_code='phase1')
       OR (v_season_status='phase2' AND v_match.phase_code IN ('serie_a','serie_b'))) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_SEASON_INACTIVE'; END IF;
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
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_user_id,after_data,reason)
  VALUES(v_match.season_id,'contest',v_contest_id,'result_contested','user',p_actor_user_id,
    jsonb_build_object('match_id',p_match_id,'result_id',v_result.id),v_reason);
  RETURN jsonb_build_object('ok',true,'contest_id',v_contest_id,'result_id',v_result.id,'status','contested');
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_CONTEST_ALREADY_OPEN';
END; $$;

CREATE OR REPLACE FUNCTION public.league_phase2_readiness(p_season_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE v_phase record; v_standings jsonb; v_rows jsonb; v_matches jsonb; v_blockers jsonb;
  v_total integer; v_terminal integer; v_a_count integer; v_fingerprint text; v_payload jsonb; v_existing jsonb;
BEGIN
  SELECT p.id,p.status INTO v_phase FROM public.league_phases p WHERE p.season_id=p_season_id AND p.code='phase1';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE1_NOT_FOUND'; END IF;
  v_standings:=public.league_get_standings(v_phase.id); v_rows:=coalesce(v_standings->'rows','[]'::jsonb);
  SELECT count(*),count(*) FILTER(WHERE terminal),
    coalesce(jsonb_agg(jsonb_build_object('match_id',match_id,'home_team',home_name,'away_team',away_name,
      'match_status',match_status,'reason',reason) ORDER BY match_id) FILTER(WHERE NOT terminal),'[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('match_id',match_id,'match_status',match_status,'result_id',result_id,
      'result_revision',result_revision,'effective_result_status',effective_result_status,'special_id',special_id,
      'special_revision',special_revision,'special_status',special_status,'open_contests',open_contests)
      ORDER BY match_id),'[]'::jsonb)
  INTO v_total,v_terminal,v_blockers,v_matches FROM (
    SELECT m.id match_id,m.match_status,ht.name home_name,at.name away_name,r.id result_id,r.revision result_revision,
      CASE WHEN r.id IS NULL THEN NULL ELSE public.league_effective_result_status(r.id) END effective_result_status,
      so.id special_id,so.revision special_revision,so.status special_status,coalesce(oc.items,'[]'::jsonb) open_contests,
      (coalesce(jsonb_array_length(oc.items),0)=0 AND
        ((r.id IS NOT NULL AND m.match_status IN ('submitted','confirmed') AND public.league_effective_result_status(r.id)='confirmed')
          OR (so.id IS NOT NULL AND so.status='active' AND m.match_status='confirmed'))) terminal,
      CASE WHEN coalesce(jsonb_array_length(oc.items),0)>0 THEN 'Contestazione aperta'
        WHEN r.id IS NOT NULL AND public.league_effective_result_status(r.id)='submitted' THEN 'Risultato ancora provvisorio'
        WHEN r.id IS NOT NULL AND public.league_effective_result_status(r.id)='contested' THEN 'Contestazione aperta'
        WHEN m.match_status='postponed' THEN 'Partita rinviata' WHEN m.match_status='suspended' THEN 'Partita sospesa'
        WHEN m.match_status='cancelled' THEN 'Partita annullata non finalizzata' ELSE 'Risultato mancante' END reason
    FROM public.league_matches m JOIN public.league_teams ht ON ht.id=m.home_team_id
    JOIN public.league_teams at ON at.id=m.away_team_id
    LEFT JOIN public.league_result_submissions r ON r.id=m.current_result_id
    LEFT JOIN public.league_match_special_outcomes so ON so.id=m.current_special_outcome_id
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('contest_id',c.id,'result_id',c.result_submission_id)
      ORDER BY c.id) items FROM public.league_result_contests c WHERE c.match_id=m.id AND c.status='open') oc ON true
    WHERE m.phase_id=v_phase.id
  ) states;
  v_payload:=jsonb_build_object('algorithm_version','phase2-split-v1+circle-ha-v1','season_id',p_season_id,
    'source_phase_id',v_phase.id,'standings',v_rows,'match_state',v_matches);
  v_fingerprint:=encode(digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  v_a_count:=ceil(jsonb_array_length(v_rows)/2.0)::integer;
  SELECT jsonb_build_object('serie_a_phase_id',a.id,'serie_b_phase_id',b.id,'generated_at',a.generated_at)
    INTO v_existing FROM public.league_phases a JOIN public.league_phases b ON b.season_id=a.season_id AND b.code='serie_b'
    WHERE a.season_id=p_season_id AND a.code='serie_a';
  RETURN jsonb_build_object('season_id',p_season_id,'source_phase_id',v_phase.id,
    'ready',v_total>0 AND v_terminal=v_total AND jsonb_array_length(v_rows)>=2,
    'total_teams',jsonb_array_length(v_rows),'total_matches',v_total,'terminal_matches',v_terminal,
    'blocking_matches',v_blockers,'standings',v_rows,
    'serie_a',coalesce((SELECT jsonb_agg(x ORDER BY (x->>'position')::integer) FROM jsonb_array_elements(v_rows) x WHERE (x->>'position')::integer<=v_a_count),'[]'::jsonb),
    'serie_b',coalesce((SELECT jsonb_agg(x ORDER BY (x->>'position')::integer) FROM jsonb_array_elements(v_rows) x WHERE (x->>'position')::integer>v_a_count),'[]'::jsonb),
    'fingerprint',v_fingerprint,'algorithm_version','phase2-split-v1+circle-ha-v1',
    'already_generated',v_existing IS NOT NULL,'generated',v_existing);
END; $$;

CREATE OR REPLACE FUNCTION public.league_phase_completion_detail(p_phase_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
WITH phase AS (SELECT p.id,p.code,p.name FROM public.league_phases p WHERE p.id=p_phase_id), states AS (
  SELECT m.id match_id,m.match_status,ht.name home_team,at.name away_team,r.id result_id,r.revision result_revision,
    CASE WHEN r.id IS NULL THEN NULL ELSE public.league_effective_result_status(r.id) END effective_result_status,
    so.id special_id,so.revision special_revision,so.status special_status,coalesce(oc.items,'[]'::jsonb) open_contests,
    (coalesce(jsonb_array_length(oc.items),0)=0 AND
      ((r.id IS NOT NULL AND m.match_status IN ('submitted','confirmed') AND public.league_effective_result_status(r.id)='confirmed')
       OR (so.id IS NOT NULL AND so.status='active' AND m.match_status='confirmed'))) terminal,
    CASE WHEN coalesce(jsonb_array_length(oc.items),0)>0 THEN 'Contestazione aperta'
      WHEN r.id IS NOT NULL AND public.league_effective_result_status(r.id)='submitted' THEN 'Risultato ancora provvisorio'
      WHEN r.id IS NOT NULL AND public.league_effective_result_status(r.id)='contested' THEN 'Contestazione aperta'
      WHEN m.match_status='postponed' THEN 'Partita rinviata' WHEN m.match_status='suspended' THEN 'Partita sospesa'
      WHEN m.match_status='cancelled' THEN 'Partita annullata non finalizzata' ELSE 'Risultato mancante' END reason
  FROM public.league_matches m JOIN public.league_teams ht ON ht.id=m.home_team_id
  JOIN public.league_teams at ON at.id=m.away_team_id
  LEFT JOIN public.league_result_submissions r ON r.id=m.current_result_id
  LEFT JOIN public.league_match_special_outcomes so ON so.id=m.current_special_outcome_id
  LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('contest_id',c.id,'result_id',c.result_submission_id)
    ORDER BY c.id) items FROM public.league_result_contests c WHERE c.match_id=m.id AND c.status='open') oc ON true
  WHERE m.phase_id=p_phase_id
), aggregate_state AS (
  SELECT count(*) total,count(*) FILTER(WHERE terminal) terminal,
    coalesce(jsonb_agg(jsonb_build_object('match_id',match_id,'home_team',home_team,'away_team',away_team,
      'match_status',match_status,'reason',reason) ORDER BY match_id) FILTER(WHERE NOT terminal),'[]'::jsonb) blockers,
    coalesce(jsonb_agg(jsonb_build_object('match_id',match_id,'match_status',match_status,'result_id',result_id,
      'result_revision',result_revision,'effective_result_status',effective_result_status,'special_id',special_id,
      'special_revision',special_revision,'special_status',special_status,'open_contests',open_contests)
      ORDER BY match_id),'[]'::jsonb) match_state FROM states
)
SELECT jsonb_build_object('phase_id',phase.id,'code',phase.code,'name',phase.name,
  'total_matches',aggregate_state.total,'terminal_matches',aggregate_state.terminal,
  'blocking_matches',aggregate_state.blockers,'match_state',aggregate_state.match_state,
  'standings',public.league_get_standings(phase.id)->'rows') FROM phase CROSS JOIN aggregate_state;
$$;

-- Repair every currently installed Monday League notification producer without
-- modifying the historical Stage 7/8 migrations.
DO $$
DECLARE v_function record; v_definition text;
BEGIN
  FOR v_function IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'league_%'
      AND p.prosrc LIKE '%/monday-league/team/%'
  LOOP
    v_definition:=pg_get_functiondef(v_function.oid);
    EXECUTE replace(v_definition,'/monday-league/team/','/monday-league/squadre/');
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'league_%'
      AND p.prosrc LIKE '%/monday-league/team/%') THEN
    RAISE EXCEPTION 'ML_NOTIFICATION_TEAM_ROUTE_REMEDIATION_FAILED';
  END IF;
END; $$;

-- These functions are invoked only by triggers. Trigger execution does not use
-- direct function EXECUTE grants, so application roles do not need them.
REVOKE EXECUTE ON FUNCTION public.league_preserve_revealed_lineups_on_reschedule() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.league_block_result_reschedule() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.league_enqueue_audit_notification() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.league_enqueue_reschedule_notification() FROM PUBLIC,anon,authenticated;

