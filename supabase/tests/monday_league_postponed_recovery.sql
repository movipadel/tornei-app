\set ON_ERROR_STOP on
BEGIN;

-- Synthetic G3/G4 incident. The transaction is always rolled back.
INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('a7100000-0000-4000-8000-000000000001','Recovery Captain A','+390000009701','recovery-a@example.invalid','M'),
 ('a7100000-0000-4000-8000-000000000002','Recovery Player A','+390000009702','recovery-pa@example.invalid','M'),
 ('a7100000-0000-4000-8000-000000000003','Recovery Captain B','+390000009703','recovery-b@example.invalid','F'),
 ('a7100000-0000-4000-8000-000000000004','Recovery Player B','+390000009704','recovery-pb@example.invalid','F'),
 ('a7100000-0000-4000-8000-000000000005','Recovery Captain C','+390000009705','recovery-c@example.invalid','M'),
 ('a7100000-0000-4000-8000-000000000006','Recovery Player C','+390000009706','recovery-pc@example.invalid','M'),
 ('a7100000-0000-4000-8000-000000000007','Recovery Captain D','+390000009707','recovery-d@example.invalid','F'),
 ('a7100000-0000-4000-8000-000000000008','Recovery Player D','+390000009708','recovery-pd@example.invalid','F');
INSERT INTO public.staff_users(id,full_name,email,role,is_active)
 VALUES ('a7200000-0000-4000-8000-000000000001','Recovery Admin','recovery-admin@example.invalid','admin',true);
INSERT INTO public.league_seasons(id,name,slug,status)
 VALUES ('a7300000-0000-4000-8000-000000000001','Recovery Season','recovery-season','phase1');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('a7400000-0000-4000-8000-000000000001','a7300000-0000-4000-8000-000000000001','Recovery A','recovery-a','a7500000-0000-4000-8000-000000000001'),
 ('a7400000-0000-4000-8000-000000000002','a7300000-0000-4000-8000-000000000001','Recovery B','recovery-b','a7500000-0000-4000-8000-000000000003'),
 ('a7400000-0000-4000-8000-000000000003','a7300000-0000-4000-8000-000000000001','Recovery C','recovery-c','a7500000-0000-4000-8000-000000000005'),
 ('a7400000-0000-4000-8000-000000000004','a7300000-0000-4000-8000-000000000001','Recovery D','recovery-d','a7500000-0000-4000-8000-000000000007');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('a7500000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000001','Recovery Captain A','a7100000-0000-4000-8000-000000000001'),
 ('a7500000-0000-4000-8000-000000000002','a7400000-0000-4000-8000-000000000001','Recovery Player A','a7100000-0000-4000-8000-000000000002'),
 ('a7500000-0000-4000-8000-000000000003','a7400000-0000-4000-8000-000000000002','Recovery Captain B','a7100000-0000-4000-8000-000000000003'),
 ('a7500000-0000-4000-8000-000000000004','a7400000-0000-4000-8000-000000000002','Recovery Player B','a7100000-0000-4000-8000-000000000004'),
 ('a7500000-0000-4000-8000-000000000005','a7400000-0000-4000-8000-000000000003','Recovery Captain C','a7100000-0000-4000-8000-000000000005'),
 ('a7500000-0000-4000-8000-000000000006','a7400000-0000-4000-8000-000000000003','Recovery Player C','a7100000-0000-4000-8000-000000000006'),
 ('a7500000-0000-4000-8000-000000000007','a7400000-0000-4000-8000-000000000004','Recovery Captain D','a7100000-0000-4000-8000-000000000007'),
 ('a7500000-0000-4000-8000-000000000008','a7400000-0000-4000-8000-000000000004','Recovery Player D','a7100000-0000-4000-8000-000000000008');
INSERT INTO public.league_phases(id,season_id,code,name,sequence,status)
 VALUES ('a7600000-0000-4000-8000-000000000001','a7300000-0000-4000-8000-000000000001','phase1','Fase 1',1,'in_progress');
INSERT INTO public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order) VALUES
 ('a7600000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000001',1,1),
 ('a7600000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000002',2,2),
 ('a7600000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000003',3,3),
 ('a7600000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000004',4,4);
INSERT INTO public.league_rounds(id,phase_id,round_number,status) VALUES
 ('a7700000-0000-4000-8000-000000000003','a7600000-0000-4000-8000-000000000001',3,'scheduled'),
 ('a7700000-0000-4000-8000-000000000004','a7600000-0000-4000-8000-000000000001',4,'scheduled'),
 ('a7700000-0000-4000-8000-000000000005','a7600000-0000-4000-8000-000000000001',5,'scheduled');
