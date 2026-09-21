\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES
 ('b1000000-0000-4000-8000-000000000001','unique.stage2@example.invalid',now(),now(),now()),
 ('b1000000-0000-4000-8000-000000000002','unverified.stage2@example.invalid',NULL,now(),now()),
 ('b1000000-0000-4000-8000-000000000003','missing.stage2@example.invalid',now(),now(),now()),
 ('b1000000-0000-4000-8000-000000000004','duplicate.stage2@example.invalid',now(),now(),now()),
 ('b1000000-0000-4000-8000-000000000005','new.stage2@example.invalid',now(),now(),now()),
 ('b1000000-0000-4000-8000-000000000006','phone-collision.stage2@example.invalid',now(),now(),now()),
 ('b1000000-0000-4000-8000-000000000007',' UNIQUE.STAGE2@EXAMPLE.INVALID ',now(),now(),now());

INSERT INTO public.users(id,full_name,phone,email,gender)
VALUES
 ('b2000000-0000-4000-8000-000000000001','Unique Stage2','3475000001',' Unique.Stage2@Example.Invalid ','M'),
 ('b2000000-0000-4000-8000-000000000002','Duplicate A','3475000002','duplicate.stage2@example.invalid','F'),
 ('b2000000-0000-4000-8000-000000000003','Duplicate B','3475000003',' DUPLICATE.STAGE2@EXAMPLE.INVALID ','F');

DO $test$
DECLARE v jsonb;
BEGIN
  v := public.resolve_and_link_verified_auth_user('b1000000-0000-4000-8000-000000000002');
  IF v->>'state' <> 'pending_verification' THEN RAISE EXCEPTION 'unverified linked'; END IF;

  v := public.resolve_and_link_verified_auth_user('b1000000-0000-4000-8000-000000000003');
  IF v->>'state' <> 'no_profile' THEN RAISE EXCEPTION 'missing profile state'; END IF;

  v := public.resolve_and_link_verified_auth_user('b1000000-0000-4000-8000-000000000004');
  IF v->>'state' <> 'review_required' OR (v->>'match_count')::int <> 2 THEN
    RAISE EXCEPTION 'duplicate profile auto-linked';
  END IF;

  v := public.resolve_and_link_verified_auth_user('b1000000-0000-4000-8000-000000000001');
  IF v->>'state' <> 'linked' THEN RAISE EXCEPTION 'unique profile not linked'; END IF;
  v := public.resolve_and_link_verified_auth_user('b1000000-0000-4000-8000-000000000001');
  IF v->>'state' <> 'linked' THEN RAISE EXCEPTION 'link replay not idempotent'; END IF;

  v := public.resolve_and_link_verified_auth_user('b1000000-0000-4000-8000-000000000007');
  IF v->>'state' <> 'conflict' THEN RAISE EXCEPTION 'linked profile stolen'; END IF;

  v := public.prepare_user_auth_signup(
    'b1000000-0000-4000-8000-000000000005','New Stage2','0039 347 500 0005','F',true,true,true,false
  );
  IF v->>'state' <> 'pending_verification' THEN RAISE EXCEPTION 'signup draft failed'; END IF;
  v := public.finalize_verified_auth_signup('b1000000-0000-4000-8000-000000000005');
  IF v->>'state' <> 'linked' THEN RAISE EXCEPTION 'new profile failed'; END IF;
  IF (SELECT count(*) FROM public.users WHERE auth_user_id='b1000000-0000-4000-8000-000000000005') <> 1 THEN
    RAISE EXCEPTION 'signup did not create exactly one profile';
  END IF;

  v := public.prepare_user_auth_signup(
    'b1000000-0000-4000-8000-000000000006','Collision Stage2','3475000005','M',true,true,true,false
  );
  v := public.finalize_verified_auth_signup('b1000000-0000-4000-8000-000000000006');
  IF v->>'state' <> 'conflict' OR (v->>'phone_matches')::int <> 1 THEN
    RAISE EXCEPTION 'normalized phone collision not blocked';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_identity_aliases WHERE source_user_id::text LIKE 'b2%') THEN
    RAISE EXCEPTION 'activation used alias authorization';
  END IF;
END $test$;

SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM public.resolve_and_link_verified_auth_user('b1000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'authenticated role executed service command';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
RESET ROLE;

ROLLBACK;
