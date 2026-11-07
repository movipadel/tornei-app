-- Match-specific captain actions. No table/column or standings change.
-- The old singular captain context remains for compatibility; the public team
-- page consumes the collections below instead.

CREATE FUNCTION public.league_lineup_actionable(
  p_status text, p_scheduled_at timestamptz, p_locked_at timestamptz,
  p_result_id uuid, p_special_id uuid, p_season_status text,
  p_phase_code text, p_phase_status text
) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT p_result_id IS NULL AND p_special_id IS NULL
    AND p_season_status IN ('draft','phase1','phase2')
    AND p_phase_status IN ('generated','in_progress')
    AND ((p_season_status IN ('draft','phase1') AND p_phase_code='phase1')
      OR (p_season_status='phase2' AND p_phase_code IN ('serie_a','serie_b')))
    AND (p_status='postponed' OR
      (p_status='scheduled' AND p_scheduled_at IS NOT NULL
        AND p_locked_at IS NULL AND now()<p_scheduled_at-interval '1 hour'));
$$;

CREATE FUNCTION public.league_get_captain_lineup_matches(p_user_id uuid,p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE v_season_id uuid; v_season_status text; v_items jsonb;
BEGIN
  SELECT t.season_id,s.status INTO v_season_id,v_season_status
    FROM public.league_teams t JOIN public.league_seasons s ON s.id=t.season_id
    WHERE t.id=p_team_id;
  IF NOT FOUND OR p_user_id IS NULL OR NOT public.league_is_captain(p_user_id,p_team_id) THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY scheduled_at NULLS LAST,round_number,match_id),'[]'::jsonb)
    INTO v_items FROM (
    SELECT m.id AS match_id,m.scheduled_at,r.round_number,
      jsonb_build_object(
        'matchId',m.id,'roundNumber',r.round_number,'status',m.match_status,
        'scheduledAt',m.scheduled_at,'venueName',v.name,'opponentName',o.name,
        'lineupDeadline',CASE WHEN m.match_status='scheduled' THEN m.scheduled_at-interval '1 hour' ELSE NULL END,
        'lineupLocked',NOT public.league_lineup_actionable(m.match_status,m.scheduled_at,m.lineups_locked_at,
          m.current_result_id,m.current_special_outcome_id,v_season_status,ph.code,ph.status),
        'canSubmitLineup',public.league_lineup_actionable(m.match_status,m.scheduled_at,m.lineups_locked_at,
          m.current_result_id,m.current_special_outcome_id,v_season_status,ph.code,ph.status),
        'ownLineup',(
          SELECT jsonb_build_object('lineupId',l.id,'revision',l.revision,'players',
            (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name) ORDER BY lp.slot),'[]'::jsonb)
              FROM public.league_lineup_players lp JOIN public.league_team_players p ON p.id=lp.player_id
              WHERE lp.lineup_id=l.id))
          FROM public.league_lineups l WHERE l.match_id=m.id AND l.team_id=p_team_id AND l.status='current'),
        'opponentLineup',CASE WHEN m.match_status='scheduled' AND m.scheduled_at IS NOT NULL
          AND (m.lineups_locked_at IS NOT NULL OR now()>=m.scheduled_at-interval '1 hour')
          THEN (SELECT CASE WHEN m.home_team_id=p_team_id THEN x.away_lineup ELSE x.home_lineup END
            FROM public.league_get_public_lineups(ARRAY[m.id]) x) ELSE NULL END
      ) AS item
    FROM public.league_matches m
    JOIN public.league_phases ph ON ph.id=m.phase_id AND ph.season_id=v_season_id
    JOIN public.league_rounds r ON r.id=m.round_id
    JOIN public.league_teams o ON o.id=CASE WHEN m.home_team_id=p_team_id THEN m.away_team_id ELSE m.home_team_id END
    LEFT JOIN public.league_venues v ON v.id=m.venue_id
    WHERE p_team_id IN (m.home_team_id,m.away_team_id)
      AND m.match_status IN ('scheduled','postponed')
      AND m.current_result_id IS NULL AND m.current_special_outcome_id IS NULL
      AND ((v_season_status IN ('draft','phase1') AND ph.code='phase1')
        OR (v_season_status='phase2' AND ph.code IN ('serie_a','serie_b')))
      AND ph.status IN ('generated','in_progress')
  ) q;
  RETURN v_items;
END; $$;

