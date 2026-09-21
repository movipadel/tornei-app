\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at) VALUES
 ('d1000000-0000-4000-8000-000000000001','linked-canonical.stage3@example.invalid',now(),now(),now()),
 ('d1000000-0000-4000-8000-000000000002','linked-source.stage3@example.invalid',now(),now(),now()),
 ('d1000000-0000-4000-8000-000000000003','recommended.stage3@example.invalid',now(),now(),now());

INSERT INTO public.users(id,full_name,phone,email,gender,privacy_accepted_at,terms_accepted_at,age_confirmed_at,marketing_accepted,marketing_accepted_at,auth_user_id) VALUES
 ('d2000000-0000-4000-8000-000000000001','Stage3 Canonical','3477000001','pair.stage3@example.invalid','M',now()-interval '10 days',now()-interval '10 days',now()-interval '10 days',false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000002','Stage3 Source','+39 347 700 0002',' PAIR.STAGE3@EXAMPLE.INVALID ','M',now()-interval '20 days',now()-interval '20 days',now()-interval '20 days',true,now()-interval '5 days',NULL),
 ('d2000000-0000-4000-8000-000000000003','Phone National','3477000003','phone-a.stage3@example.invalid','F',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000004','Phone International','+393477000003','phone-b.stage3@example.invalid','F',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000005','Same Name Only','3477000005','distinct-a.stage3@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000006','Same Name Only','3477000006','distinct-b.stage3@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000007','Technical Ameno','40','technical.stage3@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000008','Linked Canonical','3477000008','auth-conflict.stage3@example.invalid','F',NULL,NULL,NULL,false,NULL,'d1000000-0000-4000-8000-000000000001'),
 ('d2000000-0000-4000-8000-000000000009','Linked Source','3477000009',' AUTH-CONFLICT.STAGE3@EXAMPLE.INVALID ','F',NULL,NULL,NULL,false,NULL,'d1000000-0000-4000-8000-000000000002'),
 ('d2000000-0000-4000-8000-000000000010','Stale Canonical','3477000010','stale-c.stage3@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000011','Stale Source','3477000011','stale-s.stage3@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000012','Rollback Canonical','3477000012','rollback-c.stage3@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000013','Rollback Source','3477000013','rollback-s.stage3@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000014','Auth Recommended','3477000014','recommend.stage3@example.invalid','F',NULL,NULL,NULL,false,NULL,'d1000000-0000-4000-8000-000000000003'),
 ('d2000000-0000-4000-8000-000000000015','Unlinked Candidate','3477000015',' RECOMMEND.STAGE3@EXAMPLE.INVALID ','F',now(),now(),now(),true,now(),NULL),
 ('d2000000-0000-4000-8000-000000000016','Loyalty Canonical','3477000016','loyalty-c.stage3@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000017','Loyalty Source','3477000017','loyalty-s.stage3@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000018','Captain Source','3477000018','captain-s.stage3@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000019','Captain Canonical','3477000019','captain-c.stage3@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000020','Roster Source','3477000020','roster-s.stage3@example.invalid','F',NULL,NULL,NULL,false,NULL,NULL),
 ('d2000000-0000-4000-8000-000000000021','Roster Canonical','3477000021','roster-c.stage3@example.invalid','F',NULL,NULL,NULL,false,NULL,NULL);

SELECT public.refresh_user_duplicate_candidates(NULL);

DO $test$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='pair.stage3@example.invalid') THEN
    RAISE EXCEPTION 'same normalized email not discovered';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_duplicate_review_groups WHERE signal_type='normalized_phone' AND signal_value='+393477000003') THEN
    RAISE EXCEPTION 'same normalized phone not discovered';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_duplicate_review_groups g JOIN public.user_duplicate_review_members m ON m.group_id=g.id WHERE g.signal_type='manual' AND g.confidence='manual-review' AND g.state='manual_only' AND m.user_id IN('d2000000-0000-4000-8000-000000000005','d2000000-0000-4000-8000-000000000006') GROUP BY g.id HAVING count(*)=2) THEN
    RAISE EXCEPTION 'name-only pair was not isolated for manual review';
  END IF;
  IF EXISTS(SELECT 1 FROM public.user_duplicate_review_groups g JOIN public.user_duplicate_review_members m ON m.group_id=g.id WHERE g.confidence<>'manual-review' AND m.user_id IN('d2000000-0000-4000-8000-000000000005','d2000000-0000-4000-8000-000000000006') GROUP BY g.id HAVING count(*)=2) THEN
    RAISE EXCEPTION 'name-only pair received merge confidence';
  END IF;
  IF EXISTS(SELECT 1 FROM public.user_duplicate_review_groups WHERE signal_type='normalized_phone' AND signal_value IN('40','+3940')) THEN
    RAISE EXCEPTION 'technical phone candidate created';
  END IF;
  IF (public.preview_user_merge('d2000000-0000-4000-8000-000000000009','d2000000-0000-4000-8000-000000000008')->'conflicts')
     @> '["multiple_auth_identities"]'::jsonb IS NOT TRUE THEN RAISE EXCEPTION 'dual auth not blocked'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.user_duplicate_review_groups g
    JOIN public.user_duplicate_review_members m ON m.group_id=g.id
    WHERE m.user_id='d2000000-0000-4000-8000-000000000014'
      AND g.recommended_user_id='d2000000-0000-4000-8000-000000000014'
  ) THEN RAISE EXCEPTION 'linked Auth profile was not recommended as canonical'; END IF;
