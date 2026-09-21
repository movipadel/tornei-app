\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at) VALUES
 ('f1000000-0000-4000-8000-000000000001','auth.stage4@example.invalid',now(),now(),now()),
 ('f1000000-0000-4000-8000-000000000002','dual-a.stage4@example.invalid',now(),now(),now()),
 ('f1000000-0000-4000-8000-000000000003','dual-b.stage4@example.invalid',now(),now(),now());

INSERT INTO public.users(id,full_name,phone,email,gender,privacy_accepted_at,terms_accepted_at,age_confirmed_at,marketing_accepted,marketing_accepted_at,auth_user_id,created_at) VALUES
 ('f2000000-0000-4000-8000-000000000001','Safe Canonical','3479100001','ops.safe@example.invalid','M',now()-interval '20 days',now()-interval '20 days',now()-interval '20 days',false,NULL,NULL,now()-interval '2 years'),
 ('f2000000-0000-4000-8000-000000000002','Safe Source','3479100002',' OPS.SAFE@EXAMPLE.INVALID ','M',now()-interval '10 days',now()-interval '10 days',now()-interval '10 days',true,now()-interval '5 days',NULL,now()-interval '1 year'),
 ('f2000000-0000-4000-8000-000000000003','Rejected A','3479100003','rejected.stage4@example.invalid','F',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000004','Rejected B','3479100004',' REJECTED.STAGE4@EXAMPLE.INVALID ','F',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000005','Antonio Ambiguo','3479100005','antonio-a.stage4@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000006','Antonio Ambiguo','3479200006','antonio-b.stage4@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000007','Ameno Tecnico','40','ameno-a.stage4@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000008','Ameno Tecnico Due',' 40 ','ameno-b.stage4@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000009','Auth Canonical','3479100009','auth-recommend.stage4@example.invalid','F',NULL,NULL,NULL,false,NULL,'f1000000-0000-4000-8000-000000000001',now()),
 ('f2000000-0000-4000-8000-000000000010','Auth Empty','3479100010',' AUTH-RECOMMEND.STAGE4@EXAMPLE.INVALID ','F',now(),now(),now(),true,now(),NULL,now()-interval '3 years'),
 ('f2000000-0000-4000-8000-000000000011','Dual Auth A','3479100011','dual-auth.stage4@example.invalid','F',NULL,NULL,NULL,false,NULL,'f1000000-0000-4000-8000-000000000002',now()),
 ('f2000000-0000-4000-8000-000000000012','Dual Auth B','3479100012',' DUAL-AUTH.STAGE4@EXAMPLE.INVALID ','F',NULL,NULL,NULL,false,NULL,'f1000000-0000-4000-8000-000000000003',now()),
 ('f2000000-0000-4000-8000-000000000013','Unsafe Loyalty A','3479100013','unsafe-a.stage4@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000014','Unsafe Loyalty B','3479100014','unsafe-b.stage4@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000015','Roster A','3479100015','roster-a.stage4@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000016','Roster B','3479100016','roster-b.stage4@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000017','Tournament A','3479100017','tournament-a.stage4@example.invalid','F',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000018','Tournament B','3479100018','tournament-b.stage4@example.invalid','F',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000019','Stale A','3479100019','stale.stage4@example.invalid','M',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000020','Stale B','3479100020',' STALE.STAGE4@EXAMPLE.INVALID ','M',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000021','Shared Mail A','3479100021','info@shared-stage4.invalid','M',NULL,NULL,NULL,false,NULL,NULL,now()),
 ('f2000000-0000-4000-8000-000000000022','Shared Mail B','3479100022',' INFO@SHARED-STAGE4.INVALID ','M',NULL,NULL,NULL,false,NULL,NULL,now());

INSERT INTO public.loyalty_memberships(id,user_id,status,membership_code,tax_code,membership_type) VALUES
 ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','approved','STAGE4-C','SAME-TAX','ASC'),
 ('f3000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000002','approved','STAGE4-S','SAME-TAX','ASC'),
 ('f3000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-000000000013','approved','STAGE4-UA','TAX-A','ASC'),
 ('f3000000-0000-4000-8000-000000000004','f2000000-0000-4000-8000-000000000014','approved','STAGE4-UB','TAX-B','ASC');
INSERT INTO public.loyalty_transactions(id,membership_id,type,source,points_delta,notes) VALUES
 ('f3100000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','earn','manual_adjustment',100,'canonical points'),
 ('f3100000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000002','earn','manual_adjustment',60,'source points'),
 ('f3100000-0000-4000-8000-000000000003','f3000000-0000-4000-8000-000000000002','redeem','reward_redemption',-20,'source redemption');
