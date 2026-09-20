\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('91000000-0000-4000-8000-000000000001','S9 Captain A','+390000010201','s9a@example.invalid','M'),
 ('91000000-0000-4000-8000-000000000002','S9 Captain B','+390000010202','s9b@example.invalid','F'),
 ('91000000-0000-4000-8000-000000000003','S9 Captain C','+390000010203','s9c@example.invalid','M'),
 ('91000000-0000-4000-8000-000000000004','S9 Captain D','+390000010204','s9d@example.invalid','F'),
 ('91000000-0000-4000-8000-000000000009','Unrelated User','+390000010209','s9unrelated@example.invalid','M');
INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES('92000000-0000-4000-8000-000000000001','S9 Admin','s9admin@example.invalid','admin',true);
INSERT INTO public.league_seasons(id,name,slug,status,public_visibility,published_at)
VALUES('93000000-0000-4000-8000-000000000001','S9 Season','s9-season','phase2','public',now());
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Team A','s9-a','95000000-0000-4000-8000-000000000001'),
 ('94000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001','Team B','s9-b','95000000-0000-4000-8000-000000000002'),
 ('94000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000001','Team C','s9-c','95000000-0000-4000-8000-000000000003'),
 ('94000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000001','Team D','s9-d','95000000-0000-4000-8000-000000000004');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','A','91000000-0000-4000-8000-000000000001'),
 ('95000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000002','B','91000000-0000-4000-8000-000000000002'),
 ('95000000-0000-4000-8000-000000000003','94000000-0000-4000-8000-000000000003','C','91000000-0000-4000-8000-000000000003'),
 ('95000000-0000-4000-8000-000000000004','94000000-0000-4000-8000-000000000004','D','91000000-0000-4000-8000-000000000004');
INSERT INTO public.league_phases(id,season_id,code,name,sequence,status,source_phase_id,algorithm_version,generation_fingerprint,generated_at,finalized_at,finalized_by_staff_id) VALUES
 ('96000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','phase1','Fase 1',1,'finalized',NULL,NULL,NULL,NULL,now(),'92000000-0000-4000-8000-000000000001'),
 ('96000000-0000-4000-8000-00000000000a','93000000-0000-4000-8000-000000000001','serie_a','Serie A',2,'in_progress','96000000-0000-4000-8000-000000000001','circle-ha-v1',repeat('a',64),now(),NULL,NULL),
 ('96000000-0000-4000-8000-00000000000b','93000000-0000-4000-8000-000000000001','serie_b','Serie B',3,'in_progress','96000000-0000-4000-8000-000000000001','circle-ha-v1',repeat('b',64),now(),NULL,NULL);
INSERT INTO public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order,source_phase_position) VALUES
 ('96000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',1,1,NULL),
 ('96000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002',2,2,NULL),
 ('96000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000003',3,3,NULL),
 ('96000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000004',4,4,NULL),
 ('96000000-0000-4000-8000-00000000000a','94000000-0000-4000-8000-000000000001',1,1,1),
 ('96000000-0000-4000-8000-00000000000a','94000000-0000-4000-8000-000000000002',2,2,2),
 ('96000000-0000-4000-8000-00000000000b','94000000-0000-4000-8000-000000000003',1,3,3),
 ('96000000-0000-4000-8000-00000000000b','94000000-0000-4000-8000-000000000004',2,4,4);
INSERT INTO public.league_rounds(id,phase_id,round_number,status) VALUES
 ('97000000-0000-4000-8000-00000000000a','96000000-0000-4000-8000-00000000000a',1,'completed'),
 ('97000000-0000-4000-8000-00000000000b','96000000-0000-4000-8000-00000000000b',1,'completed');
INSERT INTO public.league_matches(id,phase_id,round_id,home_team_id,away_team_id,match_status) VALUES
 ('98000000-0000-4000-8000-00000000000a','96000000-0000-4000-8000-00000000000a','97000000-0000-4000-8000-00000000000a','94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002','confirmed'),
 ('98000000-0000-4000-8000-00000000000b','96000000-0000-4000-8000-00000000000b','97000000-0000-4000-8000-00000000000b','94000000-0000-4000-8000-000000000003','94000000-0000-4000-8000-000000000004','confirmed');
