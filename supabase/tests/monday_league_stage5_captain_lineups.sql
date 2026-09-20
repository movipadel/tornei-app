\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('51000000-0000-4000-8000-000000000001','S5 Captain A','+390000007101','ml-s5-a@example.invalid','M'),
 ('51000000-0000-4000-8000-000000000002','S5 Player A','+390000007102','ml-s5-pa@example.invalid','F'),
 ('51000000-0000-4000-8000-000000000003','S5 Captain B','+390000007103','ml-s5-b@example.invalid','M'),
 ('51000000-0000-4000-8000-000000000004','S5 Player B','+390000007104','ml-s5-pb@example.invalid','F');
INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES
 ('52000000-0000-4000-8000-000000000001','S5 Admin','ml-s5-admin@example.invalid','admin',true);
INSERT INTO public.league_seasons(id,name,slug,status) VALUES
 ('53000000-0000-4000-8000-000000000001','S5 Season','s5-season','draft');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('54000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','S5 Team A','s5-team-a','55000000-0000-4000-8000-000000000001'),
 ('54000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000001','S5 Team B','s5-team-b','55000000-0000-4000-8000-000000000003');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('55000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','S5 Captain A','51000000-0000-4000-8000-000000000001'),
 ('55000000-0000-4000-8000-000000000002','54000000-0000-4000-8000-000000000001','S5 Player A','51000000-0000-4000-8000-000000000002'),
 ('55000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000002','S5 Captain B','51000000-0000-4000-8000-000000000003'),
 ('55000000-0000-4000-8000-000000000004','54000000-0000-4000-8000-000000000002','S5 Player B','51000000-0000-4000-8000-000000000004');
INSERT INTO public.league_phases(id,season_id,code,name,sequence,status) VALUES
 ('56000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','phase1','Fase 1',1,'draft');
INSERT INTO public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order) VALUES
 ('56000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001',1,1),
 ('56000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000002',2,2);
INSERT INTO public.league_rounds(id,phase_id,round_number,status) VALUES
 ('57000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001',1,'scheduled');
INSERT INTO public.league_matches(id,phase_id,round_id,home_team_id,away_team_id,venue_id,scheduled_at,match_status)
SELECT '58000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000001',
 '54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000002',id,now()+interval '2 hours','scheduled'
FROM public.league_venues ORDER BY code LIMIT 1;
INSERT INTO public.league_match_team_slots(match_id,round_id,team_id,side) VALUES
 ('58000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','home'),
 ('58000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000002','away');
SET CONSTRAINTS ALL IMMEDIATE;
SET LOCAL ROLE service_role;
SET CONSTRAINTS ALL DEFERRED;

DO $test$
DECLARE
  admin constant uuid := '52000000-0000-4000-8000-000000000001';
  captain_a constant uuid := '51000000-0000-4000-8000-000000000001';
  captain_b constant uuid := '51000000-0000-4000-8000-000000000003';
  team_a constant uuid := '54000000-0000-4000-8000-000000000001';
  team_b constant uuid := '54000000-0000-4000-8000-000000000002';
  v_match_id constant uuid := '58000000-0000-4000-8000-000000000001';
  failed boolean; result jsonb; public_row record; context jsonb;