END $test$;

INSERT INTO public.communications(id,target,title,body,is_active,starts_at) VALUES
 ('d3000000-0000-4000-8000-000000000001','all','Stage3 test','Synthetic',true,now());
INSERT INTO public.communication_user_states(id,user_id,communication_id,read_at,dismissed_at) VALUES
 ('d3100000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',now()-interval '2 days',NULL),
 ('d3100000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000001',NULL,now()-interval '1 day');
INSERT INTO public.communications(id,target,title,body,is_active,starts_at,recipient_user_id,event_type,event_key) VALUES
 ('d3000000-0000-4000-8000-000000000002','user','Personal','Synthetic',true,now(),'d2000000-0000-4000-8000-000000000002','stage3_test','stage3:test:personal');
INSERT INTO public.business_operation_idempotency(operation,user_id,idempotency_key,request_hash,status) VALUES
 ('store_checkout','d2000000-0000-4000-8000-000000000002','d3200000-0000-4000-8000-000000000001',repeat('a',64),'processing');
INSERT INTO public.medical_certificates(id,user_id,file_path,status) VALUES
 ('d3300000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','stage3/synthetic.pdf','uploaded');
INSERT INTO public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points,customer_name,customer_phone,customer_email) VALUES
 ('d3400000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','pending','CENTALLO','euro',10,0,'Historical Name','3479999999','historical@example.invalid');
INSERT INTO public.tournaments(id,name,type,category,date,time,location,max_participants) VALUES
 ('d3500000-0000-4000-8000-000000000001','Stage3 Synthetic','Baraonda','Misto',current_date,'20:00','Local',16);
INSERT INTO public.tournament_registrations(id,tournament_id,position,is_reserve,p1_name,p1_phone,p1_gender,user_id) VALUES
 ('d3600000-0000-4000-8000-000000000001','d3500000-0000-4000-8000-000000000001',1,false,'Historical Player','3478888888','M','d2000000-0000-4000-8000-000000000002');
INSERT INTO public.loyalty_memberships(id,user_id,status,membership_code,tax_code) VALUES
 ('d3700000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','pending_review','STAGE3-SINGLE','SYNTHETIC'),
 ('d3700000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000016','pending_review','STAGE3-DUAL-C','SYNTHETIC-C'),
 ('d3700000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000017','pending_review','STAGE3-DUAL-S','SYNTHETIC-S');

DO $test$
DECLARE preview jsonb;
BEGIN
  preview:=public.preview_user_merge('d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001');
  IF preview->'counts' <> jsonb_build_object(
    'business_idempotency',1,'communication_states',1,'communications',1,
    'league_rosters',0,'league_historical_actors',0,'league_notifications',0,
    'loyalty_memberships',1,'medical_certificates',1,'store_orders',1,
    'tournament_registrations',1,'tournament_participants',0
  ) THEN RAISE EXCEPTION 'preview counts inaccurate: %',preview->'counts'; END IF;
  IF (public.preview_user_merge('d2000000-0000-4000-8000-000000000017','d2000000-0000-4000-8000-000000000016')->'conflicts')
     @> '["dual_loyalty_membership"]'::jsonb IS NOT TRUE THEN RAISE EXCEPTION 'dual loyalty membership not blocked'; END IF;
END $test$;

INSERT INTO public.league_seasons(id,name,slug,status) VALUES
 ('d4000000-0000-4000-8000-000000000001','Stage3 Synthetic League','stage3-synthetic','draft');
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('d4100000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','Captain Team','captain-team','d4200000-0000-4000-8000-000000000001'),
 ('d4100000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000001','Opponent Team','opponent-team','d4200000-0000-4000-8000-000000000002'),
 ('d4100000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000001','Collision Team','collision-team','d4200000-0000-4000-8000-000000000003');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('d4200000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000001','Captain Source','d2000000-0000-4000-8000-000000000018'),
 ('d4200000-0000-4000-8000-000000000002','d4100000-0000-4000-8000-000000000002','Opponent Captain',NULL),
 ('d4200000-0000-4000-8000-000000000003','d4100000-0000-4000-8000-000000000003','Roster Source','d2000000-0000-4000-8000-000000000020'),
 ('d4200000-0000-4000-8000-000000000004','d4100000-0000-4000-8000-000000000003','Roster Canonical','d2000000-0000-4000-8000-000000000021');