INSERT INTO public.league_match_team_slots(match_id,round_id,team_id,side) VALUES
 ('98000000-0000-4000-8000-00000000000a','97000000-0000-4000-8000-00000000000a','94000000-0000-4000-8000-000000000001','home'),
 ('98000000-0000-4000-8000-00000000000a','97000000-0000-4000-8000-00000000000a','94000000-0000-4000-8000-000000000002','away'),
 ('98000000-0000-4000-8000-00000000000b','97000000-0000-4000-8000-00000000000b','94000000-0000-4000-8000-000000000003','home'),
 ('98000000-0000-4000-8000-00000000000b','97000000-0000-4000-8000-00000000000b','94000000-0000-4000-8000-000000000004','away');
INSERT INTO public.league_result_submissions(id,match_id,revision,status,submitter_type,submitted_by_staff_id,home_sets_won,away_sets_won,home_games_won,away_games_won,confirmed_at)
VALUES('99000000-0000-4000-8000-00000000000a','98000000-0000-4000-8000-00000000000a',1,'confirmed','staff','92000000-0000-4000-8000-000000000001',2,0,12,4,now());
UPDATE public.league_matches SET current_result_id='99000000-0000-4000-8000-00000000000a' WHERE id='98000000-0000-4000-8000-00000000000a';
INSERT INTO public.league_match_special_outcomes(id,match_id,revision,outcome_type,winner_team_id,counts_as_played,home_points,away_points,home_win,away_win,home_sets_awarded,away_sets_awarded,home_games_awarded,away_games_awarded,decision_reason,decided_by_staff_id)
VALUES('99000000-0000-4000-8000-00000000000b','98000000-0000-4000-8000-00000000000b',1,'walkover','94000000-0000-4000-8000-000000000003',true,3,0,true,false,2,0,12,0,'walkover','92000000-0000-4000-8000-000000000001');
UPDATE public.league_matches SET current_special_outcome_id='99000000-0000-4000-8000-00000000000b' WHERE id='98000000-0000-4000-8000-00000000000b';
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL ROLE service_role;

