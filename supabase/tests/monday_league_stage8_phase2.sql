\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('81000000-0000-4000-8000-000000000001','S8 Captain A','+390000010101','s8a@example.invalid','M'),
 ('81000000-0000-4000-8000-000000000002','S8 Captain B','+390000010102','s8b@example.invalid','F'),
 ('81000000-0000-4000-8000-000000000003','S8 Captain C','+390000010103','s8c@example.invalid','M'),
 ('81000000-0000-4000-8000-000000000004','S8 Captain D','+390000010104','s8d@example.invalid','F');
INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES('82000000-0000-4000-8000-000000000001','S8 Admin','s8admin@example.invalid','admin',true);
INSERT INTO public.league_seasons(id,name,slug,status) VALUES('83000000-0000-4000-8000-000000000001','S8 Season','s8-season','phase1');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','Team A','s8-a','85000000-0000-4000-8000-000000000001'),
 ('84000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001','Team B','s8-b','85000000-0000-4000-8000-000000000002'),
 ('84000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000001','Team C','s8-c','85000000-0000-4000-8000-000000000003'),
 ('84000000-0000-4000-8000-000000000004','83000000-0000-4000-8000-000000000001','Team D','s8-d','85000000-0000-4000-8000-000000000004');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('85000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','A','81000000-0000-4000-8000-000000000001'),
 ('85000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000002','B','81000000-0000-4000-8000-000000000002'),
 ('85000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000003','C','81000000-0000-4000-8000-000000000003'),
 ('85000000-0000-4000-8000-000000000004','84000000-0000-4000-8000-000000000004','D','81000000-0000-4000-8000-000000000004');
INSERT INTO public.league_phases(id,season_id,code,name,sequence,status) VALUES('86000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','phase1','Fase 1',1,'in_progress');
INSERT INTO public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order) VALUES
 ('86000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',1,4),
 ('86000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002',2,1),
 ('86000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003',3,3),
 ('86000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000004',4,2);
