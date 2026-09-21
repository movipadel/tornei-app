\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at) VALUES
 ('5a100000-0000-4000-8000-000000000001','stage5a-one@example.invalid',now(),now(),now()),
 ('5a100000-0000-4000-8000-000000000002','stage5a-duplicate@example.invalid',now(),now(),now()),
 ('5a100000-0000-4000-8000-000000000003','stage5a-conflict@example.invalid',now(),now(),now()),
 ('5a100000-0000-4000-8000-000000000004','stage5a-owner@example.invalid',now(),now(),now());

INSERT INTO public.users(id,full_name,phone,email,gender,auth_user_id) VALUES
 ('5a200000-0000-4000-8000-000000000001','Legacy One','3479500001','stage5a-one@example.invalid','M',NULL),
 ('5a200000-0000-4000-8000-000000000002','Duplicate One','3479500002','stage5a-duplicate@example.invalid','F',NULL),
 ('5a200000-0000-4000-8000-000000000003','Duplicate Two','3479500003',' STAGE5A-DUPLICATE@EXAMPLE.INVALID ','F',NULL),
 ('5a200000-0000-4000-8000-000000000004','Linked Owner','3479500004','stage5a-conflict@example.invalid','M','5a100000-0000-4000-8000-000000000004');

INSERT INTO public.loyalty_memberships(id,user_id,status,membership_code,tax_code,membership_type) VALUES
 ('5a300000-0000-4000-8000-000000000001','5a200000-0000-4000-8000-000000000001','approved','STAGE5A','STAGE5A-TAX','ASC');
INSERT INTO public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points,customer_name,customer_phone,customer_email) VALUES
 ('5a310000-0000-4000-8000-000000000001','5a200000-0000-4000-8000-000000000001','pending','CENTALLO','euro',10,0,'Snapshot','3470000000','snapshot@example.invalid');
INSERT INTO public.tournaments(id,name,type,category,date,time,location,max_participants) VALUES
 ('5a320000-0000-4000-8000-000000000001','Stage5A Tournament','Baraonda','Misto',current_date,'20:00','Local',16);
INSERT INTO public.tournament_registrations(id,tournament_id,position,is_reserve,p1_name,p1_phone,p1_gender,user_id) VALUES
 ('5a330000-0000-4000-8000-000000000001','5a320000-0000-4000-8000-000000000001',1,false,'Legacy One','3479500001','M','5a200000-0000-4000-8000-000000000001');
INSERT INTO public.league_seasons(id,name,slug,status) VALUES
 ('5a340000-0000-4000-8000-000000000001','Stage5A League','stage5a-league','draft');
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('5a350000-0000-4000-8000-000000000001','5a340000-0000-4000-8000-000000000001','Stage5A Team','stage5a-team','5a360000-0000-4000-8000-000000000001');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('5a360000-0000-4000-8000-000000000001','5a350000-0000-4000-8000-000000000001','Legacy One','5a200000-0000-4000-8000-000000000001');