BEGIN
  -- profile ownership and dedicated path checks
  PERFORM public.league_update_team_profile(captain_a,NULL,team_a,'Forza A',
    'monday-league/53000000-0000-4000-8000-000000000001/54000000-0000-4000-8000-000000000001/logo/11111111-1111-4111-8111-111111111111.png',NULL);
  IF (SELECT slogan FROM public.league_teams WHERE id=team_a)<>'Forza A' THEN RAISE EXCEPTION 'S5_ASSERT_PROFILE'; END IF;
  failed:=false; BEGIN PERFORM public.league_update_team_profile(captain_a,NULL,team_b,'No',NULL,NULL);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_CAPTAIN_REQUIRED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S5_ASSERT_OTHER_TEAM'; END IF;

  -- captain roster is editable only while both season and Phase 1 are draft
  PERFORM public.league_captain_replace_roster_preseason(captain_a,team_a,jsonb_build_array(
    jsonb_build_object('player_id','55000000-0000-4000-8000-000000000001','display_name','S5 Captain A'),
    jsonb_build_object('player_id','55000000-0000-4000-8000-000000000002','display_name','S5 Player A edited')));
  failed:=false; BEGIN PERFORM public.league_captain_replace_roster_preseason(captain_a,team_a,
    jsonb_build_array(jsonb_build_object('player_id','55000000-0000-4000-8000-000000000002','display_name','No captain')));
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_CAPTAIN_MUST_REMAIN'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S5_ASSERT_CAPTAIN_REMAINS'; END IF;
  UPDATE public.league_seasons SET status='phase1' WHERE id='53000000-0000-4000-8000-000000000001';
  UPDATE public.league_phases SET status='generated' WHERE id='56000000-0000-4000-8000-000000000001';
  failed:=false; BEGIN PERFORM public.league_captain_replace_roster_preseason(captain_a,team_a,'[]');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_ROSTER_LOCKED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S5_ASSERT_ROSTER_LOCK'; END IF;

  -- before deadline: own visible only to captain context, public response is fully null
  result:=public.league_write_lineup(captain_a,NULL,v_match_id,team_a,
    ARRAY['55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000002']::uuid[],NULL);
  context:=public.league_get_captain_context(captain_a,team_a);
  IF context->'own_lineup' IS NULL OR context->>'opponent_lineup' IS NOT NULL OR NOT (context->>'can_submit_lineup')::boolean THEN
    RAISE EXCEPTION 'S5_ASSERT_CAPTAIN_PRIVACY %',context; END IF;
  SELECT * INTO public_row FROM public.league_get_public_lineups(ARRAY[v_match_id]);
  IF public_row.home_lineup IS NOT NULL OR public_row.away_lineup IS NOT NULL THEN RAISE EXCEPTION 'S5_ASSERT_PUBLIC_PRE_DEADLINE'; END IF;

  -- replacement preserves revision history; exactly two active own players are mandatory
  PERFORM public.league_write_lineup(captain_a,NULL,v_match_id,team_a,
    ARRAY['55000000-0000-4000-8000-000000000002','55000000-0000-4000-8000-000000000001']::uuid[],NULL);
  IF (SELECT count(*) FROM public.league_lineups WHERE match_id=v_match_id AND team_id=team_a)<>2
     OR (SELECT count(*) FROM public.league_lineups WHERE match_id=v_match_id AND team_id=team_a AND status='current')<>1 THEN
    RAISE EXCEPTION 'S5_ASSERT_REVISIONS'; END IF;
  failed:=false; BEGIN PERFORM public.league_write_lineup(captain_a,NULL,v_match_id,team_a,
    ARRAY['55000000-0000-4000-8000-000000000001']::uuid[],NULL);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_LINEUP_EXACTLY_TWO'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S5_ASSERT_EXACT_TWO'; END IF;

  -- DB-time equality/after boundary: captain locked, simultaneous public reveal and missing label
  UPDATE public.league_matches SET scheduled_at=now()+interval '1 hour' WHERE id=v_match_id;
  failed:=false; BEGIN PERFORM public.league_write_lineup(captain_a,NULL,v_match_id,team_a,
    ARRAY['55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000002']::uuid[],NULL);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_LINEUP_LOCKED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S5_ASSERT_DEADLINE_EQUALITY'; END IF;
  SELECT * INTO public_row FROM public.league_get_public_lineups(ARRAY[v_match_id]);
  IF public_row.home_lineup->>'state'<>'submitted' OR public_row.away_lineup->>'state'<>'missing'
     OR public_row.away_lineup->>'label'<>'Formazione non comunicata' THEN RAISE EXCEPTION 'S5_ASSERT_REVEAL_MISSING % %',public_row.home_lineup,public_row.away_lineup; END IF;
  failed:=false; BEGIN PERFORM public.league_write_lineup(NULL,admin,v_match_id,team_b,
    ARRAY['55000000-0000-4000-8000-000000000003','55000000-0000-4000-8000-000000000004']::uuid[],NULL);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_OVERRIDE_REASON_REQUIRED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S5_ASSERT_OVERRIDE_REASON'; END IF;
  PERFORM public.league_write_lineup(NULL,admin,v_match_id,team_b,
    ARRAY['55000000-0000-4000-8000-000000000003','55000000-0000-4000-8000-000000000004']::uuid[],'Correzione verificata');

  -- locked evidence stays locked on reschedule; reopen is bilateral and only with future deadline/reason
  UPDATE public.league_matches SET scheduled_at=now()+interval '3 hours' WHERE id=v_match_id;
  IF (SELECT lineups_locked_at FROM public.league_matches WHERE id=v_match_id) IS NULL THEN RAISE EXCEPTION 'S5_ASSERT_PRESERVE_LOCK'; END IF;
  failed:=false; BEGIN PERFORM public.league_reopen_lineups(admin,v_match_id,'');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_REOPEN_REASON_REQUIRED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S5_ASSERT_REOPEN_REASON'; END IF;
  result:=public.league_reopen_lineups(admin,v_match_id,'Rinvio concordato');
  IF NOT (result#>>'{data,both_teams}')::boolean OR (SELECT lineups_locked_at FROM public.league_matches WHERE id=v_match_id) IS NOT NULL THEN
    RAISE EXCEPTION 'S5_ASSERT_SYMMETRIC_REOPEN'; END IF;

  -- visibility is independent from sporting status
  PERFORM public.league_set_season_visibility(admin,'53000000-0000-4000-8000-000000000001','public');
  IF (SELECT public_visibility FROM public.league_seasons WHERE id='53000000-0000-4000-8000-000000000001')<>'public' THEN RAISE EXCEPTION 'S5_ASSERT_VISIBILITY'; END IF;
END $test$;

-- active delete rejected; completed deletion is idempotent and users survive
DO $delete$
DECLARE failed boolean; result jsonb;
BEGIN
  failed:=false; BEGIN PERFORM public.league_delete_season('52000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001','S5 Season','59000000-0000-4000-8000-000000000001');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_ACTIVE_SEASON_DELETE_FORBIDDEN'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S5_ASSERT_ACTIVE_DELETE'; END IF;
  UPDATE public.league_seasons SET status='completed' WHERE id='53000000-0000-4000-8000-000000000001';
  result:=public.league_delete_season('52000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001','S5 Season','59000000-0000-4000-8000-000000000001');
  IF EXISTS(SELECT 1 FROM public.league_seasons WHERE id='53000000-0000-4000-8000-000000000001')
     OR NOT EXISTS(SELECT 1 FROM public.users WHERE id='51000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'S5_ASSERT_DELETE_ISOLATION'; END IF;
  result:=public.league_delete_season('52000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001','S5 Season','59000000-0000-4000-8000-000000000001');
  IF NOT (result->>'duplicate')::boolean THEN RAISE EXCEPTION 'S5_ASSERT_DELETE_IDEMPOTENCY'; END IF;
END $delete$;

ROLLBACK;
SELECT 'monday_league_stage5_captain_lineups_ok' AS result;
