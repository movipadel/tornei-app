\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('a1100000-0000-4000-8000-000000000001','H3 Captain A','+390000013101','h3-a@example.invalid','M'),
 ('a1100000-0000-4000-8000-000000000002','H3 Captain B','+390000013102','h3-b@example.invalid','F'),
 ('a1100000-0000-4000-8000-000000000003','H3 Captain C','+390000013103','h3-c@example.invalid','M'),
 ('a1100000-0000-4000-8000-000000000004','H3 Captain D','+390000013104','h3-d@example.invalid','F'),
 ('a1100000-0000-4000-8000-000000000005','H3 Captain E','+390000013105','h3-e@example.invalid','M'),
 ('a1100000-0000-4000-8000-000000000006','H3 Captain F','+390000013106','h3-f@example.invalid','F');
INSERT INTO public.staff_users(id,full_name,email,role,is_active)
VALUES('a1200000-0000-4000-8000-000000000001','H3 Admin','h3-admin@example.invalid','admin',true);
INSERT INTO public.league_seasons(id,name,slug,status,public_visibility)
VALUES('a1300000-0000-4000-8000-000000000001','H3 Season','h3-season','phase1','hidden');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('a1400000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','H3 Team A','h3-a','a1500000-0000-4000-8000-000000000001'),
 ('a1400000-0000-4000-8000-000000000002','a1300000-0000-4000-8000-000000000001','H3 Team B','h3-b','a1500000-0000-4000-8000-000000000002'),
 ('a1400000-0000-4000-8000-000000000003','a1300000-0000-4000-8000-000000000001','H3 Team C','h3-c','a1500000-0000-4000-8000-000000000003'),
 ('a1400000-0000-4000-8000-000000000004','a1300000-0000-4000-8000-000000000001','H3 Team D','h3-d','a1500000-0000-4000-8000-000000000004'),
 ('a1400000-0000-4000-8000-000000000005','a1300000-0000-4000-8000-000000000001','H3 Team E','h3-e','a1500000-0000-4000-8000-000000000005'),
 ('a1400000-0000-4000-8000-000000000006','a1300000-0000-4000-8000-000000000001','H3 Team F','h3-f','a1500000-0000-4000-8000-000000000006');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('a1500000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001','H3 A','a1100000-0000-4000-8000-000000000001'),
 ('a1500000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000002','H3 B','a1100000-0000-4000-8000-000000000002'),
 ('a1500000-0000-4000-8000-000000000003','a1400000-0000-4000-8000-000000000003','H3 C','a1100000-0000-4000-8000-000000000003'),
 ('a1500000-0000-4000-8000-000000000004','a1400000-0000-4000-8000-000000000004','H3 D','a1100000-0000-4000-8000-000000000004'),
 ('a1500000-0000-4000-8000-000000000005','a1400000-0000-4000-8000-000000000005','H3 E','a1100000-0000-4000-8000-000000000005'),
 ('a1500000-0000-4000-8000-000000000006','a1400000-0000-4000-8000-000000000006','H3 F','a1100000-0000-4000-8000-000000000006');
INSERT INTO public.league_phases(id,season_id,code,name,sequence,status,source_phase_id,algorithm_version,generation_fingerprint,generated_at) VALUES
 ('a1600000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','phase1','Fase 1',1,'in_progress',NULL,NULL,NULL,NULL),
 ('a1600000-0000-4000-8000-00000000000a','a1300000-0000-4000-8000-000000000001','serie_a','Serie A',2,'generated','a1600000-0000-4000-8000-000000000001','circle-ha-v1',repeat('a',64),now()),
 ('a1600000-0000-4000-8000-00000000000b','a1300000-0000-4000-8000-000000000001','serie_b','Serie B',3,'generated','a1600000-0000-4000-8000-000000000001','circle-ha-v1',repeat('b',64),now());
INSERT INTO public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order) VALUES
 ('a1600000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001',1,1),
 ('a1600000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000002',2,2),
 ('a1600000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000003',3,3),
 ('a1600000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000004',4,4),
 ('a1600000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000005',5,5),
 ('a1600000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000006',6,6),
 ('a1600000-0000-4000-8000-00000000000a','a1400000-0000-4000-8000-000000000001',1,1),
 ('a1600000-0000-4000-8000-00000000000a','a1400000-0000-4000-8000-000000000002',2,2),
 ('a1600000-0000-4000-8000-00000000000a','a1400000-0000-4000-8000-000000000005',3,5),
 ('a1600000-0000-4000-8000-00000000000b','a1400000-0000-4000-8000-000000000003',1,3),
 ('a1600000-0000-4000-8000-00000000000b','a1400000-0000-4000-8000-000000000004',2,4),
 ('a1600000-0000-4000-8000-00000000000b','a1400000-0000-4000-8000-000000000006',3,6);