INSERT INTO public.rewards_catalog(id,name,description,category,points_cost,is_active,reward_type) VALUES
 ('f3200000-0000-4000-8000-000000000001','Stage4 Reward','Synthetic','Test',20,true,'club');
INSERT INTO public.reward_redemptions(id,membership_id,reward_id,points_cost,status) VALUES
 ('f3300000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002','f3200000-0000-4000-8000-000000000001',20,'requested');
UPDATE public.loyalty_transactions SET related_redemption_id='f3300000-0000-4000-8000-000000000001'
 WHERE id='f3100000-0000-4000-8000-000000000003';

INSERT INTO public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points,customer_name,customer_phone,customer_email) VALUES
 ('f3400000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002','pending','CENTALLO','euro',10,0,'Historical Stage4','3479991111','snapshot.stage4@example.invalid');
INSERT INTO public.communications(id,target,title,body,is_active,starts_at,recipient_user_id,event_type,event_key) VALUES
 ('f3500000-0000-4000-8000-000000000001','user','Stage4 notice','Synthetic',true,now(),'f2000000-0000-4000-8000-000000000002','stage4_test','stage4:test:notice');

INSERT INTO public.league_seasons(id,name,slug,status) VALUES ('f4000000-0000-4000-8000-000000000001','Stage4 League','stage4-league','draft');
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('f4100000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','Stage4 Team','stage4-team','f4200000-0000-4000-8000-000000000001');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('f4200000-0000-4000-8000-000000000001','f4100000-0000-4000-8000-000000000001','Roster A','f2000000-0000-4000-8000-000000000015'),
 ('f4200000-0000-4000-8000-000000000002','f4100000-0000-4000-8000-000000000001','Roster B','f2000000-0000-4000-8000-000000000016');

INSERT INTO public.tournaments(id,name,type,category,date,time,location,max_participants) VALUES
 ('f5000000-0000-4000-8000-000000000001','Stage4 Tournament','Baraonda','Misto',current_date,'20:00','Local',16);
INSERT INTO public.tournament_registrations(id,tournament_id,position,is_reserve,p1_name,p1_phone,p1_gender,user_id) VALUES
 ('f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',1,false,'Tournament A','3479100017','F','f2000000-0000-4000-8000-000000000017'),
 ('f5100000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000001',2,false,'Tournament B','3479100018','F','f2000000-0000-4000-8000-000000000018');

DO $test$
DECLARE first_run jsonb; second_run jsonb; safe_group uuid; rejected_group uuid; auth_group uuid;
  manual_group uuid; shared_group uuid; before_groups integer; after_groups integer;
