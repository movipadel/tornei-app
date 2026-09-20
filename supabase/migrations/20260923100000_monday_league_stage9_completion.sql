-- Monday League Stage 9: guarded championship completion and completed-season lock.

ALTER TABLE public.league_seasons
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN completion_fingerprint text;

ALTER TABLE public.league_seasons
  ADD CONSTRAINT league_seasons_completion_shape CHECK (
    (status IN ('completed','archived') AND ((completed_at IS NULL AND completion_fingerprint IS NULL)
      OR (completed_at IS NOT NULL AND completion_fingerprint IS NOT NULL)))
    OR (status NOT IN ('completed','archived') AND completed_at IS NULL AND completion_fingerprint IS NULL)
  );

ALTER TABLE public.league_notification_events
  DROP CONSTRAINT league_notification_events_event_type_check;
ALTER TABLE public.league_notification_events
  ADD CONSTRAINT league_notification_events_event_type_check CHECK (event_type IN (
    'lineup_reminder','match_reminder','missing_result_reminder',
    'result_submitted','contest_opened','contest_resolved',
    'match_rescheduled','lineups_reopened','phase2_ready','season_completed'
  ));

CREATE FUNCTION public.league_phase_completion_detail(p_phase_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
WITH phase AS (
  SELECT p.id,p.code,p.name FROM public.league_phases p WHERE p.id=p_phase_id
), states AS (
  SELECT m.id match_id,m.match_status,ht.name home_team,at.name away_team,
    r.id result_id,r.revision result_revision,
    CASE WHEN r.id IS NULL THEN NULL ELSE public.league_effective_result_status(r.id) END effective_result_status,
    so.id special_id,so.revision special_revision,so.status special_status,
    ((r.id IS NOT NULL AND m.match_status IN ('submitted','confirmed')
       AND public.league_effective_result_status(r.id)='confirmed')
      OR (so.id IS NOT NULL AND so.status='active' AND m.match_status='confirmed')) terminal,
    CASE
      WHEN EXISTS(SELECT 1 FROM public.league_result_contests c WHERE c.result_submission_id=r.id AND c.status='open') THEN 'Contestazione aperta'
      WHEN r.id IS NOT NULL AND public.league_effective_result_status(r.id)='submitted' THEN 'Risultato ancora provvisorio'
      WHEN r.id IS NOT NULL AND public.league_effective_result_status(r.id)='contested' THEN 'Contestazione aperta'
      WHEN m.match_status='postponed' THEN 'Partita rinviata'
      WHEN m.match_status='suspended' THEN 'Partita sospesa'
      WHEN m.match_status='cancelled' THEN 'Partita annullata non finalizzata'
      ELSE 'Risultato mancante' END reason
  FROM public.league_matches m
  JOIN public.league_teams ht ON ht.id=m.home_team_id
  JOIN public.league_teams at ON at.id=m.away_team_id
  LEFT JOIN public.league_result_submissions r ON r.id=m.current_result_id
  LEFT JOIN public.league_match_special_outcomes so ON so.id=m.current_special_outcome_id
  WHERE m.phase_id=p_phase_id
), aggregate_state AS (
  SELECT count(*) total,count(*) FILTER(WHERE terminal) terminal,
    coalesce(jsonb_agg(jsonb_build_object('match_id',match_id,'home_team',home_team,'away_team',away_team,
      'match_status',match_status,'reason',reason) ORDER BY match_id) FILTER(WHERE NOT terminal),'[]'::jsonb) blockers,
    coalesce(jsonb_agg(jsonb_build_object('match_id',match_id,'match_status',match_status,
      'result_id',result_id,'result_revision',result_revision,'effective_result_status',effective_result_status,
      'special_id',special_id,'special_revision',special_revision,'special_status',special_status) ORDER BY match_id),'[]'::jsonb) match_state
  FROM states
)
SELECT jsonb_build_object('phase_id',phase.id,'code',phase.code,'name',phase.name,
  'total_matches',aggregate_state.total,'terminal_matches',aggregate_state.terminal,
  'blocking_matches',aggregate_state.blockers,'match_state',aggregate_state.match_state,
  'standings',public.league_get_standings(phase.id)->'rows')
FROM phase CROSS JOIN aggregate_state;
$$;

CREATE OR REPLACE FUNCTION public.league_phase2_completion_readiness(p_season_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE v_season record; v_a jsonb; v_b jsonb; v_payload jsonb; v_fingerprint text;
BEGIN
  SELECT id,status,completed_at,completion_fingerprint INTO v_season
    FROM public.league_seasons WHERE id=p_season_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SEASON_NOT_FOUND'; END IF;
  SELECT public.league_phase_completion_detail(id) INTO v_a FROM public.league_phases
    WHERE season_id=p_season_id AND code='serie_a';
  SELECT public.league_phase_completion_detail(id) INTO v_b FROM public.league_phases
    WHERE season_id=p_season_id AND code='serie_b';
  v_payload:=jsonb_build_object('algorithm_version','season-completion-v1','season_id',p_season_id,
    'serie_a',v_a,'serie_b',v_b);
  v_fingerprint:=encode(digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  RETURN jsonb_build_object(
    'season_id',p_season_id,'season_status',v_season.status,'completed_at',v_season.completed_at,
    'completed',v_season.status IN ('completed','archived'),
    'ready',v_season.status='phase2' AND v_a IS NOT NULL AND v_b IS NOT NULL
      AND (v_a->>'total_matches')::integer>0 AND (v_b->>'total_matches')::integer>0
      AND (v_a->>'terminal_matches')::integer=(v_a->>'total_matches')::integer
      AND (v_b->>'terminal_matches')::integer=(v_b->>'total_matches')::integer,
    'serie_a',v_a,'serie_b',v_b,'fingerprint',v_fingerprint,
    'completion_fingerprint',v_season.completion_fingerprint,
    'algorithm_version','season-completion-v1');
END; $$;

CREATE FUNCTION public.league_enqueue_season_completed(p_season_id uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count integer:=0; v_row record;
BEGIN
  FOR v_row IN SELECT t.id,t.slug,p.user_id FROM public.league_teams t
    JOIN public.league_team_players p ON p.id=t.captain_player_id AND p.is_active AND p.user_id IS NOT NULL
    WHERE t.season_id=p_season_id AND t.is_active
  LOOP
    PERFORM public.league_enqueue_user_notification('season_completed',p_season_id,v_row.user_id,
      'league:'||p_season_id||':season-completed:user:'||v_row.user_id||':in_app',
      'Monday League conclusa','Monday League conclusa. Consulta la classifica finale.',
      '/monday-league/squadre/'||v_row.slug,now(),NULL,NULL,NULL,NULL,v_row.id,
      jsonb_build_object('season_id',p_season_id));
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END; $$;

CREATE FUNCTION public.league_complete_season(
  p_actor_id uuid,p_season_id uuid,p_expected_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,extensions AS $$
DECLARE v_season record; v_ready jsonb; v_completed_at timestamptz; v_a uuid; v_b uuid;
  v_a_fingerprint text; v_b_fingerprint text; v_notifications integer;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('league-completion:'||p_season_id::text,0));
  SELECT * INTO v_season FROM public.league_seasons WHERE id=p_season_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SEASON_NOT_FOUND'; END IF;
  IF v_season.status='completed' THEN
    RETURN jsonb_build_object('ok',true,'created',false,'replayed',true,'season_id',p_season_id,
      'status','completed','completed_at',v_season.completed_at);
  END IF;
  IF v_season.status<>'phase2' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SEASON_NOT_COMPLETABLE'; END IF;
  SELECT id INTO v_a FROM public.league_phases WHERE season_id=p_season_id AND code='serie_a' FOR UPDATE;
  SELECT id INTO v_b FROM public.league_phases WHERE season_id=p_season_id AND code='serie_b' FOR UPDATE;
  PERFORM 1 FROM public.league_matches WHERE phase_id IN(v_a,v_b) ORDER BY id FOR UPDATE;
  v_ready:=public.league_phase2_completion_readiness(p_season_id);
  IF v_ready->>'fingerprint' IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_COMPLETION_STALE_PREVIEW'; END IF;
  IF NOT (v_ready->>'ready')::boolean THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SEASON_NOT_READY'; END IF;
  v_completed_at:=now();
  v_a_fingerprint:=encode(digest(convert_to((v_ready->'serie_a'->'standings')::text,'UTF8'),'sha256'),'hex');
  v_b_fingerprint:=encode(digest(convert_to((v_ready->'serie_b'->'standings')::text,'UTF8'),'sha256'),'hex');
  UPDATE public.league_phases SET status='finalized',finalized_at=coalesce(finalized_at,v_completed_at),
    finalized_by_staff_id=coalesce(finalized_by_staff_id,p_actor_id),updated_at=v_completed_at
    WHERE id IN(v_a,v_b);
  UPDATE public.league_seasons SET status='completed',completed_at=v_completed_at,
    completion_fingerprint=p_expected_fingerprint,updated_at=v_completed_at WHERE id=p_season_id;
  UPDATE public.league_notification_events SET status='skipped',locked_at=NULL,locked_by=NULL,
    last_error='season_completed',updated_at=v_completed_at
    WHERE season_id=p_season_id AND event_type IN('lineup_reminder','match_reminder','missing_result_reminder')
      AND status IN('pending','processing');
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,after_data,metadata)
    VALUES(p_season_id,'season',p_season_id,'season_completed','staff',p_actor_id,
      jsonb_build_object('status','completed','completed_at',v_completed_at,'serie_a_phase_id',v_a,'serie_b_phase_id',v_b),
      jsonb_build_object('completion_fingerprint',p_expected_fingerprint,
        'serie_a_standings_fingerprint',v_a_fingerprint,'serie_b_standings_fingerprint',v_b_fingerprint,
        'algorithm_version','season-completion-v1'));
  v_notifications:=public.league_enqueue_season_completed(p_season_id);
  RETURN jsonb_build_object('ok',true,'created',true,'replayed',false,'season_id',p_season_id,
    'status','completed','completed_at',v_completed_at,'notifications',v_notifications);
END; $$;

-- Completed seasons are immutable sporting records. Deletes remain available to
-- the existing guarded hard-delete command because this trigger excludes DELETE.
CREATE FUNCTION public.league_reject_completed_sporting_write()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_season_id uuid; v_status text;
BEGIN
  IF TG_TABLE_NAME='league_rounds' THEN
    SELECT season_id INTO v_season_id FROM public.league_phases WHERE id=NEW.phase_id;
  ELSIF TG_TABLE_NAME='league_matches' THEN
    SELECT season_id INTO v_season_id FROM public.league_phases WHERE id=NEW.phase_id;
  ELSIF TG_TABLE_NAME='league_lineups' THEN
    SELECT p.season_id INTO v_season_id FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=NEW.match_id;
  ELSIF TG_TABLE_NAME='league_result_submissions' THEN
    SELECT p.season_id INTO v_season_id FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=NEW.match_id;
  ELSIF TG_TABLE_NAME='league_result_contests' THEN
    SELECT p.season_id INTO v_season_id FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=NEW.match_id;
  ELSIF TG_TABLE_NAME='league_match_special_outcomes' THEN
    SELECT p.season_id INTO v_season_id FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=NEW.match_id;
  END IF;
  SELECT status INTO v_status FROM public.league_seasons WHERE id=v_season_id;
  IF v_status IN('completed','archived') AND current_setting('app.league_hard_delete',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SEASON_SPORTING_LOCKED'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER league_rounds_completed_lock BEFORE INSERT OR UPDATE ON public.league_rounds
  FOR EACH ROW EXECUTE FUNCTION public.league_reject_completed_sporting_write();
CREATE TRIGGER league_matches_completed_lock BEFORE INSERT OR UPDATE ON public.league_matches
  FOR EACH ROW EXECUTE FUNCTION public.league_reject_completed_sporting_write();
CREATE TRIGGER league_lineups_completed_lock BEFORE INSERT OR UPDATE ON public.league_lineups
  FOR EACH ROW EXECUTE FUNCTION public.league_reject_completed_sporting_write();
CREATE TRIGGER league_results_completed_lock BEFORE INSERT OR UPDATE ON public.league_result_submissions
  FOR EACH ROW EXECUTE FUNCTION public.league_reject_completed_sporting_write();
CREATE TRIGGER league_contests_completed_lock BEFORE INSERT OR UPDATE ON public.league_result_contests
  FOR EACH ROW EXECUTE FUNCTION public.league_reject_completed_sporting_write();
CREATE TRIGGER league_special_outcomes_completed_lock BEFORE INSERT OR UPDATE ON public.league_match_special_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.league_reject_completed_sporting_write();

-- Preserve the Stage 5 deletion contract while allowing its pointer-cleanup
-- update to pass the completed-season sporting lock inside this transaction.
CREATE OR REPLACE FUNCTION public.league_delete_season(
  p_actor_id uuid,p_season_id uuid,p_confirmation text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_season record; v_paths jsonb;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT * INTO v_season FROM public.league_season_deletion_log WHERE request_id=p_request_id;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'duplicate',true,'data',jsonb_build_object(
    'season_id',v_season.season_id,'media_paths',v_season.media_paths)); END IF;
  SELECT * INTO v_season FROM public.league_seasons WHERE id=p_season_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SEASON_NOT_FOUND'; END IF;
  IF v_season.status NOT IN ('completed','archived') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_ACTIVE_SEASON_DELETE_FORBIDDEN'; END IF;
  IF p_confirmation IS DISTINCT FROM v_season.name THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_DELETE_CONFIRMATION_MISMATCH'; END IF;
  SELECT coalesce(jsonb_agg(path),'[]') INTO v_paths FROM (
    SELECT logo_path path FROM public.league_teams WHERE season_id=p_season_id AND logo_path IS NOT NULL
    UNION SELECT image_path FROM public.league_teams WHERE season_id=p_season_id AND image_path IS NOT NULL
  ) q WHERE path LIKE 'monday-league/'||p_season_id||'/%';
  INSERT INTO public.league_season_deletion_log(request_id,season_id,season_name,requested_by_staff_id,media_paths,database_deleted_at)
    VALUES(p_request_id,p_season_id,v_season.name,p_actor_id,v_paths,now());
  PERFORM set_config('app.league_hard_delete','on',true);
  UPDATE public.league_matches m SET current_result_id=NULL,current_special_outcome_id=NULL
    WHERE EXISTS(SELECT 1 FROM public.league_phases p WHERE p.id=m.phase_id AND p.season_id=p_season_id);
  DELETE FROM public.league_matches m
    WHERE EXISTS(SELECT 1 FROM public.league_phases p WHERE p.id=m.phase_id AND p.season_id=p_season_id);
  DELETE FROM public.league_phase_teams pt
    WHERE EXISTS(SELECT 1 FROM public.league_phases p WHERE p.id=pt.phase_id AND p.season_id=p_season_id);
  DELETE FROM public.league_teams WHERE season_id=p_season_id;
  DELETE FROM public.league_audit_events WHERE season_id=p_season_id;
  DELETE FROM public.league_seasons WHERE id=p_season_id;
  RETURN jsonb_build_object('ok',true,'duplicate',false,'data',jsonb_build_object('season_id',p_season_id,'media_paths',v_paths));
END; $$;

REVOKE ALL ON FUNCTION public.league_phase_completion_detail(uuid),
  public.league_phase2_completion_readiness(uuid),public.league_enqueue_season_completed(uuid),
  public.league_complete_season(uuid,uuid,text),public.league_reject_completed_sporting_write()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.league_phase2_completion_readiness(uuid),
  public.league_complete_season(uuid,uuid,text) TO service_role;