DO $test$
DECLARE v jsonb; before_business jsonb; after_business jsonb;
BEGIN
  IF (SELECT auth_migration_state FROM public.users WHERE id='5a200000-0000-4000-8000-000000000001')<>'legacy' THEN
    RAISE EXCEPTION 'unlinked existing user is not legacy';
  END IF;
  before_business:=jsonb_build_object(
    'membership',(SELECT user_id FROM public.loyalty_memberships WHERE id='5a300000-0000-4000-8000-000000000001'),
    'order',(SELECT user_id FROM public.store_orders WHERE id='5a310000-0000-4000-8000-000000000001'),
    'registration',(SELECT user_id FROM public.tournament_registrations WHERE id='5a330000-0000-4000-8000-000000000001'),
    'captain',(SELECT p.user_id FROM public.league_teams t JOIN public.league_team_players p ON p.id=t.captain_player_id WHERE t.id='5a350000-0000-4000-8000-000000000001'));
  v:=public.start_user_auth_migration('5a200000-0000-4000-8000-000000000001');
  IF v->>'state'<>'activation_pending' THEN RAISE EXCEPTION 'activation did not start'; END IF;
  PERFORM public.start_user_auth_migration('5a200000-0000-4000-8000-000000000001');
  IF (SELECT count(*) FROM public.user_auth_migration_events WHERE event_type='activation_started' AND public_user_id='5a200000-0000-4000-8000-000000000001')<>1 THEN
    RAISE EXCEPTION 'activation telemetry is not idempotent';
  END IF;
  v:=public.resolve_and_link_verified_auth_user('5a100000-0000-4000-8000-000000000001');
  IF v->>'state'<>'linked' OR NOT EXISTS(SELECT 1 FROM public.users WHERE id='5a200000-0000-4000-8000-000000000001' AND auth_user_id='5a100000-0000-4000-8000-000000000001' AND auth_migration_state='linked') THEN
    RAISE EXCEPTION 'verified activation did not preserve and link profile';
  END IF;
  PERFORM public.resolve_and_link_verified_auth_user('5a100000-0000-4000-8000-000000000001');
  IF public.legacy_user_auth_migration_preflight('+39 347 950 0001')->>'state'<>'auth_required' THEN
    RAISE EXCEPTION 'linked profile could be recreated through a phone format variant';
  END IF;
  IF (SELECT count(*) FROM public.user_auth_migration_events WHERE event_type='linked' AND auth_user_id='5a100000-0000-4000-8000-000000000001')<>1 THEN
    RAISE EXCEPTION 'linked telemetry duplicated';
  END IF;
  after_business:=jsonb_build_object(
    'membership',(SELECT user_id FROM public.loyalty_memberships WHERE id='5a300000-0000-4000-8000-000000000001'),
    'order',(SELECT user_id FROM public.store_orders WHERE id='5a310000-0000-4000-8000-000000000001'),
    'registration',(SELECT user_id FROM public.tournament_registrations WHERE id='5a330000-0000-4000-8000-000000000001'),
    'captain',(SELECT p.user_id FROM public.league_teams t JOIN public.league_team_players p ON p.id=t.captain_player_id WHERE t.id='5a350000-0000-4000-8000-000000000001'));
  IF before_business<>after_business THEN RAISE EXCEPTION 'business ownership changed during activation'; END IF;
END $test$;

DO $test$
DECLARE v jsonb; group_id uuid;
BEGIN
  v:=public.resolve_and_link_verified_auth_user('5a100000-0000-4000-8000-000000000002');
  IF v->>'state'<>'review_required' OR (v->>'match_count')::integer<>2 THEN RAISE EXCEPTION 'duplicates did not require review'; END IF;
  IF (SELECT count(*) FROM public.users WHERE id IN('5a200000-0000-4000-8000-000000000002','5a200000-0000-4000-8000-000000000003') AND auth_migration_state='review_required')<>2 THEN
    RAISE EXCEPTION 'duplicate migration states missing';
  END IF;
  SELECT id INTO group_id FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='stage5a-duplicate@example.invalid';
  IF group_id IS NULL OR NOT (SELECT warning_flags ? 'activation_review_required' FROM public.user_duplicate_review_groups WHERE id=group_id) THEN
    RAISE EXCEPTION 'Stage 4 review group not integrated';
  END IF;
  IF EXISTS(SELECT 1 FROM public.users WHERE id IN('5a200000-0000-4000-8000-000000000002','5a200000-0000-4000-8000-000000000003') AND identity_status<>'active') THEN
    RAISE EXCEPTION 'activation auto-merged a duplicate';
  END IF;
END $test$;

DO $test$
DECLARE v jsonb; summary jsonb;
BEGIN
  v:=public.resolve_and_link_verified_auth_user('5a100000-0000-4000-8000-000000000003');
  IF v->>'state'<>'conflict' OR (SELECT auth_user_id FROM public.users WHERE id='5a200000-0000-4000-8000-000000000004')<>'5a100000-0000-4000-8000-000000000004' THEN
    RAISE EXCEPTION 'different Auth ownership did not fail closed';
  END IF;
  summary:=public.user_migration_summary();
  IF (summary->>'activation_started')::integer<1 OR (summary->>'verification_completed')::integer<3
     OR (summary->>'linked_events')::integer<1 OR (summary->>'review_required_events')::integer<1
     OR (summary->>'conflict_events')::integer<1 THEN RAISE EXCEPTION 'migration telemetry summary inaccurate: %',summary; END IF;
END $test$;

SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  BEGIN PERFORM * FROM public.user_auth_migration_events; RAISE EXCEPTION 'browser read migration telemetry';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.start_user_auth_migration('5a200000-0000-4000-8000-000000000002'); RAISE EXCEPTION 'browser started migration';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.legacy_user_auth_migration_preflight('3479500001'); RAISE EXCEPTION 'browser inspected legacy migration';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;

ROLLBACK;