BEGIN
  first_run:=public.run_user_duplicate_scan(NULL);
  IF first_run->>'state'<>'completed' THEN RAISE EXCEPTION 'scan failed: %',first_run; END IF;
  SELECT id INTO safe_group FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='ops.safe@example.invalid';
  IF safe_group IS NULL OR (SELECT candidate_fingerprint IS NULL FROM public.user_duplicate_review_groups WHERE id=safe_group) THEN RAISE EXCEPTION 'deterministic strong group missing'; END IF;
  SELECT count(*) INTO before_groups FROM public.user_duplicate_review_groups;
  second_run:=public.run_user_duplicate_scan(NULL);
  SELECT count(*) INTO after_groups FROM public.user_duplicate_review_groups;
  IF before_groups<>after_groups OR second_run->>'state'<>'completed' THEN RAISE EXCEPTION 'repeated scan not idempotent'; END IF;

  SELECT id INTO rejected_group FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='rejected.stage4@example.invalid';
  PERFORM public.save_user_duplicate_review_decision(rejected_group,'rejected',NULL,NULL,
    ARRAY['f2000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-000000000004']::uuid[],'{}', 'synthetic rejection',NULL);
  PERFORM public.run_user_duplicate_scan(NULL);
  IF (SELECT count(*) FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='rejected.stage4@example.invalid')<>1
     OR (SELECT state FROM public.user_duplicate_review_groups WHERE id=rejected_group)<>'rejected' THEN RAISE EXCEPTION 'rejected group duplicated or resurrected'; END IF;

  SELECT id INTO manual_group FROM public.user_duplicate_review_groups g JOIN public.user_duplicate_review_members m ON m.group_id=g.id
    WHERE g.signal_type='manual' AND m.user_id='f2000000-0000-4000-8000-000000000005' LIMIT 1;
  IF (SELECT state FROM public.user_duplicate_review_groups WHERE id=manual_group)<>'manual_only' THEN RAISE EXCEPTION 'name-only group not manual'; END IF;
  IF EXISTS(SELECT 1 FROM public.user_duplicate_review_groups WHERE signal_type='normalized_phone' AND signal_value IN('40','+3940')) THEN RAISE EXCEPTION 'technical phone became strong signal'; END IF;
  SELECT id INTO shared_group FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='info@shared-stage4.invalid';
  IF (SELECT state FROM public.user_duplicate_review_groups WHERE id=shared_group)<>'manual_only' THEN RAISE EXCEPTION 'shared email not manual'; END IF;

  SELECT id INTO auth_group FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='auth-recommend.stage4@example.invalid';
  IF (SELECT recommended_user_id FROM public.user_duplicate_review_groups WHERE id=auth_group)<>'f2000000-0000-4000-8000-000000000009'
     OR NOT (SELECT recommendation_reasons @> '["già collegato a Auth"]'::jsonb FROM public.user_duplicate_review_groups WHERE id=auth_group) THEN
    RAISE EXCEPTION 'Auth recommendation or explanation incorrect';
  END IF;
  BEGIN
    PERFORM public.save_user_duplicate_review_decision(auth_group,'approved','f2000000-0000-4000-8000-000000000010','f2000000-0000-4000-8000-000000000009',
      ARRAY['f2000000-0000-4000-8000-000000000009','f2000000-0000-4000-8000-000000000010']::uuid[],
      jsonb_build_object('full_name','f2000000-0000-4000-8000-000000000010','phone','f2000000-0000-4000-8000-000000000010','email','f2000000-0000-4000-8000-000000000010','gender','f2000000-0000-4000-8000-000000000010'),'',NULL);
    RAISE EXCEPTION 'non-Auth canonical accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.user_duplicate_review_groups WHERE signal_value='dual-auth.stage4@example.invalid' AND state='conflict') THEN RAISE EXCEPTION 'dual Auth conflict missing'; END IF;
END $test$;

DO $test$
DECLARE stale_group uuid;
BEGIN
  SELECT id INTO stale_group FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='stale.stage4@example.invalid';
  UPDATE public.users SET full_name='Stale Changed',updated_at=now()+interval '1 second' WHERE id='f2000000-0000-4000-8000-000000000019';
  PERFORM public.run_user_duplicate_scan(NULL);
  IF NOT (SELECT is_stale FROM public.user_duplicate_review_groups WHERE id=stale_group) THEN RAISE EXCEPTION 'material change did not mark group stale'; END IF;
END $test$;

DO $test$
DECLARE movi jsonb; unsafe jsonb; league jsonb; tournament jsonb;
BEGIN
  movi:=public.preview_dual_moviback_reconciliation('f2000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001');
  IF NOT (movi->>'safe')::boolean OR (movi->>'expected_balance')::integer<>140
     OR (movi->'source_membership'->>'redemptions')::integer<>1 THEN RAISE EXCEPTION 'safe MoviBack preview inaccurate: %',movi; END IF;
  unsafe:=public.preview_dual_moviback_reconciliation('f2000000-0000-4000-8000-000000000014','f2000000-0000-4000-8000-000000000013');
  IF (unsafe->>'safe')::boolean OR unsafe->'blockers' @> '["tax_code_mismatch"]'::jsonb IS NOT TRUE THEN RAISE EXCEPTION 'unsafe MoviBack case not blocked'; END IF;
  league:=public.preview_user_merge('f2000000-0000-4000-8000-000000000016','f2000000-0000-4000-8000-000000000015');
  IF league->'conflicts' @> '["same_league_roster"]'::jsonb IS NOT TRUE THEN RAISE EXCEPTION 'roster collision not blocked'; END IF;
  tournament:=public.preview_user_merge('f2000000-0000-4000-8000-000000000018','f2000000-0000-4000-8000-000000000017');
  IF tournament->'conflicts' @> '["same_tournament"]'::jsonb IS NOT TRUE THEN RAISE EXCEPTION 'same tournament not blocked'; END IF;
END $test$;