INSERT INTO public.league_rounds(id,phase_id,round_number,status)
SELECT ('87000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'86000000-0000-4000-8000-000000000001',n,'completed' FROM generate_series(1,6)n;
INSERT INTO public.league_matches(id,phase_id,round_id,home_team_id,away_team_id,match_status)
SELECT x.id::uuid,'86000000-0000-4000-8000-000000000001',x.round_id::uuid,x.h::uuid,x.a::uuid,'confirmed' FROM (VALUES
 ('88000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002'),
 ('88000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003'),
 ('88000000-0000-4000-8000-000000000003','87000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000004'),
 ('88000000-0000-4000-8000-000000000004','87000000-0000-4000-8000-000000000004','84000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000003'),
 ('88000000-0000-4000-8000-000000000005','87000000-0000-4000-8000-000000000005','84000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000004'),
 ('88000000-0000-4000-8000-000000000006','87000000-0000-4000-8000-000000000006','84000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000004'))x(id,round_id,h,a);
INSERT INTO public.league_match_team_slots(match_id,round_id,team_id,side)
SELECT id,round_id,home_team_id,'home' FROM public.league_matches WHERE phase_id='86000000-0000-4000-8000-000000000001'
UNION ALL SELECT id,round_id,away_team_id,'away' FROM public.league_matches WHERE phase_id='86000000-0000-4000-8000-000000000001';
INSERT INTO public.league_result_submissions(id,match_id,revision,status,submitter_type,submitted_by_staff_id,home_sets_won,away_sets_won,home_games_won,away_games_won,confirmed_at)
SELECT ('89000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('88000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,1,'confirmed','staff','82000000-0000-4000-8000-000000000001',2,0,12,4,now() FROM generate_series(1,5)n;
UPDATE public.league_matches m SET current_result_id=r.id FROM public.league_result_submissions r WHERE r.match_id=m.id;
INSERT INTO public.league_match_special_outcomes(id,match_id,revision,outcome_type,winner_team_id,counts_as_played,home_points,away_points,home_win,away_win,home_sets_awarded,away_sets_awarded,home_games_awarded,away_games_awarded,decision_reason,decided_by_staff_id)
VALUES('89000000-0000-4000-8000-000000000006','88000000-0000-4000-8000-000000000006',1,'walkover','84000000-0000-4000-8000-000000000003',true,3,0,true,false,2,0,12,0,'walkover','82000000-0000-4000-8000-000000000001');
UPDATE public.league_matches SET current_special_outcome_id='89000000-0000-4000-8000-000000000006' WHERE id='88000000-0000-4000-8000-000000000006';
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL ROLE service_role;

DO $test$ DECLARE ready jsonb; fp text; ready_fp text; created jsonb; replay jsonb; failed boolean; a uuid:='86000000-0000-4000-8000-00000000000a'; b uuid:='86000000-0000-4000-8000-00000000000b'; phase1_before jsonb; snapshot jsonb;
BEGIN
  -- Every named non-terminal state blocks readiness.
  UPDATE public.league_matches SET current_result_id=NULL,match_status='scheduled' WHERE id='88000000-0000-4000-8000-000000000001';
  IF (public.league_phase2_readiness('83000000-0000-4000-8000-000000000001')->>'ready')::boolean THEN RAISE EXCEPTION 'S8_MISSING_BLOCK'; END IF;
  UPDATE public.league_matches SET current_result_id='89000000-0000-4000-8000-000000000001',match_status='confirmed' WHERE id='88000000-0000-4000-8000-000000000001';
  UPDATE public.league_result_submissions SET status='submitted',confirmed_at=NULL,submitted_at=now() WHERE id='89000000-0000-4000-8000-000000000002';
  IF (public.league_phase2_readiness('83000000-0000-4000-8000-000000000001')->>'ready')::boolean THEN RAISE EXCEPTION 'S8_PROVISIONAL_BLOCK'; END IF;
  UPDATE public.league_result_submissions SET status='confirmed',confirmed_at=now() WHERE id='89000000-0000-4000-8000-000000000002';
  UPDATE public.league_matches SET match_status='postponed' WHERE id='88000000-0000-4000-8000-000000000003';
  IF (public.league_phase2_readiness('83000000-0000-4000-8000-000000000001')->>'ready')::boolean THEN RAISE EXCEPTION 'S8_POSTPONED_BLOCK'; END IF;
  UPDATE public.league_matches SET match_status='confirmed' WHERE id='88000000-0000-4000-8000-000000000003';
  ready_fp:=public.league_phase2_readiness('83000000-0000-4000-8000-000000000001')->>'fingerprint';
  INSERT INTO public.league_result_contests(id,match_id,result_submission_id,opened_by_user_id,reason)
  VALUES('8c000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','Legacy current dispute');
  ready:=public.league_phase2_readiness('83000000-0000-4000-8000-000000000001');
  IF (ready->>'ready')::boolean OR ready->>'fingerprint'=ready_fp THEN RAISE EXCEPTION 'H1_PHASE2_CURRENT_CONTEST_BLOCK'; END IF;
  UPDATE public.league_result_submissions SET status='superseded',confirmed_at=NULL WHERE id='89000000-0000-4000-8000-000000000001';
  INSERT INTO public.league_result_submissions(id,match_id,revision,status,submitter_type,submitted_by_staff_id,correction_reason,home_sets_won,away_sets_won,home_games_won,away_games_won,confirmed_at)
  VALUES('89000000-0000-4000-8000-000000000101','88000000-0000-4000-8000-000000000001',2,'confirmed','staff','82000000-0000-4000-8000-000000000001','Fixture replacement',2,0,12,4,now());
  UPDATE public.league_matches SET current_result_id='89000000-0000-4000-8000-000000000101' WHERE id='88000000-0000-4000-8000-000000000001';
  IF (public.league_phase2_readiness('83000000-0000-4000-8000-000000000001')->>'ready')::boolean THEN RAISE EXCEPTION 'H1_PHASE2_HISTORICAL_CONTEST_BLOCK'; END IF;
  failed:=false; BEGIN PERFORM public.league_generate_phase2('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',ready_fp,a,b,'[]','[]','{}','{}');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM IN ('ML_PHASE1_NOT_READY','ML_PHASE2_STALE_PREVIEW'); END;
  IF NOT failed OR EXISTS(SELECT 1 FROM public.league_phases WHERE season_id='83000000-0000-4000-8000-000000000001' AND code IN('serie_a','serie_b')) THEN RAISE EXCEPTION 'H1_PHASE2_COMMAND_BLOCK'; END IF;
  UPDATE public.league_result_contests SET status='resolved_rejected',resolved_at=now(),resolved_by_staff_id='82000000-0000-4000-8000-000000000001',resolution_note='Resolved' WHERE id='8c000000-0000-4000-8000-000000000001';
  UPDATE public.league_result_submissions SET status='superseded',confirmed_at=NULL WHERE id='89000000-0000-4000-8000-000000000101';
  UPDATE public.league_result_submissions SET status='confirmed',confirmed_at=now() WHERE id='89000000-0000-4000-8000-000000000001';
  UPDATE public.league_matches SET current_result_id='89000000-0000-4000-8000-000000000001' WHERE id='88000000-0000-4000-8000-000000000001';
  IF NOT (public.league_phase2_readiness('83000000-0000-4000-8000-000000000001')->>'ready')::boolean THEN RAISE EXCEPTION 'H1_PHASE2_RESOLVED_DOES_NOT_BLOCK'; END IF;
  ready:=public.league_phase2_readiness('83000000-0000-4000-8000-000000000001'); fp:=ready->>'fingerprint';
  IF NOT (ready->>'ready')::boolean OR (ready->>'terminal_matches')::int<>6 OR jsonb_array_length(ready->'serie_a')<>2 OR jsonb_array_length(ready->'serie_b')<>2 THEN RAISE EXCEPTION 'S8_READY_SPLIT %',ready; END IF;
  phase1_before:=public.league_get_standings('86000000-0000-4000-8000-000000000001');
  created:=public.league_generate_phase2('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',fp,a,b,
    '[{"roundNumber":1,"byeTeamId":null,"matches":[{"homeTeamId":"84000000-0000-4000-8000-000000000001","awayTeamId":"84000000-0000-4000-8000-000000000002"}]}]',
    '[{"roundNumber":1,"byeTeamId":null,"matches":[{"homeTeamId":"84000000-0000-4000-8000-000000000003","awayTeamId":"84000000-0000-4000-8000-000000000004"}]}]',
    '{"invariantViolations":[]}','{"invariantViolations":[]}');
  IF NOT(created->>'created')::boolean OR (SELECT count(*) FROM public.league_phases WHERE season_id='83000000-0000-4000-8000-000000000001' AND code IN('serie_a','serie_b'))<>2 THEN RAISE EXCEPTION 'S8_CREATE'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_matches WHERE phase_id IN(a,b) AND (scheduled_at IS NOT NULL OR venue_id IS NOT NULL))
     OR (SELECT count(*) FROM public.league_matches WHERE phase_id IN(a,b))<>2 THEN RAISE EXCEPTION 'S8_UNSCHEDULED_RR'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_phase_teams pt JOIN public.league_phase_teams src ON src.phase_id='86000000-0000-4000-8000-000000000001' AND src.team_id=pt.team_id WHERE pt.phase_id IN(a,b) AND pt.tie_break_order<>src.tie_break_order) THEN RAISE EXCEPTION 'S8_TIE_BREAK'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.league_get_standings(a)->'rows')x WHERE (x->>'points')::int<>0 OR (x->>'played')::int<>0)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.league_get_standings(b)->'rows')x WHERE (x->>'points')::int<>0 OR (x->>'played')::int<>0) THEN RAISE EXCEPTION 'S8_RESET'; END IF;
  IF (SELECT count(*) FROM public.league_generation_runs gr JOIN public.league_phases p ON p.id=gr.phase_id WHERE p.season_id='83000000-0000-4000-8000-000000000001' AND gr.generation_kind='phase2_split')<>1 THEN RAISE EXCEPTION 'S8_ONE_RUN'; END IF;
  SELECT input_team_order INTO snapshot FROM public.league_generation_runs WHERE generation_kind='phase2_split' AND phase_id=a;
  replay:=public.league_generate_phase2('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',fp,a,b,
    '[]','[]','{}','{}');
  IF NOT(replay->>'replayed')::boolean THEN RAISE EXCEPTION 'S8_REPLAY'; END IF;
  IF (SELECT count(*) FROM public.league_notification_events WHERE event_type='phase2_ready')<>4
     OR NOT EXISTS(SELECT 1 FROM public.league_notification_events WHERE body LIKE '%Serie A%')
     OR NOT EXISTS(SELECT 1 FROM public.league_notification_events WHERE body LIKE '%Serie B%') THEN RAISE EXCEPTION 'S8_NOTIFY'; END IF;
  UPDATE public.league_result_submissions SET home_games_won=13 WHERE id='89000000-0000-4000-8000-000000000001';
  IF snapshot IS DISTINCT FROM (SELECT input_team_order FROM public.league_generation_runs WHERE generation_kind='phase2_split' AND phase_id=a)
     OR (SELECT count(*) FROM public.league_phase_teams WHERE phase_id IN(a,b))<>4 THEN RAISE EXCEPTION 'S8_FROZEN'; END IF;
  failed:=false; BEGIN PERFORM public.league_generate_phase2('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',fp,a,b,'[]','[]','{}','{}'); EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_PHASE2_GENERATION_CONFLICT'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S8_CHANGED_SOURCE_CONFLICT'; END IF;
  IF phase1_before->'rows' IS NULL THEN RAISE EXCEPTION 'S8_HISTORY'; END IF;
  IF NOT (public.league_phase2_completion_readiness('83000000-0000-4000-8000-000000000001')->>'ready')::boolean=false THEN RAISE EXCEPTION 'S8_COMPLETION'; END IF;
END $test$;
SET CONSTRAINTS ALL IMMEDIATE;
RESET ROLE;
DO $security$ BEGIN
 IF has_function_privilege('anon','public.league_generate_phase2(uuid,uuid,text,uuid,uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.league_phase2_readiness(uuid)','EXECUTE') THEN RAISE EXCEPTION 'S8_SECURITY'; END IF;
END $security$;
ROLLBACK;
\echo 'Monday League Stage 8 Phase 2 PASS'