INSERT INTO public.league_phases(id,season_id,code,name,sequence,status) VALUES
 ('d4300000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','phase1','Stage3 Phase',1,'generated');
INSERT INTO public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order) VALUES
 ('d4300000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000001',1,1),
 ('d4300000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000002',2,2);
INSERT INTO public.league_rounds(id,phase_id,round_number,status) VALUES
 ('d4400000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001',1,'generated');
INSERT INTO public.league_matches(id,phase_id,round_id,home_team_id,away_team_id) VALUES
 ('d4500000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001','d4400000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000002');
INSERT INTO public.league_result_submissions(id,match_id,revision,status,submitter_type,submitted_by_user_id,home_sets_won,away_sets_won,home_games_won,away_games_won) VALUES
 ('d4600000-0000-4000-8000-000000000001','d4500000-0000-4000-8000-000000000001',1,'submitted','captain','d2000000-0000-4000-8000-000000000018',2,0,12,4);
INSERT INTO public.league_lineups(id,match_id,team_id,revision,status,submitted_by_user_id) VALUES
 ('d4700000-0000-4000-8000-000000000001','d4500000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000001',1,'current','d2000000-0000-4000-8000-000000000018');
INSERT INTO public.league_result_contests(id,match_id,result_submission_id,opened_by_user_id,reason) VALUES
 ('d4800000-0000-4000-8000-000000000001','d4500000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000018','Synthetic historical contest');
INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_user_id) VALUES
 ('d4000000-0000-4000-8000-000000000001','match','d4500000-0000-4000-8000-000000000001','synthetic_stage3','user','d2000000-0000-4000-8000-000000000018');

DO $test$
DECLARE collision jsonb; created jsonb; executed jsonb;
BEGIN
  collision:=public.preview_user_merge('d2000000-0000-4000-8000-000000000020','d2000000-0000-4000-8000-000000000021');
  IF collision->'conflicts' @> '["same_league_roster"]'::jsonb IS NOT TRUE THEN RAISE EXCEPTION 'same-team roster collision not detected'; END IF;
  IF collision->'warnings' @> '["source_is_league_captain"]'::jsonb IS NOT TRUE THEN RAISE EXCEPTION 'captain warning missing'; END IF;

  created:=public.create_user_merge_operation('d2000000-0000-4000-8000-000000000018','d2000000-0000-4000-8000-000000000019',NULL,'captain preservation test',NULL);
  IF created->'preview'->'warnings' @> '["source_is_league_captain"]'::jsonb IS NOT TRUE
     OR (created->'preview'->'counts'->>'league_historical_actors')::integer<>4 THEN
    RAISE EXCEPTION 'captain/history preview inaccurate: %',created->'preview';
  END IF;
  executed:=public.execute_user_merge((created->>'operation_id')::uuid,created->'preview'->>'fingerprint',NULL);
  IF executed->>'state'<>'completed' THEN RAISE EXCEPTION 'captain merge failed: %',executed; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.league_teams t JOIN public.league_team_players p
      ON p.team_id=t.id AND p.id=t.captain_player_id
    WHERE t.id='d4100000-0000-4000-8000-000000000001'
      AND p.id='d4200000-0000-4000-8000-000000000001'
      AND p.user_id='d2000000-0000-4000-8000-000000000019'
  ) THEN RAISE EXCEPTION 'captain assignment was not preserved'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.league_lineups WHERE id='d4700000-0000-4000-8000-000000000001' AND submitted_by_user_id='d2000000-0000-4000-8000-000000000018')
     OR NOT EXISTS(SELECT 1 FROM public.league_result_submissions WHERE id='d4600000-0000-4000-8000-000000000001' AND submitted_by_user_id='d2000000-0000-4000-8000-000000000018')
     OR NOT EXISTS(SELECT 1 FROM public.league_result_contests WHERE id='d4800000-0000-4000-8000-000000000001' AND opened_by_user_id='d2000000-0000-4000-8000-000000000018')
     OR NOT EXISTS(SELECT 1 FROM public.league_audit_events WHERE event_type='synthetic_stage3' AND actor_user_id='d2000000-0000-4000-8000-000000000018') THEN
    RAISE EXCEPTION 'historical league actor evidence was rewritten';
  END IF;
END $test$;

