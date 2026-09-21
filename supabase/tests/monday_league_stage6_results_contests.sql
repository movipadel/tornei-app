\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('61000000-0000-4000-8000-000000000001','S6 Home Captain','+390000008101','ml-s6-home@example.invalid','M'),
 ('61000000-0000-4000-8000-000000000002','S6 Away Captain','+390000008102','ml-s6-away@example.invalid','F'),
 ('61000000-0000-4000-8000-000000000003','S6 Other Captain','+390000008103','ml-s6-other@example.invalid','M'),
 ('61000000-0000-4000-8000-000000000004','S6 Fourth Captain','+390000008104','ml-s6-fourth@example.invalid','F'),
 ('61000000-0000-4000-8000-000000000005','S6 Ordinary Player','+390000008105','ml-s6-player@example.invalid','M');
INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES
 ('62000000-0000-4000-8000-000000000001','S6 Admin','ml-s6-admin@example.invalid','admin',true);
INSERT INTO public.league_seasons(id,name,slug,status) VALUES
 ('63000000-0000-4000-8000-000000000001','S6 Season','s6-season','phase1');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('64000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','S6 Team A','s6-team-a','65000000-0000-4000-8000-000000000001'),
 ('64000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000001','S6 Team B','s6-team-b','65000000-0000-4000-8000-000000000002'),
 ('64000000-0000-4000-8000-000000000003','63000000-0000-4000-8000-000000000001','S6 Team C','s6-team-c','65000000-0000-4000-8000-000000000003'),
 ('64000000-0000-4000-8000-000000000004','63000000-0000-4000-8000-000000000001','S6 Team D','s6-team-d','65000000-0000-4000-8000-000000000004');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('65000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','S6 Home Captain','61000000-0000-4000-8000-000000000001'),
 ('65000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000002','S6 Away Captain','61000000-0000-4000-8000-000000000002'),
 ('65000000-0000-4000-8000-000000000003','64000000-0000-4000-8000-000000000003','S6 Other Captain','61000000-0000-4000-8000-000000000003'),
 ('65000000-0000-4000-8000-000000000004','64000000-0000-4000-8000-000000000004','S6 Fourth Captain','61000000-0000-4000-8000-000000000004'),
 ('65000000-0000-4000-8000-000000000005','64000000-0000-4000-8000-000000000001','S6 Ordinary Player','61000000-0000-4000-8000-000000000005');
INSERT INTO public.league_phases(id,season_id,code,name,sequence,status) VALUES
 ('66000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','phase1','Fase 1',1,'in_progress');
INSERT INTO public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order) VALUES
 ('66000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001',1,1),
 ('66000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000002',2,2),
 ('66000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000003',3,3),
 ('66000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000004',4,4);
INSERT INTO public.league_rounds(id,phase_id,round_number,status) VALUES
 ('67000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001',1,'scheduled'),
 ('67000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000001',2,'scheduled'),
 ('67000000-0000-4000-8000-000000000003','66000000-0000-4000-8000-000000000001',3,'scheduled');
INSERT INTO public.league_matches(id,phase_id,round_id,home_team_id,away_team_id,venue_id,scheduled_at,match_status)
SELECT x.id::uuid,'66000000-0000-4000-8000-000000000001',x.round_id::uuid,x.home_id::uuid,x.away_id::uuid,v.id,
       now()+x.offset_value,x.status
