-- Monday League prerelease H3: advance captain context past sporting outcomes
-- that are already final under the authoritative Stage 6 time semantics.

CREATE OR REPLACE FUNCTION public.league_get_captain_context(p_user_id uuid,p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE v_team record; v_match record; v_own jsonb; v_opponent jsonb; v_revealed boolean;
BEGIN
  SELECT t.*,s.status season_status INTO v_team FROM public.league_teams t
    JOIN public.league_seasons s ON s.id=t.season_id WHERE t.id=p_team_id;
  IF NOT FOUND OR NOT public.league_is_captain(p_user_id,p_team_id) THEN RETURN NULL; END IF;

  SELECT m.* INTO v_match FROM public.league_matches m
    JOIN public.league_phases ph ON ph.id=m.phase_id
    LEFT JOIN public.league_match_special_outcomes so
      ON so.id=m.current_special_outcome_id AND so.status='active'
    WHERE v_team.season_status IN ('draft','phase1','phase2')
      AND ph.season_id=v_team.season_id
      AND ((v_team.season_status IN ('draft','phase1') AND ph.code='phase1')
        OR (v_team.season_status='phase2' AND ph.code IN ('serie_a','serie_b')))
      AND p_team_id IN(m.home_team_id,m.away_team_id)
      AND m.match_status NOT IN('confirmed','cancelled')
      AND NOT (
        m.current_result_id IS NOT NULL
        AND public.league_effective_result_status(m.current_result_id) IN ('confirmed','superseded')
      )
      AND so.id IS NULL
    ORDER BY m.scheduled_at NULLS LAST,m.created_at,m.id
    LIMIT 1;

  IF FOUND THEN
    SELECT jsonb_build_object('lineupId',l.id,'revision',l.revision,'players',jsonb_agg(
      jsonb_build_object('id',p.id,'displayName',p.display_name) ORDER BY lp.slot)) INTO v_own
    FROM public.league_lineups l JOIN public.league_lineup_players lp ON lp.lineup_id=l.id
      JOIN public.league_team_players p ON p.id=lp.player_id
    WHERE l.match_id=v_match.id AND l.team_id=p_team_id AND l.status='current' GROUP BY l.id,l.revision;
    v_revealed:=v_match.scheduled_at IS NOT NULL AND
      (v_match.lineups_locked_at IS NOT NULL OR now()>=v_match.scheduled_at-interval '1 hour');
    IF v_revealed THEN
      SELECT CASE WHEN x.home_lineup IS NULL THEN x.away_lineup
                  WHEN p_team_id=v_match.home_team_id THEN x.away_lineup ELSE x.home_lineup END
        INTO v_opponent FROM public.league_get_public_lineups(ARRAY[v_match.id]) x;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'is_captain',true,'can_edit_profile',true,
    'can_edit_roster',v_team.season_status='draft' AND EXISTS(SELECT 1 FROM public.league_phases
      WHERE season_id=v_team.season_id AND code='phase1' AND status='draft'),
    'can_submit_lineup',v_match.id IS NOT NULL AND v_match.scheduled_at IS NOT NULL
      AND v_match.lineups_locked_at IS NULL AND now()<v_match.scheduled_at-interval '1 hour',
    'lineup_locked',v_match.id IS NOT NULL AND (v_match.lineups_locked_at IS NOT NULL
      OR v_match.scheduled_at IS NULL OR now()>=v_match.scheduled_at-interval '1 hour'),
    'match_id',v_match.id,'lineup_deadline',v_match.scheduled_at-interval '1 hour',
    'own_lineup',v_own,'opponent_lineup',v_opponent
  );
END; $$;
