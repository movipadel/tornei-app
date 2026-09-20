\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('71000000-0000-4000-8000-000000000001','S7 Captain A','+390000009101','s7-a@example.invalid','M'),
 ('71000000-0000-4000-8000-000000000002','S7 Captain B','+390000009102','s7-b@example.invalid','F'),
 ('71000000-0000-4000-8000-000000000003','S7 Captain C','+390000009103','s7-c@example.invalid','M'),
 ('71000000-0000-4000-8000-000000000004','S7 Captain D','+390000009104','s7-d@example.invalid','F'),
 ('71000000-0000-4000-8000-000000000005','S7 New Captain A','+390000009105','s7-new-a@example.invalid','M');
INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES
 ('72000000-0000-4000-8000-000000000001','S7 Admin','s7-admin@example.invalid','admin',true);
INSERT INTO public.league_seasons(id,name,slug,status) VALUES
 ('73000000-0000-4000-8000-000000000001','S7 Season','s7-season','phase1');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('74000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','S7 Team A','s7-team-a','75000000-0000-4000-8000-000000000001'),
 ('74000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001','S7 Team B','s7-team-b','75000000-0000-4000-8000-000000000002'),
 ('74000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000001','S7 Team C','s7-team-c','75000000-0000-4000-8000-000000000003'),
 ('74000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000001','S7 Team D','s7-team-d','75000000-0000-4000-8000-000000000004');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('75000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','S7 Captain A','71000000-0000-4000-8000-000000000001'),
 ('75000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000002','S7 Captain B','71000000-0000-4000-8000-000000000002'),
 ('75000000-0000-4000-8000-000000000003','74000000-0000-4000-8000-000000000003','S7 Captain C','71000000-0000-4000-8000-000000000003'),
 ('75000000-0000-4000-8000-000000000004','74000000-0000-4000-8000-000000000004','S7 Captain D','71000000-0000-4000-8000-000000000004'),
 ('75000000-0000-4000-8000-000000000005','74000000-0000-4000-8000-000000000001','S7 New Captain A','71000000-0000-4000-8000-000000000005');
UPDATE public.league_teams SET captain_player_id='75000000-0000-4000-8000-000000000005'
 WHERE id='74000000-0000-4000-8000-000000000001';
INSERT INTO public.league_phases(id,season_id,code,name,sequence,status) VALUES
 ('76000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','phase1','Fase 1',1,'in_progress');
INSERT INTO public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order) VALUES
 ('76000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001',1,1),
 ('76000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002',2,2),
 ('76000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000003',3,3),
 ('76000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000004',4,4);
INSERT INTO public.league_venues(id,code,name) VALUES
 ('76000000-0000-4000-8000-000000000010','S7_VENUE','S7 Circolo');