INSERT INTO public.league_matches(id,phase_id,round_id,home_team_id,away_team_id,venue_id,scheduled_at,match_status)
SELECT x.id::uuid,'a7600000-0000-4000-8000-000000000001',x.round_id::uuid,
 x.home_id::uuid,x.away_id::uuid,v.id,now()+x.offset_value,'scheduled'
FROM (VALUES
 ('a7800000-0000-4000-8000-000000000003','a7700000-0000-4000-8000-000000000003','a7400000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000002',interval '4 hours'),
 ('a7800000-0000-4000-8000-000000000007','a7700000-0000-4000-8000-000000000003','a7400000-0000-4000-8000-000000000003','a7400000-0000-4000-8000-000000000004',interval '6 hours'),
 ('a7800000-0000-4000-8000-000000000004','a7700000-0000-4000-8000-000000000004','a7400000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000003',interval '8 hours'),
 ('a7800000-0000-4000-8000-000000000006','a7700000-0000-4000-8000-000000000004','a7400000-0000-4000-8000-000000000002','a7400000-0000-4000-8000-000000000004',interval '9 hours'),
 ('a7800000-0000-4000-8000-000000000005','a7700000-0000-4000-8000-000000000005','a7400000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000004',interval '12 hours')
) x(id,round_id,home_id,away_id,offset_value)
CROSS JOIN LATERAL (SELECT id FROM public.league_venues ORDER BY code LIMIT 1) v;
INSERT INTO public.league_match_team_slots(match_id,round_id,team_id,side)
SELECT id,round_id,home_team_id,'home' FROM public.league_matches WHERE phase_id='a7600000-0000-4000-8000-000000000001'
UNION ALL SELECT id,round_id,away_team_id,'away' FROM public.league_matches WHERE phase_id='a7600000-0000-4000-8000-000000000001';
SET CONSTRAINTS ALL IMMEDIATE;
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  admin constant uuid:='a7200000-0000-4000-8000-000000000001';
  captain_a constant uuid:='a7100000-0000-4000-8000-000000000001';
  captain_b constant uuid:='a7100000-0000-4000-8000-000000000003';
  captain_c constant uuid:='a7100000-0000-4000-8000-000000000005';
  captain_d constant uuid:='a7100000-0000-4000-8000-000000000007';
  team_a constant uuid:='a7400000-0000-4000-8000-000000000001';
  team_b constant uuid:='a7400000-0000-4000-8000-000000000002';
  team_c constant uuid:='a7400000-0000-4000-8000-000000000003';
  team_d constant uuid:='a7400000-0000-4000-8000-000000000004';
  g3 constant uuid:='a7800000-0000-4000-8000-000000000003';
  g3_cd constant uuid:='a7800000-0000-4000-8000-000000000007';
  g4 constant uuid:='a7800000-0000-4000-8000-000000000004';
  g4_b constant uuid:='a7800000-0000-4000-8000-000000000006';
  g5 constant uuid:='a7800000-0000-4000-8000-000000000005';
  a_players constant uuid[]:=ARRAY['a7500000-0000-4000-8000-000000000001','a7500000-0000-4000-8000-000000000002']::uuid[];
  b_players constant uuid[]:=ARRAY['a7500000-0000-4000-8000-000000000003','a7500000-0000-4000-8000-000000000004']::uuid[];
  c_players constant uuid[]:=ARRAY['a7500000-0000-4000-8000-000000000005','a7500000-0000-4000-8000-000000000006']::uuid[];
  d_players constant uuid[]:=ARRAY['a7500000-0000-4000-8000-000000000007','a7500000-0000-4000-8000-000000000008']::uuid[];
  lineups jsonb; results jsonb; before_standings jsonb; after_standings jsonb; v_result jsonb; readiness jsonb; failed boolean;