FROM (VALUES
 ('68000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000002',interval '-6 hours','scheduled'),
 ('68000000-0000-4000-8000-000000000002','67000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000003','64000000-0000-4000-8000-000000000004',interval '-5 hours','scheduled'),
 ('68000000-0000-4000-8000-000000000003','67000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000003',interval '2 hours','scheduled'),
 ('68000000-0000-4000-8000-000000000004','67000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000004',interval '-4 hours','scheduled'),
 ('68000000-0000-4000-8000-000000000005','67000000-0000-4000-8000-000000000003','64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000004',interval '-3 hours','scheduled'),
 ('68000000-0000-4000-8000-000000000006','67000000-0000-4000-8000-000000000003','64000000-0000-4000-8000-000000000003','64000000-0000-4000-8000-000000000002',interval '-2 hours','scheduled')
) x(id,round_id,home_id,away_id,offset_value,status)
CROSS JOIN LATERAL (SELECT id FROM public.league_venues ORDER BY code LIMIT 1) v;
INSERT INTO public.league_match_team_slots(match_id,round_id,team_id,side)
SELECT id,round_id,home_team_id,'home' FROM public.league_matches WHERE phase_id='66000000-0000-4000-8000-000000000001'
UNION ALL SELECT id,round_id,away_team_id,'away' FROM public.league_matches WHERE phase_id='66000000-0000-4000-8000-000000000001';
SET CONSTRAINTS ALL IMMEDIATE;
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  admin constant uuid:='62000000-0000-4000-8000-000000000001';
  home constant uuid:='61000000-0000-4000-8000-000000000001';
  away constant uuid:='61000000-0000-4000-8000-000000000002';
  other constant uuid:='61000000-0000-4000-8000-000000000003';
  ordinary constant uuid:='61000000-0000-4000-8000-000000000005';
  m1 constant uuid:='68000000-0000-4000-8000-000000000001';
  m2 constant uuid:='68000000-0000-4000-8000-000000000002';
  m3 constant uuid:='68000000-0000-4000-8000-000000000003';
  m4 constant uuid:='68000000-0000-4000-8000-000000000004';
  m5 constant uuid:='68000000-0000-4000-8000-000000000005';
  m6 constant uuid:='68000000-0000-4000-8000-000000000006';
  result jsonb; result_id uuid; contest_id uuid; corrected_id uuid; failed boolean; standings jsonb; before_points jsonb;
