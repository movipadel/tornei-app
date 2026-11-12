-- Future release guard for one verified canonical public.users ID.
-- Pass -v target_user_id=<verified-id> to psql. READ ONLY; no repair SQL.
-- Compare the business fingerprints before and after any separately approved
-- correction. Email and Auth state are expected to change only during repair.
BEGIN READ ONLY;

WITH profile AS (
  SELECT u.id,u.full_name,u.phone,u.email,u.auth_user_id,u.auth_migration_state
  FROM public.users u
  WHERE u.id=:'target_user_id'::uuid
), draft AS (
  SELECT o.auth_user_id,o.state,o.normalized_email
  FROM public.user_auth_onboarding o
  JOIN profile u ON true
    AND o.flow='activation'
    AND o.normalized_phone=public.normalize_user_mobile_e164(u.phone)
    AND public.normalize_user_person_name(o.full_name)=public.normalize_user_person_name(u.full_name)
), sport AS (
  SELECT pi.id FROM public.player_identities pi JOIN profile p ON pi.account_user_id=p.id
)
SELECT
  current_setting('transaction_read_only') AS transaction_read_only,
  (SELECT count(*) FROM profile) AS public_profile_count,
  (SELECT string_agg(DISTINCT left(split_part(email,'@',1),2)||'***@'||split_part(email,'@',2),',')
   FROM profile WHERE email IS NOT NULL) AS masked_public_email,
  (SELECT string_agg(DISTINCT auth_migration_state,',') FROM profile) AS auth_migration_state,
  (SELECT count(*) FROM profile WHERE auth_user_id IS NOT NULL) AS linked_public_profiles,
  (SELECT count(*) FROM draft d JOIN auth.users a ON a.id=d.auth_user_id
   WHERE a.email_confirmed_at IS NULL) AS unconfirmed_auth_users,
  (SELECT count(*) FROM auth.sessions s WHERE s.user_id IN (SELECT auth_user_id FROM draft)) AS auth_sessions,
  (SELECT string_agg(DISTINCT state,',') FROM draft) AS onboarding_states,
  (SELECT count(*) FROM sport) AS linked_player_identities,
  (SELECT count(*) FROM public.loyalty_memberships m JOIN profile p ON m.user_id=p.id) AS moviback_memberships,
  (SELECT md5(coalesce(string_agg(m.id::text||':'||m.status,'|' ORDER BY m.id),'')) FROM public.loyalty_memberships m
   JOIN profile p ON m.user_id=p.id) AS moviback_membership_fingerprint,
  (SELECT count(*) FROM public.loyalty_transactions tx
   JOIN public.loyalty_memberships m ON m.id=tx.membership_id JOIN profile p ON m.user_id=p.id) AS moviback_transactions,
  (SELECT coalesce(sum(tx.points_delta),0) FROM public.loyalty_transactions tx
   JOIN public.loyalty_memberships m ON m.id=tx.membership_id JOIN profile p ON m.user_id=p.id) AS moviback_points_delta,
  (SELECT count(*) FROM public.tournament_registrations r
   WHERE r.user_id IN (SELECT id FROM profile)
     OR r.p1_player_identity_id IN (SELECT id FROM sport)
     OR r.p2_player_identity_id IN (SELECT id FROM sport)) AS tournament_registrations,
  (SELECT md5(coalesce(string_agg(r.id::text||':'||coalesce(r.is_reserve::text,''),'|' ORDER BY r.id),''))
   FROM public.tournament_registrations r
   WHERE r.user_id IN (SELECT id FROM profile)
     OR r.p1_player_identity_id IN (SELECT id FROM sport)
     OR r.p2_player_identity_id IN (SELECT id FROM sport)) AS tournament_fingerprint;

ROLLBACK;