BEGIN
  -- G3 had an accepted lineup; its original date then passed before postponement.
  PERFORM public.league_write_lineup(captain_a,NULL,g3,team_a,a_players,NULL);
  UPDATE public.league_matches SET scheduled_at=now()-interval '5 days' WHERE id=g3;
  PERFORM public.league_set_match_workflow_state(admin,g3,
    (SELECT schedule_version FROM public.league_matches WHERE id=g3),'postponed','Recupero concordato');
  IF (SELECT match_status FROM public.league_matches WHERE id=g3)<>'postponed'
    OR (SELECT scheduled_at FROM public.league_matches WHERE id=g3) IS NOT NULL
    OR (SELECT round_id FROM public.league_matches WHERE id=g3)<>'a7700000-0000-4000-8000-000000000003'::uuid
    OR (SELECT lineups_locked_at FROM public.league_matches WHERE id=g3) IS NULL
  THEN RAISE EXCEPTION 'RECOVERY_G3_POSTPONE_STATE'; END IF;

  -- Both captains see the future G4 and separate G3 recovery. No LIMIT 1 gate.
  lineups:=public.league_get_captain_lineup_matches(captain_a,team_a);
  IF jsonb_array_length(lineups)<>3
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lineups) x
      WHERE x->>'matchId'=g3::text AND x->>'status'='postponed' AND (x->>'canSubmitLineup')::boolean)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lineups) x
      WHERE x->>'matchId'=g4::text AND x->>'status'='scheduled' AND (x->>'canSubmitLineup')::boolean)
  THEN RAISE EXCEPTION 'RECOVERY_MULTI_MATCH_A %',lineups; END IF;
  lineups:=public.league_get_captain_lineup_matches(captain_b,team_b);
  IF jsonb_array_length(lineups)<>2 OR
    NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lineups) x
      WHERE x->>'matchId'=g4_b::text AND (x->>'canSubmitLineup')::boolean)
  THEN RAISE EXCEPTION 'RECOVERY_MULTI_MATCH_B %',lineups; END IF;
  IF public.league_get_captain_lineup_matches(captain_b,team_a) IS NOT NULL
    OR public.league_get_captain_result_matches(captain_b,team_a) IS NOT NULL
  THEN RAISE EXCEPTION 'RECOVERY_FOREIGN_TEAM_CONTEXT'; END IF;
  failed:=false; BEGIN
    PERFORM public.league_write_lineup(captain_b,NULL,g4,team_a,a_players,NULL);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_CAPTAIN_REQUIRED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'RECOVERY_FOREIGN_TEAM_WRITE'; END IF;

  PERFORM public.league_enqueue_user_notification(
    'lineup_reminder','a7300000-0000-4000-8000-000000000001',captain_a,
    'recovery-fixture:g4:lineup','Formazione da inserire','Apri la G4',
    '/monday-league/team/recovery-a',now(),g4,
    NULL,NULL,'a7600000-0000-4000-8000-000000000001',team_a,'{}'::jsonb);
  IF (SELECT cta_url FROM public.league_notification_events
      WHERE idempotency_key='recovery-fixture:g4:lineup')
      <> '/monday-league/squadre/recovery-a?match='||g4::text
  THEN RAISE EXCEPTION 'RECOVERY_REMINDER_TARGET'; END IF;
  PERFORM public.league_scan_due_notifications(now()+interval '5 hours 30 minutes',100);
  IF NOT EXISTS(SELECT 1 FROM public.league_notification_events
      WHERE match_id=g4 AND event_type='lineup_reminder'
        AND cta_url='/monday-league/squadre/recovery-a?match='||g4::text)
    OR EXISTS(SELECT 1 FROM public.league_notification_events
      WHERE match_id=g3 AND event_type IN ('lineup_reminder','match_reminder','missing_result_reminder'))
  THEN RAISE EXCEPTION 'RECOVERY_DATE_SCANNER'; END IF;

  PERFORM public.league_write_lineup(captain_a,NULL,g4,team_a,a_players,NULL);
  PERFORM public.league_write_lineup(captain_b,NULL,g4_b,team_b,b_players,NULL);
  PERFORM public.league_write_lineup(captain_a,NULL,g3,team_a,ARRAY[a_players[2],a_players[1]],NULL);
  PERFORM public.league_write_lineup(captain_b,NULL,g3,team_b,b_players,NULL);
  IF (SELECT revision FROM public.league_lineups WHERE match_id=g3 AND team_id=team_a AND status='current')<>2
    OR (SELECT revision FROM public.league_lineups WHERE match_id=g4 AND team_id=team_a AND status='current')<>1
    OR (SELECT count(*) FROM public.league_lineups WHERE match_id=g4 AND status='current')<>1
    OR (SELECT count(*) FROM public.league_lineups WHERE match_id=g4_b AND status='current')<>1
  THEN RAISE EXCEPTION 'RECOVERY_LINEUPS_NOT_INDEPENDENT'; END IF;

  -- G5 has both lineups before postponement; they survive and both can revise.
  PERFORM public.league_write_lineup(captain_a,NULL,g5,team_a,a_players,NULL);
  PERFORM public.league_write_lineup(captain_d,NULL,g5,team_d,d_players,NULL);
  PERFORM public.league_set_match_workflow_state(admin,g5,
    (SELECT schedule_version FROM public.league_matches WHERE id=g5),'postponed','Secondo recupero');
  lineups:=public.league_get_captain_lineup_matches(captain_a,team_a);
  IF (SELECT count(*) FROM jsonb_array_elements(lineups) x WHERE x->>'status'='postponed')<>2
  THEN RAISE EXCEPTION 'RECOVERY_TWO_POSTPONED'; END IF;
  PERFORM public.league_write_lineup(captain_a,NULL,g5,team_a,ARRAY[a_players[2],a_players[1]],NULL);
  PERFORM public.league_write_lineup(captain_d,NULL,g5,team_d,ARRAY[d_players[2],d_players[1]],NULL);
  IF (SELECT count(*) FROM public.league_lineups WHERE match_id=g5 AND status='current')<>2
    OR (SELECT count(*) FROM public.league_lineups WHERE match_id=g5 AND revision=2)<>2
  THEN RAISE EXCEPTION 'RECOVERY_BOTH_PRESERVED_AND_REVISED'; END IF;

  -- A separate recovery began with neither lineup; a first submission still works.
  PERFORM public.league_set_match_workflow_state(admin,g3_cd,
    (SELECT schedule_version FROM public.league_matches WHERE id=g3_cd),'postponed','Nuovo recupero');
  IF EXISTS(SELECT 1 FROM public.league_lineups WHERE match_id=g3_cd)
  THEN RAISE EXCEPTION 'RECOVERY_EMPTY_INITIAL_LINEUPS'; END IF;
  PERFORM public.league_write_lineup(captain_c,NULL,g3_cd,team_c,c_players,NULL);
  IF (SELECT count(*) FROM public.league_lineups WHERE match_id=g3_cd AND status='current')<>1
  THEN RAISE EXCEPTION 'RECOVERY_FIRST_LINEUP_WITHOUT_DATE'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_notification_events
    WHERE match_id=g3 AND event_type IN ('lineup_reminder','match_reminder','missing_result_reminder'))
  THEN RAISE EXCEPTION 'RECOVERY_POSTPONED_DATE_REMINDER'; END IF;

  -- The old G3 has no points until the canonical result is submitted.
  before_standings:=public.league_get_standings('a7600000-0000-4000-8000-000000000001');
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(before_standings->'rows') x WHERE (x->>'points')::int<>0)
  THEN RAISE EXCEPTION 'RECOVERY_PREMATURE_POINTS'; END IF;
  readiness:=public.league_phase2_readiness('a7300000-0000-4000-8000-000000000001');
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(readiness->'blocking_matches') x
    WHERE x->>'match_id'=g3::text AND x->>'reason'='Partita rinviata')
  THEN RAISE EXCEPTION 'RECOVERY_PHASE_PREMATURELY_READY %',readiness; END IF;
  results:=public.league_get_captain_result_matches(captain_a,team_a);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(results) x
    WHERE x->>'matchId'=g3::text AND (x->>'canSubmitResult')::boolean)
  THEN RAISE EXCEPTION 'RECOVERY_RESULT_CONTEXT %',results; END IF;
  failed:=false; BEGIN
    PERFORM public.league_captain_submit_result(captain_b,g3,'[{"homeGames":6,"awayGames":2},{"homeGames":6,"awayGames":3}]');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_HOME_CAPTAIN_REQUIRED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'RECOVERY_AWAY_RESULT_AUTH'; END IF;
  v_result:=public.league_captain_submit_result(captain_a,g3,
    '[{"homeGames":6,"awayGames":2},{"homeGames":6,"awayGames":3}]');
  IF (v_result->>'status')<>'submitted'
    OR (SELECT match_status FROM public.league_matches WHERE id=g3)<>'submitted'
  THEN RAISE EXCEPTION 'RECOVERY_RESULT_SUBMISSION'; END IF;
  after_standings:=public.league_get_standings('a7600000-0000-4000-8000-000000000001');
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(after_standings->'rows') x
    WHERE x->>'team_id'=team_a::text AND (x->>'points')::int=3)
  THEN RAISE EXCEPTION 'RECOVERY_STANDINGS_AFTER_RESULT'; END IF;
  lineups:=public.league_get_captain_lineup_matches(captain_a,team_a);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(lineups) x WHERE x->>'matchId'=g3::text)
  THEN RAISE EXCEPTION 'RECOVERY_TERMINAL_LINEUP_VISIBLE'; END IF;
  failed:=false; BEGIN
    PERFORM public.league_write_lineup(captain_a,NULL,g3,team_a,a_players,NULL);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_LINEUP_LOCKED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'RECOVERY_TERMINAL_LINEUP_WRITE'; END IF;
  PERFORM public.league_admin_confirm_result(admin,g3,(v_result->>'result_id')::uuid);
  IF (SELECT match_status FROM public.league_matches WHERE id=g3)<>'confirmed'
    OR (SELECT round_id FROM public.league_matches WHERE id=g3)<>'a7700000-0000-4000-8000-000000000003'::uuid
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.league_get_captain_lineup_matches(captain_a,team_a)) x
      WHERE x->>'matchId'=g3::text)
  THEN RAISE EXCEPTION 'RECOVERY_CONFIRMED_TERMINAL'; END IF;
END $test$;

ROLLBACK;
SELECT 'monday_league_postponed_recovery_ok' AS result;