BEGIN
  -- Home captain legal 2-0; immutable duplicate and unauthorized callers.
  result:=public.league_captain_submit_result(home,m1,'[{"homeGames":6,"awayGames":2},{"homeGames":7,"awayGames":5}]');
  result_id:=(result->>'result_id')::uuid;
  IF (SELECT submitter_type FROM public.league_result_submissions WHERE id=result_id)<>'captain'
     OR public.league_effective_result_status(result_id)<>'submitted' THEN RAISE EXCEPTION 'S6_ASSERT_CAPTAIN_SUBMIT'; END IF;
  standings:=public.league_get_standings('66000000-0000-4000-8000-000000000001');
  IF NOT (standings->>'has_provisional_results')::boolean
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(standings->'rows') x WHERE x->>'team_id'='64000000-0000-4000-8000-000000000001' AND (x->>'points')::int=3) THEN
    RAISE EXCEPTION 'S6_ASSERT_IMMEDIATE_STANDINGS'; END IF;
  failed:=false; BEGIN PERFORM public.league_captain_submit_result(home,m1,'[{"homeGames":6,"awayGames":0},{"homeGames":6,"awayGames":0}]');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM IN ('ML_RESULT_SUBMISSION_NOT_OPEN','ML_RESULT_ALREADY_EXISTS'); END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_DUPLICATE_SUBMIT'; END IF;
  failed:=false; BEGIN PERFORM public.league_captain_submit_result(away,m1,'[{"homeGames":6,"awayGames":0},{"homeGames":6,"awayGames":0}]');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_HOME_CAPTAIN_REQUIRED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_AWAY_SUBMIT'; END IF;
  failed:=false; BEGIN PERFORM public.league_captain_submit_result(ordinary,m5,'[{"homeGames":6,"awayGames":0},{"homeGames":6,"awayGames":0}]');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_HOME_CAPTAIN_REQUIRED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_ORDINARY_SUBMIT'; END IF;
  failed:=false; BEGIN PERFORM public.league_captain_submit_result(home,m3,'[{"homeGames":6,"awayGames":0},{"homeGames":6,"awayGames":0}]');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_RESULT_SUBMISSION_NOT_OPEN'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_BEFORE_START'; END IF;

  -- Only away captain can contest and reason is immutable/mandatory.
  failed:=false; BEGIN PERFORM public.league_away_captain_contest_result(home,m1,result_id,'No');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_AWAY_CAPTAIN_REQUIRED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_HOME_CONTEST'; END IF;
  failed:=false; BEGIN PERFORM public.league_away_captain_contest_result(other,m1,result_id,'No');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_AWAY_CAPTAIN_REQUIRED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_OTHER_CONTEST'; END IF;
  failed:=false; BEGIN PERFORM public.league_away_captain_contest_result(away,m1,result_id,'   ');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_CONTEST_REASON_INVALID'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_REASON_REQUIRED'; END IF;
  result:=public.league_away_captain_contest_result(away,m1,result_id,'Punteggio non corretto');
  contest_id:=(result->>'contest_id')::uuid;
  IF public.league_effective_result_status(result_id)<>'contested' OR (SELECT reason FROM public.league_result_contests WHERE id=contest_id)<>'Punteggio non corretto' THEN
    RAISE EXCEPTION 'S6_ASSERT_CONTEST'; END IF;
  standings:=public.league_get_standings('66000000-0000-4000-8000-000000000001');
  IF NOT (standings->>'has_provisional_results')::boolean THEN RAISE EXCEPTION 'S6_ASSERT_CONTEST_STANDINGS'; END IF;
  failed:=false; BEGIN PERFORM public.league_away_captain_contest_result(away,m1,result_id,'Retry');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM IN ('ML_CONTEST_NOT_OPEN','ML_CONTEST_ALREADY_OPEN'); END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_DUPLICATE_CONTEST'; END IF;

  -- Pre-release H1: no generic admin command may replace an outcome or silently
  -- resolve the dispute. Walkover, no-show and administrative paths are explicit.
  failed:=false; BEGIN PERFORM public.league_admin_correct_result(admin,m1,result_id,'contested','[{"homeGames":6,"awayGames":0},{"homeGames":6,"awayGames":0}]','Direct correction');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='OPEN_CONTEST_REQUIRES_RESOLUTION'; END;
  IF NOT failed THEN RAISE EXCEPTION 'H1_ASSERT_CORRECTION_BLOCK'; END IF;
  failed:=false; BEGIN PERFORM public.league_set_match_special_outcome(admin,m1,result_id,NULL,'walkover','64000000-0000-4000-8000-000000000001',true,3,0,true,false,2,0,12,0,'Walkover');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='OPEN_CONTEST_REQUIRES_RESOLUTION'; END;
  IF NOT failed THEN RAISE EXCEPTION 'H1_ASSERT_WALKOVER_BLOCK'; END IF;
  failed:=false; BEGIN PERFORM public.league_set_match_special_outcome(admin,m1,result_id,NULL,'no_show','64000000-0000-4000-8000-000000000001',true,3,0,true,false,2,0,12,0,'No show');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='OPEN_CONTEST_REQUIRES_RESOLUTION'; END;
  IF NOT failed THEN RAISE EXCEPTION 'H1_ASSERT_NO_SHOW_BLOCK'; END IF;
  failed:=false; BEGIN PERFORM public.league_set_match_special_outcome(admin,m1,result_id,NULL,'administrative',NULL,false,0,0,false,false,0,0,0,0,'Admin ruling');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='OPEN_CONTEST_REQUIRES_RESOLUTION'; END;
  IF NOT failed THEN RAISE EXCEPTION 'H1_ASSERT_ADMIN_OUTCOME_BLOCK'; END IF;
  failed:=false; BEGIN PERFORM public.league_set_match_workflow_state(admin,m1,1,'cancelled','Workflow replacement');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='OPEN_CONTEST_REQUIRES_RESOLUTION'; END;
  IF NOT failed THEN RAISE EXCEPTION 'H1_ASSERT_WORKFLOW_BLOCK'; END IF;
  IF (SELECT status FROM public.league_result_contests WHERE id=contest_id)<>'open'
     OR (SELECT status FROM public.league_result_submissions WHERE id=result_id)<>'contested'
     OR (SELECT current_result_id FROM public.league_matches WHERE id=m1)<>result_id THEN
    RAISE EXCEPTION 'H1_ASSERT_OPEN_CONTEST_PRESERVED'; END IF;

  -- Reject keeps the exact revision and finalizes it.
  PERFORM public.league_admin_resolve_contest(admin,m1,result_id,contest_id,'reject','[]','Referto verificato');
  IF (SELECT current_result_id FROM public.league_matches WHERE id=m1)<>result_id
     OR (SELECT status FROM public.league_result_submissions WHERE id=result_id)<>'confirmed'
     OR (SELECT status FROM public.league_result_contests WHERE id=contest_id)<>'resolved_rejected' THEN
    RAISE EXCEPTION 'S6_ASSERT_REJECT'; END IF;
  PERFORM public.league_set_match_special_outcome(admin,m1,result_id,NULL,'administrative',NULL,false,0,0,false,false,0,0,0,0,'Post-resolution ruling');
  IF (SELECT current_special_outcome_id IS NULL FROM public.league_matches WHERE id=m1) THEN
    RAISE EXCEPTION 'H1_ASSERT_RESOLVED_ALLOWS_REPLACEMENT'; END IF;

  -- 2-1 is legal; DB-time boundary is open at 47:59:59 and closed at equality/after.
  result:=public.league_captain_submit_result(other,m2,'[{"homeGames":6,"awayGames":4},{"homeGames":4,"awayGames":6},{"homeGames":7,"awayGames":6}]');
  result_id:=(result->>'result_id')::uuid;
  UPDATE public.league_result_submissions SET submitted_at=now()-interval '47 hours 59 minutes 59 seconds' WHERE id=result_id;
  IF public.league_effective_result_status(result_id)<>'submitted' THEN RAISE EXCEPTION 'S6_ASSERT_475959'; END IF;
  UPDATE public.league_result_submissions SET submitted_at=now()-interval '48 hours' WHERE id=result_id;
  IF public.league_effective_result_status(result_id)<>'confirmed' THEN RAISE EXCEPTION 'S6_ASSERT_EXACT_48_FINAL'; END IF;
  failed:=false; BEGIN PERFORM public.league_away_captain_contest_result('61000000-0000-4000-8000-000000000004',m2,result_id,'Too late');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_CONTEST_DEADLINE_EXPIRED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_EXACT_48_REJECT'; END IF;
  UPDATE public.league_result_submissions SET submitted_at=now()-interval '48 hours 1 second' WHERE id=result_id;
  before_points:=public.league_get_standings('66000000-0000-4000-8000-000000000001');
  PERFORM public.league_finalize_expired_result(result_id);
  PERFORM public.league_finalize_expired_result(result_id);
  IF (SELECT status FROM public.league_result_submissions WHERE id=result_id)<>'confirmed'
     OR before_points->'rows' IS DISTINCT FROM (public.league_get_standings('66000000-0000-4000-8000-000000000001')->'rows') THEN
    RAISE EXCEPTION 'S6_ASSERT_FINALIZE_IDEMPOTENT_STANDINGS'; END IF;

  -- Accept + correct creates a new final immutable revision linked to old contest.
  result:=public.league_captain_submit_result(away,m4,'[{"homeGames":6,"awayGames":1},{"homeGames":6,"awayGames":2}]');
  result_id:=(result->>'result_id')::uuid;
  result:=public.league_away_captain_contest_result('61000000-0000-4000-8000-000000000004',m4,result_id,'Set invertiti');
  contest_id:=(result->>'contest_id')::uuid;
  result:=public.league_admin_resolve_contest(admin,m4,result_id,contest_id,'correct','[{"homeGames":1,"awayGames":6},{"homeGames":2,"awayGames":6}]','Verifica firmata');
  corrected_id:=(result->>'result_id')::uuid;
  IF (SELECT status FROM public.league_result_submissions WHERE id=result_id)<>'superseded'
     OR (SELECT status FROM public.league_result_submissions WHERE id=corrected_id)<>'confirmed'
     OR (SELECT revision FROM public.league_result_submissions WHERE id=corrected_id)<>2
     OR (SELECT result_submission_id FROM public.league_result_contests WHERE id=contest_id)<>result_id THEN
    RAISE EXCEPTION 'S6_ASSERT_ACCEPT_CORRECT_HISTORY'; END IF;
  failed:=false; BEGIN PERFORM public.league_admin_resolve_contest(admin,m4,result_id,contest_id,'reject','[]','Stale');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM IN ('ML_RESULT_VERSION_CONFLICT','ML_CONTEST_VERSION_CONFLICT'); END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_STALE_RESOLUTION'; END IF;

  -- Admin correction of final creates another final revision; reason required.
  failed:=false; BEGIN PERFORM public.league_admin_correct_result(admin,m4,corrected_id,'confirmed','[{"homeGames":6,"awayGames":0},{"homeGames":6,"awayGames":0}]','');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_RESULT_CORRECTION_REASON_REQUIRED'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_CORRECTION_REASON'; END IF;
  result:=public.league_admin_correct_result(admin,m4,corrected_id,'confirmed','[{"homeGames":6,"awayGames":0},{"homeGames":6,"awayGames":0}]','Correzione admin');
  IF (result->>'status')<>'confirmed' OR (result->>'revision')::int<>3 THEN RAISE EXCEPTION 'S6_ASSERT_FINAL_CORRECTION'; END IF;

  -- Special outcome blocks normal captain score; resulted match cannot be rescheduled.
  PERFORM public.league_set_match_special_outcome(admin,m5,NULL,NULL,'walkover','64000000-0000-4000-8000-000000000001',true,3,0,true,false,2,0,12,0,'Assenza');
  failed:=false; BEGIN PERFORM public.league_captain_submit_result(home,m5,'[{"homeGames":6,"awayGames":0},{"homeGames":6,"awayGames":0}]');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM IN ('ML_RESULT_SUBMISSION_NOT_OPEN','ML_RESULT_ALREADY_EXISTS'); END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_SPECIAL_BLOCK'; END IF;
  failed:=false; BEGIN UPDATE public.league_matches SET scheduled_at=scheduled_at+interval '1 day' WHERE id=m1;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_RESULTED_MATCH_RESCHEDULE_FORBIDDEN'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_RESCHEDULE_BLOCK'; END IF;

  -- Illegal score still delegates to Stage 3 validator; audit evidence exists.
  failed:=false; BEGIN PERFORM public.league_captain_submit_result(other,m6,'[{"homeGames":6,"awayGames":5},{"homeGames":6,"awayGames":0}]');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN failed:=SQLERRM='ML_RESULT_SET_SCORE_INVALID'; END;
  IF NOT failed THEN RAISE EXCEPTION 'S6_ASSERT_ILLEGAL_SCORE'; END IF;
  IF (SELECT count(*) FROM public.league_audit_events WHERE season_id='63000000-0000-4000-8000-000000000001'
      AND event_type IN ('captain_result_submitted','result_contested','contest_rejected','contest_corrected','result_corrected','result_auto_finalized'))<8 THEN
    RAISE EXCEPTION 'S6_ASSERT_AUDIT'; END IF;
END $test$;

DO $security$
BEGIN
  IF has_table_privilege('anon','public.league_result_contests','SELECT')
     OR has_function_privilege('authenticated','public.league_captain_submit_result(uuid,uuid,jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.league_away_captain_contest_result(uuid,uuid,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'S6_ASSERT_SECURITY'; END IF;
END $security$;

ROLLBACK;
SELECT 'monday_league_stage6_results_contests: ok' AS result;