DO $test$ DECLARE ready jsonb; fp text; first jsonb; replay jsonb; completed_at_before timestamptz; standings_a jsonb; failed boolean;
BEGIN
  ready:=public.league_phase2_completion_readiness('93000000-0000-4000-8000-000000000001');
  IF NOT(ready->>'ready')::boolean OR (ready->'serie_a'->>'terminal_matches')::int<>1 OR (ready->'serie_b'->>'terminal_matches')::int<>1 THEN RAISE EXCEPTION 'S9_READY'; END IF;
  UPDATE public.league_matches SET current_result_id=NULL,match_status='scheduled' WHERE id='98000000-0000-4000-8000-00000000000a';
  IF (public.league_phase2_completion_readiness('93000000-0000-4000-8000-000000000001')->>'ready')::boolean THEN RAISE EXCEPTION 'S9_MISSING'; END IF;
  UPDATE public.league_matches SET current_result_id='99000000-0000-4000-8000-00000000000a',match_status='confirmed' WHERE id='98000000-0000-4000-8000-00000000000a';
  UPDATE public.league_result_submissions SET status='submitted',confirmed_at=NULL WHERE id='99000000-0000-4000-8000-00000000000a';
  IF (public.league_phase2_completion_readiness('93000000-0000-4000-8000-000000000001')->>'ready')::boolean THEN RAISE EXCEPTION 'S9_PROVISIONAL'; END IF;
  UPDATE public.league_result_submissions SET status='confirmed',confirmed_at=now() WHERE id='99000000-0000-4000-8000-00000000000a';
  UPDATE public.league_matches SET match_status='postponed' WHERE id='98000000-0000-4000-8000-00000000000b';
  IF (public.league_phase2_completion_readiness('93000000-0000-4000-8000-000000000001')->>'ready')::boolean THEN RAISE EXCEPTION 'S9_POSTPONED'; END IF;
  UPDATE public.league_matches SET match_status='suspended' WHERE id='98000000-0000-4000-8000-00000000000b';
  IF (public.league_phase2_completion_readiness('93000000-0000-4000-8000-000000000001')->>'ready')::boolean THEN RAISE EXCEPTION 'S9_SUSPENDED'; END IF;
  UPDATE public.league_matches SET match_status='confirmed' WHERE id='98000000-0000-4000-8000-00000000000b';
  standings_a:=public.league_get_standings('96000000-0000-4000-8000-00000000000a')->'rows';
  ready:=public.league_phase2_completion_readiness('93000000-0000-4000-8000-000000000001'); fp:=ready->>'fingerprint';
  INSERT INTO public.league_notification_events(event_type,season_id,match_id,team_id,recipient_user_id,idempotency_key,due_at,title,body,payload)
  VALUES
   ('lineup_reminder','93000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-00000000000a','94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','s9-lineup',now()+interval '1 day','x','x','{"schedule_version":0}'),
   ('match_reminder','93000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-00000000000a','94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','s9-match',now()+interval '1 day','x','x','{"schedule_version":0}'),
   ('missing_result_reminder','93000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-00000000000a','94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','s9-result',now()+interval '1 day','x','x','{"schedule_version":0}');
  first:=public.league_complete_season('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',fp);
  IF NOT(first->>'created')::boolean OR (SELECT status FROM public.league_seasons WHERE id='93000000-0000-4000-8000-000000000001')<>'completed' THEN RAISE EXCEPTION 'S9_COMPLETE'; END IF;
  SELECT completed_at INTO completed_at_before FROM public.league_seasons WHERE id='93000000-0000-4000-8000-000000000001';
  replay:=public.league_complete_season('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',fp);
  IF NOT(replay->>'replayed')::boolean OR completed_at_before IS DISTINCT FROM (SELECT completed_at FROM public.league_seasons WHERE id='93000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'S9_REPLAY'; END IF;
  IF (SELECT count(*) FROM public.league_audit_events WHERE season_id='93000000-0000-4000-8000-000000000001' AND event_type='season_completed')<>1 THEN RAISE EXCEPTION 'S9_AUDIT'; END IF;
  IF standings_a IS DISTINCT FROM public.league_get_standings('96000000-0000-4000-8000-00000000000a')->'rows' THEN RAISE EXCEPTION 'S9_STANDINGS'; END IF;
  IF (SELECT count(*) FROM public.league_notification_events WHERE season_id='93000000-0000-4000-8000-000000000001' AND event_type='season_completed')<>4
     OR EXISTS(SELECT 1 FROM public.league_notification_events WHERE idempotency_key IN('s9-lineup','s9-match','s9-result') AND status<>'skipped') THEN RAISE EXCEPTION 'S9_NOTIFICATIONS'; END IF;
  failed:=false; BEGIN UPDATE public.league_matches SET match_status='scheduled' WHERE id='98000000-0000-4000-8000-00000000000a'; EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_SEASON_SPORTING_LOCKED'; END; IF NOT failed THEN RAISE EXCEPTION 'S9_SCHEDULE_LOCK'; END IF;
  failed:=false; BEGIN UPDATE public.league_result_submissions SET home_games_won=13 WHERE id='99000000-0000-4000-8000-00000000000a'; EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_SEASON_SPORTING_LOCKED'; END; IF NOT failed THEN RAISE EXCEPTION 'S9_RESULT_LOCK'; END IF;
  failed:=false; BEGIN INSERT INTO public.league_result_contests(match_id,result_submission_id,opened_by_user_id,reason) VALUES('98000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000a','91000000-0000-4000-8000-000000000002','late'); EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_SEASON_SPORTING_LOCKED'; END; IF NOT failed THEN RAISE EXCEPTION 'S9_CONTEST_LOCK'; END IF;
  PERFORM public.league_archive_season('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');
  IF (SELECT status FROM public.league_seasons WHERE id='93000000-0000-4000-8000-000000000001')<>'archived' OR NOT EXISTS(SELECT 1 FROM public.league_matches WHERE id='98000000-0000-4000-8000-00000000000a') THEN RAISE EXCEPTION 'S9_ARCHIVE'; END IF;
  PERFORM public.league_delete_season('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','S9 Season','9d000000-0000-4000-8000-000000000001');
  IF EXISTS(SELECT 1 FROM public.league_seasons WHERE id='93000000-0000-4000-8000-000000000001')
     OR EXISTS(SELECT 1 FROM public.league_phases WHERE season_id='93000000-0000-4000-8000-000000000001')
     OR NOT EXISTS(SELECT 1 FROM public.users WHERE id='91000000-0000-4000-8000-000000000009') THEN RAISE EXCEPTION 'S9_DELETE_ISOLATION'; END IF;
END $test$;
RESET ROLE;
DO $security$ BEGIN
 IF has_function_privilege('anon','public.league_complete_season(uuid,uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.league_phase2_completion_readiness(uuid)','EXECUTE') THEN RAISE EXCEPTION 'S9_SECURITY'; END IF;
END $security$;
ROLLBACK;
\echo 'Monday League Stage 9 Completion PASS'