DO $test$
DECLARE group_id uuid; created jsonb; preverify jsonb; executed jsonb; fp text; communication_count integer;
BEGIN
  SELECT id INTO group_id FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='ops.safe@example.invalid';
  PERFORM public.save_user_duplicate_review_decision(group_id,'approved','f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002',
    ARRAY['f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002']::uuid[],
    jsonb_build_object('full_name','f2000000-0000-4000-8000-000000000001','phone','f2000000-0000-4000-8000-000000000001','email','f2000000-0000-4000-8000-000000000001','gender','f2000000-0000-4000-8000-000000000001'),
    'safe ledger reconciliation',NULL);
  created:=public.create_reviewed_user_merge_operation(group_id,'f2000000-0000-4000-8000-000000000002',NULL,'safe Stage4 merge');
  fp:=created->'preview'->>'fingerprint';
  preverify:=public.verify_reviewed_user_merge((created->>'operation_id')::uuid);
  IF (preverify->>'passed')::boolean THEN RAISE EXCEPTION 'verification failed to detect pre-merge mismatch'; END IF;
  SELECT count(*) INTO communication_count FROM public.communications;
  executed:=public.execute_reviewed_user_merge((created->>'operation_id')::uuid,fp,NULL);
  IF executed->>'state'<>'completed' OR NOT coalesce((executed->'verification'->>'passed')::boolean,false) THEN
    RAISE EXCEPTION 'reviewed merge failed: %, metadata: %',executed,
      (SELECT error_metadata FROM public.user_merge_operations WHERE id=(created->>'operation_id')::uuid);
  END IF;
  IF (SELECT coalesce(sum(t.points_delta),0) FROM public.loyalty_memberships m JOIN public.loyalty_transactions t ON t.membership_id=m.id WHERE m.user_id='f2000000-0000-4000-8000-000000000001')<>140 THEN RAISE EXCEPTION 'points changed'; END IF;
  IF (SELECT count(*) FROM public.reward_redemptions WHERE membership_id=(SELECT id FROM public.loyalty_memberships WHERE user_id='f2000000-0000-4000-8000-000000000001'))<>1 THEN RAISE EXCEPTION 'redemption duplicated or lost'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_moviback_reconciliation_evidence WHERE operation_id=(created->>'operation_id')::uuid) THEN RAISE EXCEPTION 'membership evidence missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.store_orders WHERE id='f3400000-0000-4000-8000-000000000001' AND user_id='f2000000-0000-4000-8000-000000000001' AND customer_phone='3479991111' AND customer_email='snapshot.stage4@example.invalid') THEN RAISE EXCEPTION 'Store snapshot changed'; END IF;
  IF (SELECT marketing_accepted FROM public.users WHERE id='f2000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'marketing consent escalated'; END IF;
  IF (SELECT count(*) FROM public.communications)<>communication_count THEN RAISE EXCEPTION 'external/internal notification emitted'; END IF;
END $test$;

DO $test$
DECLARE group_id uuid; created jsonb; result jsonb;
BEGIN
  SELECT id INTO group_id FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='stale.stage4@example.invalid';
  PERFORM public.run_user_duplicate_scan(NULL);
  PERFORM public.save_user_duplicate_review_decision(group_id,'approved','f2000000-0000-4000-8000-000000000019','f2000000-0000-4000-8000-000000000020',
    ARRAY['f2000000-0000-4000-8000-000000000019','f2000000-0000-4000-8000-000000000020']::uuid[],
    jsonb_build_object('full_name','f2000000-0000-4000-8000-000000000019','phone','f2000000-0000-4000-8000-000000000019','email','f2000000-0000-4000-8000-000000000019','gender','f2000000-0000-4000-8000-000000000019'),'',NULL);
  created:=public.create_reviewed_user_merge_operation(group_id,'f2000000-0000-4000-8000-000000000020',NULL,'stale execution test');
  UPDATE public.users SET updated_at=now()+interval '3 seconds' WHERE id='f2000000-0000-4000-8000-000000000020';
  result:=public.execute_reviewed_user_merge((created->>'operation_id')::uuid,created->'preview'->>'fingerprint',NULL);
  IF result->>'state'<>'stale_preview' THEN RAISE EXCEPTION 'stale preview accepted'; END IF;
END $test$;

DO $test$
DECLARE summary jsonb; report jsonb;
BEGIN
  summary:=public.user_migration_summary();
  IF (summary->>'total_users')::integer<22 OR summary->>'completion_percent' IS NULL OR (summary->>'conflicts')::integer<1 THEN RAISE EXCEPTION 'migration summary inaccurate: %',summary; END IF;
  SELECT value INTO report FROM public.duplicate_migration_dry_run(NULL) value LIMIT 1;
  IF report::text ~* '(password|token|auth_user_id|tax_code)' THEN RAISE EXCEPTION 'dry-run export leaks secret/private fields'; END IF;
END $test$;

SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  BEGIN PERFORM public.run_user_duplicate_scan(NULL); RAISE EXCEPTION 'browser scan allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.duplicate_migration_dry_run(NULL); RAISE EXCEPTION 'browser report allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;

ROLLBACK;