CREATE OR REPLACE FUNCTION public.league_captain_submit_result(
  p_actor_user_id uuid,p_match_id uuid,p_sets jsonb
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
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_HOME_CAPTAIN_REQUIRED'; END IF;
  IF v_match.season_status NOT IN ('phase1','phase2') OR v_match.phase_status NOT IN ('generated','in_progress') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_SEASON_INACTIVE'; END IF;
  IF NOT (
    (v_match.match_status='scheduled' AND v_match.scheduled_at IS NOT NULL AND now()>=v_match.scheduled_at)
    OR v_match.match_status='postponed'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_SUBMISSION_NOT_OPEN'; END IF;
  IF v_match.current_result_id IS NOT NULL OR v_match.current_special_outcome_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_RESULT_ALREADY_EXISTS'; END IF;
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
  -- The normal result state machine owns standings and later confirmation.
  UPDATE public.league_matches SET current_result_id=v_result_id,match_status='submitted',updated_at=now()
    WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_user_id,after_data)
    VALUES(v_match.season_id,'match',p_match_id,'captain_result_submitted','user',p_actor_user_id,
      jsonb_build_object('result_id',v_result_id,'revision',1,'status','submitted'));
  RETURN jsonb_build_object('ok',true,'result_id',v_result_id,'revision',1,'status','submitted',
    'contest_deadline',(SELECT submitted_at+interval '48 hours' FROM public.league_result_submissions WHERE id=v_result_id));
END; $$;

CREATE FUNCTION public.league_get_captain_result_matches(p_user_id uuid,p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE v_season_id uuid; v_items jsonb;
BEGIN
  SELECT season_id INTO v_season_id FROM public.league_teams WHERE id=p_team_id;
  IF NOT FOUND OR p_user_id IS NULL OR NOT public.league_is_captain(p_user_id,p_team_id) THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY priority,sort_time DESC,match_id),'[]'::jsonb)
    INTO v_items FROM (
    SELECT m.id AS match_id,coalesce(r.submitted_at,m.scheduled_at) AS sort_time,
      CASE WHEN m.away_team_id=p_team_id AND r.status='submitted' AND now()<r.submitted_at+interval '48 hours' THEN 0
        WHEN m.home_team_id=p_team_id AND m.current_result_id IS NULL THEN 1 ELSE 2 END AS priority,
      jsonb_build_object(
        'matchId',m.id,'roundNumber',rd.round_number,'opponentName',o.name,
        'status',m.match_status,'scheduledAt',m.scheduled_at,'resultId',m.current_result_id,
        'isAwayCaptain',m.away_team_id=p_team_id,
        'canSubmitResult',m.home_team_id=p_team_id AND m.current_result_id IS NULL
          AND m.current_special_outcome_id IS NULL AND
          (m.match_status='postponed' OR
            (m.match_status='scheduled' AND m.scheduled_at IS NOT NULL AND now()>=m.scheduled_at)),
        'canContestResult',m.away_team_id=p_team_id AND r.status='submitted'
          AND r.submitter_type='captain' AND now()<r.submitted_at+interval '48 hours'
          AND NOT EXISTS(SELECT 1 FROM public.league_result_contests c
            WHERE c.result_submission_id=r.id AND c.status='open'),
        'effectiveStatus',CASE WHEN r.id IS NOT NULL THEN public.league_effective_result_status(r.id) ELSE NULL END,
        'submittedAt',r.submitted_at,'contestDeadline',r.submitted_at+interval '48 hours',
        'summary',CASE WHEN r.id IS NOT NULL THEN r.home_sets_won::text||'–'||r.away_sets_won::text ELSE NULL END,
        'sets',coalesce((SELECT jsonb_agg(jsonb_build_object('number',st.set_number,
          'homeGames',st.home_games,'awayGames',st.away_games) ORDER BY st.set_number)
          FROM public.league_match_sets st WHERE st.result_submission_id=r.id),'[]'::jsonb),
        'contestSubmitted',EXISTS(SELECT 1 FROM public.league_result_contests c
          WHERE c.result_submission_id=r.id AND c.opened_by_user_id=p_user_id)
      ) AS item
    FROM public.league_matches m
    JOIN public.league_phases ph ON ph.id=m.phase_id AND ph.season_id=v_season_id
    JOIN public.league_seasons s ON s.id=ph.season_id
    JOIN public.league_rounds rd ON rd.id=m.round_id
    JOIN public.league_teams o ON o.id=CASE WHEN m.home_team_id=p_team_id THEN m.away_team_id ELSE m.home_team_id END
    LEFT JOIN public.league_result_submissions r ON r.id=m.current_result_id
    WHERE p_team_id IN (m.home_team_id,m.away_team_id)
      AND s.status IN ('phase1','phase2') AND ph.status IN ('generated','in_progress')
      AND ((s.status='phase1' AND ph.code='phase1')
        OR (s.status='phase2' AND ph.code IN ('serie_a','serie_b')))
      AND (
        (m.home_team_id=p_team_id AND m.current_result_id IS NULL
          AND m.current_special_outcome_id IS NULL AND
          (m.match_status='postponed' OR
            (m.match_status='scheduled' AND m.scheduled_at IS NOT NULL AND now()>=m.scheduled_at)))
        OR (r.status IN ('submitted','contested') AND
          (r.status='contested' OR now()<r.submitted_at+interval '48 hours'))
      )
  ) q;
  RETURN v_items;
END; $$;