DO $test$
DECLARE created jsonb; executed jsonb; fp text; op_id uuid;
BEGIN
  created:=public.create_user_merge_operation('d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001',NULL,'synthetic Stage3 merge',NULL);
  fp:=created->'preview'->>'fingerprint'; op_id:=(created->>'operation_id')::uuid;
  executed:=public.execute_user_merge(op_id,fp,NULL);
  IF executed->>'state'<>'completed' THEN RAISE EXCEPTION 'simple merge failed: %',executed; END IF;
  IF (public.execute_user_merge(op_id,fp,NULL)->>'idempotent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'replay not idempotent'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_identity_aliases WHERE source_user_id='d2000000-0000-4000-8000-000000000002' AND canonical_user_id='d2000000-0000-4000-8000-000000000001' AND status='active') THEN RAISE EXCEPTION 'alias missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id='d2000000-0000-4000-8000-000000000002' AND identity_status='merged' AND merged_into_user_id='d2000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'source not soft merged'; END IF;
  IF (SELECT count(*) FROM public.communication_user_states WHERE user_id='d2000000-0000-4000-8000-000000000001')<>1 OR
     NOT EXISTS(SELECT 1 FROM public.communication_user_states WHERE user_id='d2000000-0000-4000-8000-000000000001' AND read_at IS NOT NULL AND dismissed_at IS NOT NULL) THEN RAISE EXCEPTION 'communication state merge failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.store_orders WHERE id='d3400000-0000-4000-8000-000000000001' AND user_id='d2000000-0000-4000-8000-000000000001' AND customer_phone='3479999999' AND customer_email='historical@example.invalid') THEN RAISE EXCEPTION 'store snapshot changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tournament_registrations WHERE id='d3600000-0000-4000-8000-000000000001' AND user_id='d2000000-0000-4000-8000-000000000001' AND p1_phone='3478888888') THEN RAISE EXCEPTION 'tournament snapshot changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.medical_certificates WHERE id='d3300000-0000-4000-8000-000000000001' AND user_id='d2000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'medical evidence lost'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.loyalty_memberships WHERE id='d3700000-0000-4000-8000-000000000001' AND user_id='d2000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'single membership lost'; END IF;
  IF (SELECT marketing_accepted FROM public.users WHERE id='d2000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'marketing false did not win'; END IF;
  BEGIN
    UPDATE public.users SET auth_user_id='d1000000-0000-4000-8000-000000000001' WHERE id='d2000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'merged source accepted auth link';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.users SET full_name='Reactivated Source' WHERE id='d2000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'merged source profile remained mutable';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $test$;

DO $test$
DECLARE created jsonb; result jsonb;
BEGIN
  created:=public.create_user_merge_operation('d2000000-0000-4000-8000-000000000011','d2000000-0000-4000-8000-000000000010',NULL,'stale preview test',NULL);
  UPDATE public.users SET updated_at=now()+interval '1 second' WHERE id='d2000000-0000-4000-8000-000000000011';
  result:=public.execute_user_merge((created->>'operation_id')::uuid,created->'preview'->>'fingerprint',NULL);
  IF result->>'state'<>'stale_preview' THEN RAISE EXCEPTION 'stale preview accepted'; END IF;
END $test$;

INSERT INTO public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points) VALUES
 ('d3400000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000013','pending','CENTALLO','euro',1,0);
CREATE FUNCTION pg_temp.fail_stage3_store_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollback'; END $$;
CREATE TRIGGER stage3_force_rollback BEFORE UPDATE OF user_id ON public.store_orders FOR EACH ROW
WHEN (OLD.id='d3400000-0000-4000-8000-000000000002') EXECUTE FUNCTION pg_temp.fail_stage3_store_update();
DO $test$
DECLARE created jsonb; result jsonb;
BEGIN
  created:=public.create_user_merge_operation('d2000000-0000-4000-8000-000000000013','d2000000-0000-4000-8000-000000000012',NULL,'rollback test',NULL);
  result:=public.execute_user_merge((created->>'operation_id')::uuid,created->'preview'->>'fingerprint',NULL);
  IF result->>'state'<>'failed' THEN RAISE EXCEPTION 'forced failure not reported'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id='d2000000-0000-4000-8000-000000000013' AND identity_status='active') THEN RAISE EXCEPTION 'failed merge partially mutated profile'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.store_orders WHERE id='d3400000-0000-4000-8000-000000000002' AND user_id='d2000000-0000-4000-8000-000000000013') THEN RAISE EXCEPTION 'failed merge partially mutated store'; END IF;
END $test$;
DROP TRIGGER stage3_force_rollback ON public.store_orders;

SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  BEGIN PERFORM public.preview_user_merge('d2000000-0000-4000-8000-000000000011','d2000000-0000-4000-8000-000000000010'); RAISE EXCEPTION 'browser preview allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;

ROLLBACK;