INSERT INTO public.league_rounds(id,phase_id,round_number,status) VALUES
 ('a1700000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001',1,'scheduled'),
 ('a1700000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000001',2,'scheduled'),
 ('a1700000-0000-4000-8000-000000000003','a1600000-0000-4000-8000-000000000001',3,'scheduled'),
 ('a1700000-0000-4000-8000-00000000000a','a1600000-0000-4000-8000-00000000000a',1,'scheduled'),
 ('a1700000-0000-4000-8000-00000000001a','a1600000-0000-4000-8000-00000000000a',2,'scheduled'),
 ('a1700000-0000-4000-8000-00000000000b','a1600000-0000-4000-8000-00000000000b',1,'scheduled'),
 ('a1700000-0000-4000-8000-00000000001b','a1600000-0000-4000-8000-00000000000b',2,'scheduled');
INSERT INTO public.league_matches(id,phase_id,round_id,home_team_id,away_team_id,venue_id,scheduled_at,match_status)
SELECT x.id::uuid,x.phase_id::uuid,x.round_id::uuid,x.home_id::uuid,x.away_id::uuid,v.id,now()+x.offset_value,x.status
FROM (VALUES
 ('a1800000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001','a1700000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000001',interval '-4 days','submitted'),
 ('a1800000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000001','a1700000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000003',interval '2 days','scheduled'),
 ('a1800000-0000-4000-8000-000000000003','a1600000-0000-4000-8000-000000000001','a1700000-0000-4000-8000-000000000003','a1400000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000004',interval '-1 day','cancelled'),
 ('a1800000-0000-4000-8000-00000000000a','a1600000-0000-4000-8000-00000000000a','a1700000-0000-4000-8000-00000000000a','a1400000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000001',interval '-2 days','confirmed'),
 ('a1800000-0000-4000-8000-00000000001a','a1600000-0000-4000-8000-00000000000a','a1700000-0000-4000-8000-00000000001a','a1400000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000005',interval '3 days','scheduled'),
 ('a1800000-0000-4000-8000-00000000000b','a1600000-0000-4000-8000-00000000000b','a1700000-0000-4000-8000-00000000000b','a1400000-0000-4000-8000-000000000004','a1400000-0000-4000-8000-000000000003',interval '-2 days 1 hour','confirmed'),
 ('a1800000-0000-4000-8000-00000000001b','a1600000-0000-4000-8000-00000000000b','a1700000-0000-4000-8000-00000000001b','a1400000-0000-4000-8000-000000000003','a1400000-0000-4000-8000-000000000006',interval '3 days 1 hour','scheduled')
) x(id,phase_id,round_id,home_id,away_id,offset_value,status)
CROSS JOIN LATERAL (SELECT id FROM public.league_venues ORDER BY code LIMIT 1) v;
INSERT INTO public.league_match_team_slots(match_id,round_id,team_id,side)
SELECT id,round_id,home_team_id,'home' FROM public.league_matches WHERE phase_id IN('a1600000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-00000000000a','a1600000-0000-4000-8000-00000000000b')
UNION ALL
SELECT id,round_id,away_team_id,'away' FROM public.league_matches WHERE phase_id IN('a1600000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-00000000000a','a1600000-0000-4000-8000-00000000000b');
INSERT INTO public.league_result_submissions(id,match_id,revision,status,submitter_type,submitted_by_user_id,home_sets_won,away_sets_won,home_games_won,away_games_won,submitted_at)
VALUES('a1900000-0000-4000-8000-000000000001','a1800000-0000-4000-8000-000000000001',1,'submitted','captain','a1100000-0000-4000-8000-000000000002',2,0,12,5,now()-interval '47 hours 59 minutes 59 seconds');
INSERT INTO public.league_result_submissions(id,match_id,revision,status,submitter_type,submitted_by_staff_id,home_sets_won,away_sets_won,home_games_won,away_games_won,submitted_at,confirmed_at) VALUES
 ('a1900000-0000-4000-8000-00000000000a','a1800000-0000-4000-8000-00000000000a',1,'confirmed','staff','a1200000-0000-4000-8000-000000000001',2,0,12,4,now()-interval '3 days',now()-interval '2 days'),
 ('a1900000-0000-4000-8000-00000000000b','a1800000-0000-4000-8000-00000000000b',1,'confirmed','staff','a1200000-0000-4000-8000-000000000001',2,0,12,4,now()-interval '3 days',now()-interval '2 days');
