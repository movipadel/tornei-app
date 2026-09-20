\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('41000000-0000-4000-8000-000000000001','S3 Captain 1','+390000006101','ml-s3-1@example.invalid','M'),
 ('41000000-0000-4000-8000-000000000002','S3 Captain 2','+390000006102','ml-s3-2@example.invalid','F'),
 ('41000000-0000-4000-8000-000000000003','S3 Captain 3','+390000006103','ml-s3-3@example.invalid','M'),
 ('41000000-0000-4000-8000-000000000004','S3 Captain 4','+390000006104','ml-s3-4@example.invalid','F');
INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES
 ('42000000-0000-4000-8000-000000000001','S3 Admin','ml-s3-admin@example.invalid','admin',true);
INSERT INTO public.league_seasons(id,name,slug,status) VALUES
 ('43000000-0000-4000-8000-000000000001','S3 Season','s3-season','phase1');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('44000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','S3 Team 1','s3-team-1','45000000-0000-4000-8000-000000000001'),
 ('44000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000001','S3 Team 2','s3-team-2','45000000-0000-4000-8000-000000000002'),
 ('44000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000001','S3 Team 3','s3-team-3','45000000-0000-4000-8000-000000000003'),
 ('44000000-0000-4000-8000-000000000004','43000000-0000-4000-8000-000000000001','S3 Team 4','s3-team-4','45000000-0000-4000-8000-000000000004');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('45000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','S3 Captain 1','41000000-0000-4000-8000-000000000001'),
 ('45000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-000000000002','S3 Captain 2','41000000-0000-4000-8000-000000000002'),
 ('45000000-0000-4000-8000-000000000003','44000000-0000-4000-8000-000000000003','S3 Captain 3','41000000-0000-4000-8000-000000000003'),
 ('45000000-0000-4000-8000-000000000004','44000000-0000-4000-8000-000000000004','S3 Captain 4','41000000-0000-4000-8000-000000000004');
INSERT INTO public.league_phases(id,season_id,code,name,sequence,status) VALUES
 ('46000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','phase1','Phase 1',1,'generated');
INSERT INTO public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order) VALUES
 ('46000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001',1,3),
 ('46000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000002',2,1),
 ('46000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000003',3,4),
 ('46000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000004',4,2);
INSERT INTO public.league_rounds(id,phase_id,round_number) VALUES
 ('47000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000001',1),
 ('47000000-0000-4000-8000-000000000002','46000000-0000-4000-8000-000000000001',2),
 ('47000000-0000-4000-8000-000000000003','46000000-0000-4000-8000-000000000001',3);
INSERT INTO public.league_matches(id,phase_id,round_id,home_team_id,away_team_id) VALUES
 ('48000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000004'),
 ('48000000-0000-4000-8000-000000000002','46000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-000000000003'),
 ('48000000-0000-4000-8000-000000000003','46000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-000000000004','44000000-0000-4000-8000-000000000003'),
 ('48000000-0000-4000-8000-000000000004','46000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000002'),
 ('48000000-0000-4000-8000-000000000005','46000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000003','44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-000000000004'),
 ('48000000-0000-4000-8000-000000000006','46000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000003','44000000-0000-4000-8000-000000000003','44000000-0000-4000-8000-000000000001');
INSERT INTO public.league_match_team_slots(match_id,round_id,team_id,side)
SELECT id,round_id,home_team_id,'home' FROM public.league_matches WHERE phase_id='46000000-0000-4000-8000-000000000001'
UNION ALL SELECT id,round_id,away_team_id,'away' FROM public.league_matches WHERE phase_id='46000000-0000-4000-8000-000000000001';
SET CONSTRAINTS ALL IMMEDIATE;
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  actor constant uuid := '42000000-0000-4000-8000-000000000001';
  phase constant uuid := '46000000-0000-4000-8000-000000000001';
  r1 constant uuid := '47000000-0000-4000-8000-000000000001';
  r2 constant uuid := '47000000-0000-4000-8000-000000000002';
  r3 constant uuid := '47000000-0000-4000-8000-000000000003';
  m1 constant uuid := '48000000-0000-4000-8000-000000000001';
  m2 constant uuid := '48000000-0000-4000-8000-000000000002';
  m3 constant uuid := '48000000-0000-4000-8000-000000000003';
  m4 constant uuid := '48000000-0000-4000-8000-000000000004';
  m5 constant uuid := '48000000-0000-4000-8000-000000000005';
  m6 constant uuid := '48000000-0000-4000-8000-000000000006';
  slot_c20 uuid; slot_m20 uuid; slot_ce1930 uuid;
  err boolean; result jsonb; old_result uuid; new_result uuid; standings jsonb;
