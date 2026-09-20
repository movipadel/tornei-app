-- Monday League Stage 8: authoritative Phase 1 readiness and atomic Serie A/B generation.

CREATE FUNCTION public.league_phase2_readiness(p_season_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,extensions AS $$
DECLARE
  v_phase record; v_standings jsonb; v_rows jsonb; v_matches jsonb; v_blockers jsonb;
  v_total integer; v_terminal integer; v_a_count integer; v_fingerprint text; v_payload jsonb;
  v_existing jsonb;
BEGIN
  SELECT p.id,p.status INTO v_phase FROM public.league_phases p
    WHERE p.season_id=p_season_id AND p.code='phase1';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE1_NOT_FOUND'; END IF;
  v_standings:=public.league_get_standings(v_phase.id);
  v_rows:=coalesce(v_standings->'rows','[]'::jsonb);

  SELECT count(*),count(*) FILTER(WHERE terminal),
    coalesce(jsonb_agg(jsonb_build_object(
      'match_id',match_id,'home_team',home_name,'away_team',away_name,
      'match_status',match_status,'reason',reason
    ) ORDER BY match_id) FILTER(WHERE NOT terminal),'[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'match_id',match_id,'match_status',match_status,'result_id',result_id,
      'result_revision',result_revision,'effective_result_status',effective_result_status,
      'special_id',special_id,'special_revision',special_revision,'special_status',special_status
    ) ORDER BY match_id),'[]'::jsonb)
  INTO v_total,v_terminal,v_blockers,v_matches
  FROM (
    SELECT m.id match_id,m.match_status,ht.name home_name,at.name away_name,
      r.id result_id,r.revision result_revision,
      CASE WHEN r.id IS NULL THEN NULL ELSE public.league_effective_result_status(r.id) END effective_result_status,
      so.id special_id,so.revision special_revision,so.status special_status,
      ((r.id IS NOT NULL AND m.match_status IN ('submitted','confirmed') AND public.league_effective_result_status(r.id)='confirmed')
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
    WHERE m.phase_id=v_phase.id
  ) states;

  v_payload:=jsonb_build_object(
    'algorithm_version','phase2-split-v1+circle-ha-v1','season_id',p_season_id,
    'source_phase_id',v_phase.id,'standings',v_rows,'match_state',v_matches
  );
  v_fingerprint:=encode(digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  v_a_count:=ceil(jsonb_array_length(v_rows)/2.0)::integer;
  SELECT jsonb_build_object('serie_a_phase_id',a.id,'serie_b_phase_id',b.id,'generated_at',a.generated_at)
    INTO v_existing FROM public.league_phases a JOIN public.league_phases b ON b.season_id=a.season_id AND b.code='serie_b'
    WHERE a.season_id=p_season_id AND a.code='serie_a';
  RETURN jsonb_build_object(
    'season_id',p_season_id,'source_phase_id',v_phase.id,
    'ready',v_total>0 AND v_terminal=v_total AND jsonb_array_length(v_rows)>=2,
    'total_teams',jsonb_array_length(v_rows),'total_matches',v_total,'terminal_matches',v_terminal,
    'blocking_matches',v_blockers,'standings',v_rows,
    'serie_a',coalesce((SELECT jsonb_agg(x ORDER BY (x->>'position')::integer) FROM jsonb_array_elements(v_rows) x WHERE (x->>'position')::integer<=v_a_count),'[]'::jsonb),
    'serie_b',coalesce((SELECT jsonb_agg(x ORDER BY (x->>'position')::integer) FROM jsonb_array_elements(v_rows) x WHERE (x->>'position')::integer>v_a_count),'[]'::jsonb),
    'fingerprint',v_fingerprint,'algorithm_version','phase2-split-v1+circle-ha-v1',
    'already_generated',v_existing IS NOT NULL,'generated',v_existing
  );
END; $$;

CREATE FUNCTION public.league_insert_phase2_division(
  p_phase_id uuid,p_season_id uuid,p_source_phase_id uuid,p_code text,p_name text,p_sequence integer,
  p_members jsonb,p_rounds jsonb,p_quality jsonb,p_algorithm_version text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,extensions AS $$
DECLARE v_count integer; v_expected_rounds integer; v_expected_matches integer; v_matches integer:=0;
  v_item jsonb; v_match jsonb; v_round_id uuid; v_match_id uuid; v_home uuid; v_away uuid;
  v_ids uuid[];
BEGIN
  IF p_code NOT IN ('serie_a','serie_b') OR jsonb_typeof(p_members)<>'array' OR jsonb_typeof(p_rounds)<>'array'
     OR jsonb_array_length(coalesce(p_quality->'invariantViolations','[]'::jsonb))<>0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE2_PAYLOAD_INVALID'; END IF;
  SELECT array_agg((x->>'team_id')::uuid ORDER BY (x->>'destination_seed')::integer),count(*)
    INTO v_ids,v_count FROM jsonb_array_elements(p_members) x;
  IF v_count<2 OR (SELECT count(DISTINCT x) FROM unnest(v_ids) x)<>v_count THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE2_TEAM_SET_INVALID'; END IF;
  v_expected_rounds:=CASE WHEN v_count%2=0 THEN v_count-1 ELSE v_count END;
  v_expected_matches:=v_count*(v_count-1)/2;
  IF jsonb_array_length(p_rounds)<>v_expected_rounds THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE2_ROUND_COUNT_INVALID'; END IF;

  INSERT INTO public.league_phases(id,season_id,code,name,sequence,status,source_phase_id,algorithm_version,generation_fingerprint,generated_at)
  VALUES(p_phase_id,p_season_id,p_code,p_name,p_sequence,'generated',p_source_phase_id,p_algorithm_version,
    encode(digest(convert_to(p_rounds::text,'UTF8'),'sha256'),'hex'),now());
  INSERT INTO public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order,source_phase_position)
  SELECT p_phase_id,(x->>'team_id')::uuid,(x->>'destination_seed')::integer,
    (x->>'tie_break_order')::integer,(x->>'position')::integer FROM jsonb_array_elements(p_members) x;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rounds) LOOP
    IF jsonb_array_length(v_item->'matches')<>floor(v_count::numeric/2)::integer THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE2_ROUND_INVALID'; END IF;
    INSERT INTO public.league_rounds(phase_id,round_number,status)
      VALUES(p_phase_id,(v_item->>'roundNumber')::integer,'generated') RETURNING id INTO v_round_id;
    FOR v_match IN SELECT value FROM jsonb_array_elements(v_item->'matches') LOOP
      v_home:=(v_match->>'homeTeamId')::uuid; v_away:=(v_match->>'awayTeamId')::uuid;
      IF v_home=v_away OR NOT(v_home=ANY(v_ids)) OR NOT(v_away=ANY(v_ids)) THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE2_MATCH_INVALID'; END IF;
      INSERT INTO public.league_matches(phase_id,round_id,home_team_id,away_team_id,venue_id,scheduled_at,match_status)
        VALUES(p_phase_id,v_round_id,v_home,v_away,NULL,NULL,'unscheduled') RETURNING id INTO v_match_id;
      INSERT INTO public.league_match_team_slots(match_id,round_id,team_id,side)
        VALUES(v_match_id,v_round_id,v_home,'home'),(v_match_id,v_round_id,v_away,'away');
      v_matches:=v_matches+1;
    END LOOP;
  END LOOP;
  IF v_matches<>v_expected_matches THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE2_MATCH_COUNT_INVALID'; END IF;
  RETURN jsonb_build_object('phase_id',p_phase_id,'team_count',v_count,'round_count',v_expected_rounds,'match_count',v_matches);
END; $$;

CREATE FUNCTION public.league_generate_phase2(
  p_actor_id uuid,p_season_id uuid,p_expected_fingerprint text,
  p_serie_a_phase_id uuid,p_serie_b_phase_id uuid,
  p_serie_a_rounds jsonb,p_serie_b_rounds jsonb,
  p_serie_a_quality jsonb,p_serie_b_quality jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,extensions AS $$
DECLARE v_season record; v_ready jsonb; v_source uuid; v_run record; v_a jsonb; v_b jsonb;
  v_snapshot jsonb; v_a_members jsonb; v_b_members jsonb;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('league-phase2:'||p_season_id::text,0));
  SELECT * INTO v_season FROM public.league_seasons WHERE id=p_season_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SEASON_NOT_FOUND'; END IF;
  v_ready:=public.league_phase2_readiness(p_season_id); v_source:=(v_ready->>'source_phase_id')::uuid;
  SELECT gr.* INTO v_run FROM public.league_generation_runs gr JOIN public.league_phases p ON p.id=gr.phase_id
    WHERE p.season_id=p_season_id AND gr.generation_kind='phase2_split';
  IF FOUND THEN
    IF v_run.fingerprint=p_expected_fingerprint AND v_ready->>'fingerprint'=p_expected_fingerprint THEN
      RETURN jsonb_build_object('ok',true,'created',false,'replayed',true,'serie_a_phase_id',p_serie_a_phase_id,'serie_b_phase_id',p_serie_b_phase_id);
    END IF;
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE2_GENERATION_CONFLICT';
  END IF;
  IF v_season.status<>'phase1' OR NOT (v_ready->>'ready')::boolean THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE1_NOT_READY'; END IF;
  IF v_ready->>'fingerprint' IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE2_STALE_PREVIEW'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_phases WHERE season_id=p_season_id AND code IN('serie_a','serie_b')) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE2_GENERATION_CONFLICT'; END IF;
  SELECT coalesce(jsonb_agg(x || jsonb_build_object('destination_seed',rn) ORDER BY rn),'[]'::jsonb) INTO v_a_members
    FROM (SELECT x,row_number() OVER(ORDER BY (x->>'position')::integer)::integer rn FROM jsonb_array_elements(v_ready->'serie_a') x) q;
  SELECT coalesce(jsonb_agg(x || jsonb_build_object('destination_seed',rn) ORDER BY rn),'[]'::jsonb) INTO v_b_members
    FROM (SELECT x,row_number() OVER(ORDER BY (x->>'position')::integer)::integer rn FROM jsonb_array_elements(v_ready->'serie_b') x) q;

  v_a:=public.league_insert_phase2_division(p_serie_a_phase_id,p_season_id,v_source,'serie_a','Serie A',2,v_a_members,p_serie_a_rounds,p_serie_a_quality,'circle-ha-v1');
  v_b:=public.league_insert_phase2_division(p_serie_b_phase_id,p_season_id,v_source,'serie_b','Serie B',3,v_b_members,p_serie_b_rounds,p_serie_b_quality,'circle-ha-v1');
  v_snapshot:=v_ready->'standings';
  INSERT INTO public.league_generation_runs(phase_id,generation_kind,input_team_order,algorithm_version,fingerprint,quality_metrics,generated_by_staff_id,completed_at)
    VALUES(p_serie_a_phase_id,'phase2_split',v_snapshot,'phase2-split-v1+circle-ha-v1',p_expected_fingerprint,
      jsonb_build_object('serie_a',v_a,'serie_b',v_b),p_actor_id,now());
  UPDATE public.league_phases SET status='finalized',finalized_at=now(),finalized_by_staff_id=p_actor_id,updated_at=now() WHERE id=v_source;
  UPDATE public.league_seasons SET status='phase2',updated_at=now() WHERE id=p_season_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,after_data,metadata)
    VALUES(p_season_id,'season',p_season_id,'phase2_generated','staff',p_actor_id,
      jsonb_build_object('source_phase_id',v_source,'serie_a_phase_id',p_serie_a_phase_id,'serie_b_phase_id',p_serie_b_phase_id),
      jsonb_build_object('fingerprint',p_expected_fingerprint,'algorithm_version','phase2-split-v1+circle-ha-v1'));
  PERFORM public.league_enqueue_phase2_ready(p_season_id,p_serie_a_phase_id);
  PERFORM public.league_enqueue_phase2_ready(p_season_id,p_serie_b_phase_id);
  RETURN jsonb_build_object('ok',true,'created',true,'replayed',false,'serie_a',v_a,'serie_b',v_b);