UPDATE public.league_matches m SET current_result_id=r.id FROM public.league_result_submissions r WHERE r.match_id=m.id;
SET CONSTRAINTS ALL IMMEDIATE;
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  captain_a constant uuid:='a1100000-0000-4000-8000-000000000001';
  captain_c constant uuid:='a1100000-0000-4000-8000-000000000003';
  team_a constant uuid:='a1400000-0000-4000-8000-000000000001';
  team_c constant uuid:='a1400000-0000-4000-8000-000000000003';
  old_match constant uuid:='a1800000-0000-4000-8000-000000000001';
  next_p1 constant uuid:='a1800000-0000-4000-8000-000000000002';
  old_result constant uuid:='a1900000-0000-4000-8000-000000000001';
  ctx jsonb; result_ctx jsonb;
BEGIN
  -- 47:59:59 remains relevant to the away captain and the Stage 6 contest context.
  ctx:=public.league_get_captain_context(captain_a,team_a);
  result_ctx:=public.league_get_captain_result_context(captain_a,team_a);
  IF ctx->>'match_id'<>old_match::text OR result_ctx->>'match_id'<>old_match::text
     OR NOT (result_ctx->>'can_contest_result')::boolean THEN RAISE EXCEPTION 'H3_475959 % %',ctx,result_ctx; END IF;

  -- Equality closes the contest window and advances to the next Phase 1 fixture.
  UPDATE public.league_result_submissions SET submitted_at=now()-interval '48 hours' WHERE id=old_result;
  ctx:=public.league_get_captain_context(captain_a,team_a);
  IF ctx->>'match_id'<>next_p1::text OR NOT (ctx->>'can_submit_lineup')::boolean
     OR (ctx->>'lineup_locked')::boolean THEN RAISE EXCEPTION 'H3_EXACT_48 %',ctx; END IF;
  UPDATE public.league_result_submissions SET submitted_at=now()-interval '48 hours 1 second' WHERE id=old_result;
  IF public.league_get_captain_context(captain_a,team_a)->>'match_id'<>next_p1::text THEN RAISE EXCEPTION 'H3_480001'; END IF;

  -- An open contest preserves relevance; resolving it allows advancement.
  INSERT INTO public.league_result_contests(id,match_id,result_submission_id,opened_by_user_id,reason)
  VALUES('a1c00000-0000-4000-8000-000000000001',old_match,old_result,captain_a,'H3 open contest');
  ctx:=public.league_get_captain_context(captain_a,team_a);
  result_ctx:=public.league_get_captain_result_context(captain_a,team_a);
  IF ctx->>'match_id'<>old_match::text OR result_ctx->>'match_id'<>old_match::text
     OR NOT (result_ctx->>'contest_submitted')::boolean THEN RAISE EXCEPTION 'H3_OPEN_CONTEST % %',ctx,result_ctx; END IF;
  UPDATE public.league_result_contests SET status='resolved_rejected',resolved_at=now(),resolved_by_staff_id='a1200000-0000-4000-8000-000000000001',resolution_note='Resolved'
    WHERE id='a1c00000-0000-4000-8000-000000000001';
  IF public.league_get_captain_context(captain_a,team_a)->>'match_id'<>next_p1::text THEN RAISE EXCEPTION 'H3_RESOLVED'; END IF;

  -- Persisted confirmation and every authoritative special outcome skip the old match.
  UPDATE public.league_result_submissions SET status='confirmed',confirmed_at=now() WHERE id=old_result;
  UPDATE public.league_matches SET match_status='confirmed' WHERE id=old_match;
  IF public.league_get_captain_context(captain_a,team_a)->>'match_id'<>next_p1::text THEN RAISE EXCEPTION 'H3_CONFIRMED'; END IF;
  UPDATE public.league_matches SET current_result_id=NULL,current_special_outcome_id=NULL WHERE id=old_match;
  INSERT INTO public.league_match_special_outcomes(id,match_id,revision,outcome_type,winner_team_id,counts_as_played,home_points,away_points,home_win,away_win,home_sets_awarded,away_sets_awarded,home_games_awarded,away_games_awarded,decision_reason,decided_by_staff_id)
  VALUES('a1d00000-0000-4000-8000-000000000001',old_match,1,'walkover','a1400000-0000-4000-8000-000000000002',true,3,0,true,false,2,0,12,0,'H3 terminal','a1200000-0000-4000-8000-000000000001');
  UPDATE public.league_matches SET current_special_outcome_id='a1d00000-0000-4000-8000-000000000001' WHERE id=old_match;
  IF public.league_get_captain_context(captain_a,team_a)->>'match_id'<>next_p1::text THEN RAISE EXCEPTION 'H3_WALKOVER'; END IF;
  UPDATE public.league_match_special_outcomes SET outcome_type='no_show' WHERE id='a1d00000-0000-4000-8000-000000000001';
  IF public.league_get_captain_context(captain_a,team_a)->>'match_id'<>next_p1::text THEN RAISE EXCEPTION 'H3_NO_SHOW'; END IF;
  UPDATE public.league_match_special_outcomes SET outcome_type='administrative' WHERE id='a1d00000-0000-4000-8000-000000000001';
  IF public.league_get_captain_context(captain_a,team_a)->>'match_id'<>next_p1::text THEN RAISE EXCEPTION 'H3_ADMINISTRATIVE'; END IF;

  -- A past home match without a result still takes priority and exposes result submission.
  UPDATE public.league_matches SET match_status='scheduled',created_at=now()-interval '5 days' WHERE id='a1800000-0000-4000-8000-000000000003';
  ctx:=public.league_get_captain_context(captain_a,team_a);
  result_ctx:=public.league_get_captain_result_context(captain_a,team_a);
  IF ctx->>'match_id'<>'a1800000-0000-4000-8000-000000000003' OR result_ctx->>'match_id'<>'a1800000-0000-4000-8000-000000000003'
     OR NOT (result_ctx->>'can_submit_result')::boolean THEN RAISE EXCEPTION 'H3_HOME_RESULT % %',ctx,result_ctx; END IF;
  UPDATE public.league_matches SET match_status='cancelled' WHERE id='a1800000-0000-4000-8000-000000000003';

  -- Phase 1 history stays closed while Phase 2 and successive division fixtures advance.
  UPDATE public.league_matches SET match_status='cancelled' WHERE id=next_p1;
  UPDATE public.league_seasons SET status='phase2' WHERE id='a1300000-0000-4000-8000-000000000001';
  UPDATE public.league_phases SET status='finalized',finalized_at=now(),finalized_by_staff_id='a1200000-0000-4000-8000-000000000001'
    WHERE id='a1600000-0000-4000-8000-000000000001';
  UPDATE public.league_phases SET status='in_progress' WHERE id IN('a1600000-0000-4000-8000-00000000000a','a1600000-0000-4000-8000-00000000000b');
  ctx:=public.league_get_captain_context(captain_a,team_a);
  IF ctx->>'match_id'<>'a1800000-0000-4000-8000-00000000001a' OR NOT (ctx->>'can_submit_lineup')::boolean THEN RAISE EXCEPTION 'H3_SERIE_A %',ctx; END IF;
  ctx:=public.league_get_captain_context(captain_c,team_c);
  IF ctx->>'match_id'<>'a1800000-0000-4000-8000-00000000001b' OR NOT (ctx->>'can_submit_lineup')::boolean THEN RAISE EXCEPTION 'H3_SERIE_B %',ctx; END IF;

  -- Visibility is orthogonal; completion removes sporting lineup actions but preserves profile editing.
  UPDATE public.league_seasons SET public_visibility='public',published_at=now() WHERE id='a1300000-0000-4000-8000-000000000001';
  IF public.league_get_captain_context(captain_a,team_a)->>'match_id'<>'a1800000-0000-4000-8000-00000000001a' THEN RAISE EXCEPTION 'H3_VISIBILITY'; END IF;
  UPDATE public.league_seasons SET status='completed',completed_at=now(),completion_fingerprint=repeat('c',64)
    WHERE id='a1300000-0000-4000-8000-000000000001';
  ctx:=public.league_get_captain_context(captain_a,team_a);
  result_ctx:=public.league_get_captain_result_context(captain_a,team_a);
  IF ctx->>'match_id' IS NOT NULL OR (ctx->>'can_submit_lineup')::boolean OR NOT (ctx->>'can_edit_profile')::boolean
     OR (result_ctx->>'can_submit_result')::boolean OR (result_ctx->>'can_contest_result')::boolean THEN RAISE EXCEPTION 'H3_COMPLETED % %',ctx,result_ctx; END IF;
END $test$;

ROLLBACK;
SELECT 'monday_league_prerelease_h3_captain_context: ok' AS result;