INSERT INTO public.league_rounds(id,phase_id,round_number,status)
SELECT ('77000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '76000000-0000-4000-8000-000000000001',n,'scheduled' FROM generate_series(1,6) n;
INSERT INTO public.league_matches(id,phase_id,round_id,home_team_id,away_team_id,venue_id,scheduled_at,match_status)
SELECT x.id::uuid,'76000000-0000-4000-8000-000000000001',x.round_id::uuid,x.home_id::uuid,x.away_id::uuid,
 '76000000-0000-4000-8000-000000000010',now()+x.offset_value,x.status
FROM (VALUES
 ('78000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002',interval '2 hours 30 minutes','scheduled'),
 ('78000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000003','74000000-0000-4000-8000-000000000004',interval '30 minutes','suspended'),
 ('78000000-0000-4000-8000-000000000003','77000000-0000-4000-8000-000000000003','74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000003',interval '-3 hours','scheduled'),
 ('78000000-0000-4000-8000-000000000004','77000000-0000-4000-8000-000000000004','74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000003',interval '-3 hours 10 minutes','scheduled'),
 ('78000000-0000-4000-8000-000000000005','77000000-0000-4000-8000-000000000005','74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000004',interval '-3 hours 20 minutes','scheduled'),
 ('78000000-0000-4000-8000-000000000006','77000000-0000-4000-8000-000000000006','74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000004',interval '2 hours 40 minutes','scheduled')
) x(id,round_id,home_id,away_id,offset_value,status);
INSERT INTO public.league_match_team_slots(match_id,round_id,team_id,side)
SELECT id,round_id,home_team_id,'home' FROM public.league_matches WHERE phase_id='76000000-0000-4000-8000-000000000001'
UNION ALL SELECT id,round_id,away_team_id,'away' FROM public.league_matches WHERE phase_id='76000000-0000-4000-8000-000000000001';
INSERT INTO public.league_lineups(match_id,team_id,revision,submitted_by_user_id)
VALUES('78000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001',1,'71000000-0000-4000-8000-000000000005');
SET CONSTRAINTS ALL IMMEDIATE;
SET LOCAL ROLE service_role;

DO $test$
DECLARE admin uuid:='72000000-0000-4000-8000-000000000001'; result jsonb; result_id uuid; contest_id uuid;
  before_count integer; after_count integer; worker uuid:='79000000-0000-4000-8000-000000000001'; event record;
BEGIN
  -- Special and standard results suppress missing-result reminders.
  PERFORM public.league_set_match_special_outcome(admin,'78000000-0000-4000-8000-000000000004',NULL,NULL,
    'walkover','74000000-0000-4000-8000-000000000002',true,3,0,true,false,2,0,12,0,'S7 fixture');
  result:=public.league_captain_submit_result('71000000-0000-4000-8000-000000000002','78000000-0000-4000-8000-000000000005',
    '[{"homeGames":6,"awayGames":2},{"homeGames":6,"awayGames":3}]');
  result_id:=(result->>'result_id')::uuid;

  PERFORM public.league_scan_due_notifications(now(),100);
  SELECT count(*) INTO before_count FROM public.league_notification_events;
  PERFORM public.league_scan_due_notifications(now(),100);
  SELECT count(*) INTO after_count FROM public.league_notification_events;
  IF before_count<>after_count THEN RAISE EXCEPTION 'S7_ASSERT_SCAN_IDEMPOTENCY'; END IF;
  IF (SELECT count(*) FROM public.league_notification_events WHERE event_type='lineup_reminder')<>3
     OR (SELECT count(*) FROM public.league_notification_events WHERE event_type='match_reminder')<>4
     OR (SELECT count(*) FROM public.league_notification_events WHERE event_type='missing_result_reminder')<>1 THEN
    RAISE EXCEPTION 'S7_ASSERT_REMINDER_COUNTS'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_notification_events WHERE event_type='lineup_reminder' AND team_id='74000000-0000-4000-8000-000000000001' AND match_id='78000000-0000-4000-8000-000000000001')
     OR EXISTS(SELECT 1 FROM public.league_notification_events WHERE match_id='78000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'S7_ASSERT_LINEUP_OR_SUSPENDED_SKIP'; END IF;
  IF (SELECT recipient_user_id FROM public.league_notification_events WHERE event_type='missing_result_reminder')<>'71000000-0000-4000-8000-000000000005'
     OR EXISTS(SELECT 1 FROM public.league_notification_events WHERE body ILIKE '%lineup%' OR body ILIKE '%formazione avversaria%') THEN
    RAISE EXCEPTION 'S7_ASSERT_CURRENT_CAPTAIN_PRIVACY'; END IF;

  -- Transactional submit, contest and resolution are one event per intended captain.
  IF (SELECT count(*) FROM public.league_notification_events WHERE event_type='result_submitted' AND recipient_user_id='71000000-0000-4000-8000-000000000004')<>1
     OR NOT EXISTS(SELECT 1 FROM public.league_notification_events WHERE event_type='result_submitted' AND body LIKE '%fino al %') THEN
    RAISE EXCEPTION 'S7_ASSERT_RESULT_SUBMITTED'; END IF;
  result:=public.league_away_captain_contest_result('71000000-0000-4000-8000-000000000004','78000000-0000-4000-8000-000000000005',result_id,'private contest reason');
  contest_id:=(result->>'contest_id')::uuid;
  IF (SELECT count(*) FROM public.league_notification_events WHERE event_type='contest_opened' AND recipient_user_id='71000000-0000-4000-8000-000000000002')<>1
     OR EXISTS(SELECT 1 FROM public.league_notification_events WHERE body LIKE '%private contest reason%') THEN
    RAISE EXCEPTION 'S7_ASSERT_CONTEST_OPEN_PRIVACY'; END IF;
  PERFORM public.league_admin_resolve_contest(admin,'78000000-0000-4000-8000-000000000005',result_id,contest_id,
    'correct','[{"homeGames":2,"awayGames":6},{"homeGames":3,"awayGames":6}]','private admin note');
  IF (SELECT count(*) FROM public.league_notification_events WHERE event_type='contest_resolved')<>2
     OR NOT EXISTS(SELECT 1 FROM public.league_notification_events WHERE event_type='contest_resolved' AND body LIKE '%0-2%')
     OR EXISTS(SELECT 1 FROM public.league_notification_events WHERE body LIKE '%private admin note%') THEN
    RAISE EXCEPTION 'S7_ASSERT_CONTEST_RESOLUTION'; END IF;

  -- Reschedule invalidates old reminders and creates one versioned event per current captain; reopen is bilateral.
  UPDATE public.league_matches SET scheduled_at=scheduled_at+interval '1 day',schedule_version=schedule_version+1
    WHERE id='78000000-0000-4000-8000-000000000006';
  PERFORM public.league_reopen_lineups(admin,'78000000-0000-4000-8000-000000000006','S7 reopen');
  IF (SELECT count(*) FROM public.league_notification_events WHERE event_type='match_rescheduled' AND match_id='78000000-0000-4000-8000-000000000006')<>2
     OR (SELECT count(*) FROM public.league_notification_events WHERE event_type='lineups_reopened' AND match_id='78000000-0000-4000-8000-000000000006')<>2 THEN
    RAISE EXCEPTION 'S7_ASSERT_RESCHEDULE_REOPEN'; END IF;

  FOR event IN SELECT id FROM public.league_claim_notification_events(worker,100) LOOP
    PERFORM public.league_deliver_notification_event(event.id,worker);
  END LOOP;
  IF (SELECT count(*) FROM public.league_notification_events WHERE status='skipped')<>4
     OR EXISTS(SELECT 1 FROM public.communications c JOIN public.league_notification_events e ON e.idempotency_key=c.event_key WHERE e.match_id='78000000-0000-4000-8000-000000000006' AND e.event_type IN ('lineup_reminder','match_reminder')) THEN
    RAISE EXCEPTION 'S7_ASSERT_STALE_INVALIDATION'; END IF;
  IF (SELECT count(*) FROM public.communications c JOIN public.league_notification_events e ON e.idempotency_key=c.event_key)
     <> (SELECT count(*) FROM public.league_notification_events WHERE status='delivered') THEN
    RAISE EXCEPTION 'S7_ASSERT_IN_APP_DELIVERY'; END IF;
  -- Push retry equivalent: replaying delivery cannot duplicate the unique in-app event.
  SELECT count(*) INTO before_count FROM public.communications;
  PERFORM public.league_deliver_notification_event((SELECT id FROM public.league_notification_events WHERE status='delivered' LIMIT 1),worker);
  SELECT count(*) INTO after_count FROM public.communications;
  IF before_count<>after_count THEN RAISE EXCEPTION 'S7_ASSERT_DELIVERY_REPLAY'; END IF;

  IF public.league_format_rome_timestamp('2026-01-15 18:00:00+00')<>'15/01/2026 alle 19:00'
     OR public.league_format_rome_timestamp('2026-07-15 18:00:00+00')<>'15/07/2026 alle 20:00' THEN
    RAISE EXCEPTION 'S7_ASSERT_CET_CEST'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_notification_events WHERE event_type='phase2_ready') THEN
    RAISE EXCEPTION 'S7_ASSERT_PHASE2_DORMANT'; END IF;
END $test$;

RESET ROLE;
DO $security$
BEGIN
  IF has_table_privilege('anon','public.league_notification_events','SELECT')
     OR has_table_privilege('authenticated','public.league_notification_events','SELECT')
     OR has_function_privilege('anon','public.league_scan_due_notifications(timestamptz,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.league_deliver_notification_event(uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.league_scan_due_notifications(timestamptz,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'S7_ASSERT_SECURITY'; END IF;
END $security$;

ROLLBACK;
\echo 'Monday League Stage 7 notifications PASS: idempotent reminders, transactional hooks, invalidation, Rome time and locked-down delivery.'