BEGIN
  SELECT s.id INTO slot_c20 FROM public.league_venue_slots s JOIN public.league_venues v ON v.id=s.venue_id WHERE v.code='COSTIGLIOLE' AND s.local_time='20:00';
  SELECT s.id INTO slot_m20 FROM public.league_venue_slots s JOIN public.league_venues v ON v.id=s.venue_id WHERE v.code='MANTA' AND s.local_time='20:00';
  SELECT s.id INTO slot_ce1930 FROM public.league_venue_slots s JOIN public.league_venues v ON v.id=s.venue_id WHERE v.code='CENTALLO' AND s.local_time='19:30';

  err:=false; BEGIN
    PERFORM public.league_set_round_dates(actor,phase,jsonb_build_array(jsonb_build_object('roundId',r1,'expectedScheduleVersion',1,'playDate','2026-10-20')));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM='ML_ROUND_DATE_NOT_MONDAY'; END;
  IF NOT err THEN RAISE EXCEPTION 'S3_ASSERT_NON_MONDAY'; END IF;

  PERFORM public.league_set_round_dates(actor,phase,jsonb_build_array(
    jsonb_build_object('roundId',r1,'expectedScheduleVersion',1,'playDate','2026-10-19'),
    jsonb_build_object('roundId',r2,'expectedScheduleVersion',1,'playDate','2026-10-26'),
    jsonb_build_object('roundId',r3,'expectedScheduleVersion',1,'playDate','2026-11-09')));
  IF (SELECT play_date FROM public.league_rounds WHERE id=r3)<>'2026-11-09' OR EXISTS(SELECT 1 FROM public.league_rounds WHERE phase_id=phase AND extract(isodow FROM play_date)<>1) THEN RAISE EXCEPTION 'S3_ASSERT_ATOMIC_DATES'; END IF;

  standings:=public.league_get_standings(phase);
  IF standings#>>'{rows,0,team_id}'<>'44000000-0000-4000-8000-000000000002' OR jsonb_array_length(standings->'rows')<>4 THEN RAISE EXCEPTION 'S3_ASSERT_ZERO_ROWS_TIE_ORDER'; END IF;

  result:=public.league_schedule_round(actor,r1,2,'2026-10-19',jsonb_build_array(
    jsonb_build_object('matchId',m1,'venueSlotId',slot_c20),jsonb_build_object('matchId',m2,'venueSlotId',slot_m20)));
  IF (result->>'scheduled_matches')::int<>2 OR (SELECT scheduled_at FROM public.league_matches WHERE id=m1)<>'2026-10-19 18:00:00+00'::timestamptz THEN RAISE EXCEPTION 'S3_ASSERT_OFFICIAL_SLOT_TIMEZONE'; END IF;

  result:=public.league_schedule_round(actor,r2,2,'2026-10-26',jsonb_build_array(
    jsonb_build_object('matchId',m3,'venueSlotId',slot_ce1930),jsonb_build_object('matchId',m4,'venueSlotId',NULL)));
  IF (result->>'scheduled_matches')::int<>1 OR (SELECT status FROM public.league_rounds WHERE id=r2)<>'scheduling' OR (SELECT scheduled_at FROM public.league_matches WHERE id=m3)<>'2026-10-26 18:30:00+00'::timestamptz THEN RAISE EXCEPTION 'S3_ASSERT_PARTIAL_CET'; END IF;

  err:=false; BEGIN PERFORM public.league_schedule_round(actor,r1,2,'2026-10-19','[]'); EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM='ML_SCHEDULE_VERSION_CONFLICT'; END; IF NOT err THEN RAISE EXCEPTION 'S3_ASSERT_STALE_VERSION'; END IF;
  err:=false; BEGIN PERFORM public.league_schedule_round(actor,r3,2,'2026-11-09',jsonb_build_array(jsonb_build_object('matchId',m5,'venueSlotId',slot_c20),jsonb_build_object('matchId',m6,'venueSlotId',slot_c20))); EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM='ML_SCHEDULE_SLOT_DUPLICATE'; END; IF NOT err THEN RAISE EXCEPTION 'S3_ASSERT_DUPLICATE_SLOT'; END IF;
  err:=false; BEGIN PERFORM public.league_schedule_round(actor,r3,2,'2026-11-09',jsonb_build_array(jsonb_build_object('matchId',m5,'venueSlotId','ffffffff-ffff-4fff-8fff-ffffffffffff'),jsonb_build_object('matchId',m6,'venueSlotId',NULL))); EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM='ML_OFFICIAL_SLOT_INVALID'; END; IF NOT err THEN RAISE EXCEPTION 'S3_ASSERT_UNOFFICIAL_SLOT'; END IF;

  err:=false; BEGIN PERFORM public.league_validate_match_sets('[{"homeGames":6,"awayGames":5},{"homeGames":6,"awayGames":4}]'); EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM='ML_RESULT_SET_SCORE_INVALID'; END; IF NOT err THEN RAISE EXCEPTION 'S3_ASSERT_ILLEGAL_SET'; END IF;
  err:=false; BEGIN PERFORM public.league_validate_match_sets('[{"homeGames":6,"awayGames":1},{"homeGames":6,"awayGames":2},{"homeGames":6,"awayGames":3}]'); EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM='ML_RESULT_MATCH_SCORE_INVALID'; END; IF NOT err THEN RAISE EXCEPTION 'S3_ASSERT_EXTRA_THIRD'; END IF;
  err:=false; BEGIN PERFORM public.league_validate_match_sets('[{"homeGames":6,"awayGames":4},{"homeGames":4,"awayGames":6}]'); EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM='ML_RESULT_MATCH_SCORE_INVALID'; END; IF NOT err THEN RAISE EXCEPTION 'S3_ASSERT_MISSING_THIRD'; END IF;

  result:=public.league_admin_submit_result(actor,m1,'[{"homeGames":6,"awayGames":4},{"homeGames":7,"awayGames":5}]'); old_result:=(result->>'result_id')::uuid;
  IF (SELECT (home_sets_won,away_sets_won,home_games_won,away_games_won) FROM public.league_result_submissions WHERE id=old_result)<>(2,0,13,9) THEN RAISE EXCEPTION 'S3_ASSERT_RESULT_TOTALS_20'; END IF;
  standings:=public.league_get_standings(phase); IF NOT (standings->>'has_provisional_results')::boolean OR (SELECT (standings#>>'{rows,0,points}')::int)<>3 THEN RAISE EXCEPTION 'S3_ASSERT_PROVISIONAL_30'; END IF;
  err:=false; BEGIN PERFORM public.league_admin_submit_result(actor,m1,'[{"homeGames":6,"awayGames":0},{"homeGames":6,"awayGames":0}]'); EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM IN ('ML_RESULT_MATCH_STATE_INVALID','ML_RESULT_ALREADY_EXISTS'); END; IF NOT err THEN RAISE EXCEPTION 'S3_ASSERT_DUPLICATE_RESULT'; END IF;

  result:=public.league_admin_correct_result(actor,m1,old_result,'submitted','[{"homeGames":6,"awayGames":4},{"homeGames":4,"awayGames":6},{"homeGames":7,"awayGames":6}]','Errore referto'); new_result:=(result->>'result_id')::uuid;
  IF (SELECT status FROM public.league_result_submissions WHERE id=old_result)<>'superseded' OR (SELECT revision FROM public.league_result_submissions WHERE id=new_result)<>2 THEN RAISE EXCEPTION 'S3_ASSERT_REVISION'; END IF;
  err:=false; BEGIN PERFORM public.league_admin_correct_result(actor,m1,old_result,'submitted','[{"homeGames":6,"awayGames":0},{"homeGames":6,"awayGames":0}]','Stale'); EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM='ML_RESULT_VERSION_CONFLICT'; END; IF NOT err THEN RAISE EXCEPTION 'S3_ASSERT_CORRECTION_CONFLICT'; END IF;
  PERFORM public.league_admin_confirm_result(actor,m1,new_result);
  standings:=public.league_get_standings(phase);
  IF (standings->>'has_provisional_results')::boolean OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(standings->'rows') x WHERE x->>'team_id'='44000000-0000-4000-8000-000000000001' AND (x->>'points')::int=2 AND (x->>'sets_won')::int=2 AND (x->>'games_won')::int=17) THEN RAISE EXCEPTION 'S3_ASSERT_CONFIRMED_21_CURRENT_ONLY'; END IF;

  PERFORM public.league_set_match_special_outcome(actor,m2,NULL,NULL,'walkover','44000000-0000-4000-8000-000000000003',true,0,3,false,true,0,2,0,12,'Assenza avversaria');
  IF EXISTS(SELECT 1 FROM public.league_match_sets s JOIN public.league_result_submissions r ON r.id=s.result_submission_id WHERE r.match_id=m2) THEN RAISE EXCEPTION 'S3_ASSERT_NO_FAKE_SETS'; END IF;
  standings:=public.league_get_standings(phase);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(standings->'rows') x WHERE x->>'team_id'='44000000-0000-4000-8000-000000000003' AND (x->>'points')::int=3 AND (x->>'sets_won')::int=2 AND (x->>'games_won')::int=12) THEN RAISE EXCEPTION 'S3_ASSERT_WALKOVER_CONTRIBUTION'; END IF;
  err:=false; BEGIN PERFORM public.league_set_match_special_outcome(actor,m6,NULL,NULL,'walkover','44000000-0000-4000-8000-000000000003',true,2,0,true,false,2,0,12,0,'Invalid'); EXCEPTION WHEN SQLSTATE 'P0001' THEN err:=SQLERRM='ML_SPECIAL_OUTCOME_INVALID'; END; IF NOT err THEN RAISE EXCEPTION 'S3_ASSERT_IMPOSSIBLE_RULING'; END IF;

  PERFORM public.league_set_match_workflow_state(actor,m3,2,'suspended','Interruzione');
  PERFORM public.league_set_match_workflow_state(actor,m4,2,'postponed','Maltempo');
  PERFORM public.league_set_match_workflow_state(actor,m5,1,'cancelled','Decisione admin');
  standings:=public.league_get_standings(phase);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(standings->'rows') x WHERE (x->>'played')::int>2) THEN RAISE EXCEPTION 'S3_ASSERT_ZERO_IMPACT_STATES'; END IF;
  IF (SELECT count(*) FROM public.league_audit_events WHERE season_id='43000000-0000-4000-8000-000000000001' AND event_type IN ('round_date_changed','round_schedule_saved','result_submitted','result_corrected','result_confirmed','special_outcome_set','match_workflow_changed'))<12 THEN RAISE EXCEPTION 'S3_ASSERT_AUDIT'; END IF;
END
$test$;

DO $security$
BEGIN
 IF has_table_privilege('anon','public.league_result_submissions','SELECT') OR has_function_privilege('authenticated','public.league_get_standings(uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.league_schedule_round(uuid,uuid,integer,date,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'S3_ASSERT_SECURITY'; END IF;
END
$security$;

ROLLBACK;
SELECT 'monday_league_stage3_scheduling_results: ok' AS result;