CREATE OR REPLACE FUNCTION public.league_write_lineup(
  p_actor_user_id uuid,p_actor_staff_id uuid,p_match_id uuid,
  p_team_id uuid,p_player_ids uuid[],p_override_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_match record; v_old uuid; v_revision integer; v_new uuid:=gen_random_uuid();
BEGIN
  SELECT m.*,ph.season_id,ph.code AS phase_code,ph.status AS phase_status,s.status AS season_status
    INTO v_match FROM public.league_matches m
    JOIN public.league_phases ph ON ph.id=m.phase_id
    JOIN public.league_seasons s ON s.id=ph.season_id
    WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND OR p_team_id NOT IN (v_match.home_team_id,v_match.away_team_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_MATCH_TEAM_INVALID'; END IF;
  IF p_actor_staff_id IS NOT NULL THEN
    PERFORM public.league_assert_admin(p_actor_staff_id);
    IF now()>=v_match.scheduled_at-interval '1 hour' AND btrim(coalesce(p_override_reason,''))='' THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_OVERRIDE_REASON_REQUIRED'; END IF;
  ELSE
    IF NOT public.league_is_captain(p_actor_user_id,p_team_id) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_CAPTAIN_REQUIRED'; END IF;
    IF NOT public.league_lineup_actionable(v_match.match_status,v_match.scheduled_at,v_match.lineups_locked_at,
      v_match.current_result_id,v_match.current_special_outcome_id,v_match.season_status,v_match.phase_code,v_match.phase_status) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_LINEUP_LOCKED'; END IF;
  END IF;
  IF coalesce(array_length(p_player_ids,1),0)<>2 OR p_player_ids[1]=p_player_ids[2] THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_LINEUP_EXACTLY_TWO'; END IF;
  IF (SELECT count(*) FROM public.league_team_players
      WHERE team_id=p_team_id AND id=ANY(p_player_ids) AND is_active)<>2 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_LINEUP_ACTIVE_ROSTER_ONLY'; END IF;
  SELECT id INTO v_old FROM public.league_lineups
    WHERE match_id=p_match_id AND team_id=p_team_id AND status='current' FOR UPDATE;
  SELECT coalesce(max(revision),0)+1 INTO v_revision FROM public.league_lineups
    WHERE match_id=p_match_id AND team_id=p_team_id;
  IF v_old IS NOT NULL THEN
    UPDATE public.league_lineups SET status='superseded',superseded_at=now() WHERE id=v_old;
  END IF;
  INSERT INTO public.league_lineups(id,match_id,team_id,revision,submitted_by_user_id,overridden_by_staff_id,override_reason)
    VALUES(v_new,p_match_id,p_team_id,v_revision,p_actor_user_id,p_actor_staff_id,nullif(btrim(coalesce(p_override_reason,'')),''));
  INSERT INTO public.league_lineup_players(lineup_id,team_id,player_id,slot)
    VALUES(v_new,p_team_id,p_player_ids[1],1),(v_new,p_team_id,p_player_ids[2],2);
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_user_id,actor_staff_id,after_data,reason)
    VALUES(v_match.season_id,'lineup',v_new,
      CASE WHEN p_actor_staff_id IS NULL THEN 'lineup_submitted' ELSE 'lineup_admin_override' END,
      CASE WHEN p_actor_staff_id IS NULL THEN 'user' ELSE 'staff' END,p_actor_user_id,p_actor_staff_id,
      jsonb_build_object('match_id',p_match_id,'team_id',p_team_id,'revision',v_revision),
      nullif(btrim(coalesce(p_override_reason,'')),''));
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('lineup_id',v_new,'revision',v_revision));
END; $$;

-- Keep the existing date-based scanner unchanged. Target each newly queued
-- scheduled-match reminder at its own match on the team page.
CREATE FUNCTION public.league_target_match_reminder()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.event_type IN ('lineup_reminder','match_reminder','missing_result_reminder')
    AND NEW.match_id IS NOT NULL
    AND NEW.cta_url ~ '^/monday-league/(team|squadre)/[a-z0-9-]+$' THEN
    NEW.cta_url:='/monday-league/squadre/'||split_part(NEW.cta_url,'/',4)
      ||'?match='||NEW.match_id::text;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER league_notification_match_target
  BEFORE INSERT ON public.league_notification_events
  FOR EACH ROW EXECUTE FUNCTION public.league_target_match_reminder();

REVOKE ALL ON FUNCTION
  public.league_lineup_actionable(text,timestamptz,timestamptz,uuid,uuid,text,text,text),
  public.league_get_captain_lineup_matches(uuid,uuid),
  public.league_get_captain_result_matches(uuid,uuid),
  public.league_target_match_reminder()
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.league_lineup_actionable(text,timestamptz,timestamptz,uuid,uuid,text,text,text),
  public.league_get_captain_lineup_matches(uuid,uuid),
  public.league_get_captain_result_matches(uuid,uuid)
TO service_role;