END; $$;

-- Stage 7 hook refined for one division at a time and division-specific copy.
CREATE OR REPLACE FUNCTION public.league_enqueue_phase2_ready(p_season_id uuid,p_phase_id uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count integer:=0; v_row record; v_name text;
BEGIN
  SELECT name INTO v_name FROM public.league_phases WHERE id=p_phase_id AND season_id=p_season_id AND code IN('serie_a','serie_b');
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE2_NOTIFICATION_PHASE_INVALID'; END IF;
  FOR v_row IN SELECT t.id,t.slug,p.user_id FROM public.league_phase_teams pt JOIN public.league_teams t ON t.id=pt.team_id
    JOIN public.league_team_players p ON p.id=t.captain_player_id AND p.is_active AND p.user_id IS NOT NULL
    WHERE pt.phase_id=p_phase_id
  LOOP
    PERFORM public.league_enqueue_user_notification('phase2_ready',p_season_id,v_row.user_id,
      'league:'||p_season_id||':phase:'||p_phase_id||':phase2-ready:user:'||v_row.user_id||':in_app',
      'Fase 2 disponibile','Monday League: è iniziata la Fase 2. La tua squadra è in '||v_name||'.',
      '/monday-league/team/'||v_row.slug,now(),NULL,NULL,NULL,p_phase_id,v_row.id,jsonb_build_object('division',v_name));
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END; $$;

CREATE FUNCTION public.league_phase2_completion_readiness(p_season_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('ready',count(*)=2 AND bool_and(x.blocking=0),'divisions',coalesce(jsonb_agg(jsonb_build_object('phase_id',x.id,'code',x.code,'total_matches',x.total,'blocking_matches',x.blocking) ORDER BY x.code),'[]'::jsonb))
  FROM (SELECT p.id,p.code,count(m.id) total,count(m.id) FILTER(WHERE NOT(
      (m.current_result_id IS NOT NULL AND m.match_status IN ('submitted','confirmed') AND public.league_effective_result_status(m.current_result_id)='confirmed')
      OR (m.current_special_outcome_id IS NOT NULL AND m.match_status='confirmed'))) blocking
    FROM public.league_phases p LEFT JOIN public.league_matches m ON m.phase_id=p.id
    WHERE p.season_id=p_season_id AND p.code IN('serie_a','serie_b') GROUP BY p.id,p.code) x;
$$;

REVOKE ALL ON FUNCTION public.league_phase2_readiness(uuid),
 public.league_insert_phase2_division(uuid,uuid,uuid,text,text,integer,jsonb,jsonb,jsonb,text),
 public.league_generate_phase2(uuid,uuid,text,uuid,uuid,jsonb,jsonb,jsonb,jsonb),
 public.league_phase2_completion_readiness(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.league_phase2_readiness(uuid),
 public.league_generate_phase2(uuid,uuid,text,uuid,uuid,jsonb,jsonb,jsonb,jsonb),
 public.league_phase2_completion_readiness(uuid) TO service_role;
