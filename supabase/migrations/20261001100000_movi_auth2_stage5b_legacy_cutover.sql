-- MOVI Auth 2.0 Stage 5B: controlled legacy cutover for normal users.
-- Legacy access is lookup-only; new profiles are created only by verified Auth signup.

CREATE TABLE public.user_legacy_login_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN (
    'legacy_login_success',
    'legacy_login_not_found',
    'legacy_login_auth_required',
    'legacy_login_review_required',
    'legacy_login_conflict'
  )),
  public_user_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object')
);

CREATE INDEX user_legacy_login_events_type_time_idx
  ON public.user_legacy_login_events(event_type,occurred_at DESC);

CREATE TRIGGER user_legacy_login_events_immutable
BEFORE UPDATE OR DELETE ON public.user_legacy_login_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_auth_link_event_mutation();

CREATE FUNCTION public.legacy_user_login_lookup(p_phone text,p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_phone text:=public.normalize_user_mobile_e164(p_phone);
  v_email text:=public.normalize_user_email(p_email);
  v_profile public.users%rowtype;
  v_user_id uuid;
  v_pair_count integer:=0;
  v_active_email_count integer:=0;
  v_active_phone_count integer:=0;
  v_state text;
  v_event text;
BEGIN
  IF v_phone IS NULL OR v_email IS NULL THEN
    INSERT INTO public.user_legacy_login_events(event_type) VALUES('legacy_login_not_found');
    RETURN jsonb_build_object('state','not_found');
  END IF;

  -- Use the same email lock as verified Auth linking, then the phone lock.
  -- This gives every Stage 5B identity race a fixed lock order.
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-auth-email:'||v_email,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-legacy-phone:'||v_phone,0));

  SELECT count(*),(array_agg(u.id ORDER BY u.id))[1]
    INTO v_pair_count,v_user_id
    FROM public.users u
   WHERE public.normalize_user_mobile_e164(u.phone)=v_phone
     AND public.normalize_user_email(u.email)=v_email;

  IF v_pair_count=0 THEN
    v_state:='not_found';
    v_event:='legacy_login_not_found';
  ELSIF v_pair_count>1 THEN
    v_state:='review_required';
    v_event:='legacy_login_review_required';
  ELSE
    SELECT * INTO v_profile FROM public.users u WHERE u.id=v_user_id FOR UPDATE;

    IF v_profile.identity_status='merged' OR v_profile.auth_migration_state='merged' THEN
      v_state:='merged';
      v_event:='legacy_login_auth_required';
    ELSIF v_profile.auth_user_id IS NOT NULL OR v_profile.auth_migration_state='linked' THEN
      v_state:='auth_required';
      v_event:='legacy_login_auth_required';
    ELSIF v_profile.auth_migration_state='review_required' THEN
      v_state:='review_required';
      v_event:='legacy_login_review_required';
    ELSIF v_profile.auth_migration_state='conflict' THEN
      v_state:='conflict';
      v_event:='legacy_login_conflict';
    ELSE
      SELECT count(*) INTO v_active_email_count FROM public.users u
       WHERE u.identity_status='active' AND public.normalize_user_email(u.email)=v_email;
      SELECT count(*) INTO v_active_phone_count FROM public.users u
       WHERE u.identity_status='active' AND public.normalize_user_mobile_e164(u.phone)=v_phone;
      IF v_active_email_count<>1 OR v_active_phone_count<>1 THEN
        v_state:='review_required';
        v_event:='legacy_login_review_required';
      ELSIF v_profile.identity_status='active'
        AND v_profile.auth_user_id IS NULL
        AND v_profile.auth_migration_state IN('legacy','activation_pending') THEN
        v_state:='legacy_allowed';
        v_event:='legacy_login_success';
      ELSE
        v_state:='conflict';
        v_event:='legacy_login_conflict';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.user_legacy_login_events(event_type,public_user_id)
  VALUES(v_event,CASE WHEN v_pair_count=1 THEN v_profile.id END);

  RETURN jsonb_build_object(
    'state',v_state,
    'public_user_id',CASE WHEN v_state='legacy_allowed' THEN v_profile.id END
  );
END $$;

CREATE OR REPLACE FUNCTION public.user_migration_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  WITH totals AS (
    SELECT count(*) total_users,
      count(*) FILTER(WHERE auth_migration_state='legacy') legacy_users,
      count(*) FILTER(WHERE auth_migration_state='activation_pending') activation_pending,
      count(*) FILTER(WHERE auth_migration_state='linked') linked_users,
      count(*) FILTER(WHERE auth_migration_state='review_required') review_required_users,
      count(*) FILTER(WHERE auth_migration_state='conflict') conflict_users,
      count(*) FILTER(WHERE auth_migration_state='merged') merged_users,
      count(*) FILTER(WHERE identity_status='active' AND auth_user_id IS NULL) unlinked,
      count(*) FILTER(WHERE identity_status='active' AND auth_user_id IS NOT NULL) auth_linked,
      count(*) FILTER(WHERE identity_status='active' AND auth_migration_state='legacy'
        AND public.normalize_user_email(email) IS NOT NULL
        AND public.normalize_user_email(email) NOT LIKE '%@example.invalid'
        AND public.normalize_user_mobile_e164(phone) IS NOT NULL) legacy_person_profiles,
      count(*) FILTER(WHERE identity_status='active'
        AND public.normalize_user_email(email) IS NOT NULL
        AND public.normalize_user_email(email) NOT LIKE '%@example.invalid'
        AND public.normalize_user_mobile_e164(phone) IS NOT NULL) active_person_profiles,
      count(*) FILTER(WHERE identity_status='active' AND auth_user_id IS NOT NULL
        AND public.normalize_user_email(email) IS NOT NULL
        AND public.normalize_user_email(email) NOT LIKE '%@example.invalid'
        AND public.normalize_user_mobile_e164(phone) IS NOT NULL) active_auth_linked_person_profiles
    FROM public.users
  ), groups AS (
    SELECT count(*) FILTER(WHERE state='pending_review') pending,
      count(*) FILTER(WHERE state='manual_only') manual_only,
      count(*) FILTER(WHERE state='merged') merged_groups,
      count(*) FILTER(WHERE state='conflict') conflicts,
      count(*) FILTER(WHERE is_stale) stale,
      count(*) FILTER(WHERE state='approved') approved,
      count(*) FILTER(WHERE state='rejected') rejected
    FROM public.user_duplicate_review_groups
  ), migration_events AS (
    SELECT count(*) FILTER(WHERE event_type='activation_started') activation_started,
      count(*) FILTER(WHERE event_type='verification_completed') verification_completed,
      count(*) FILTER(WHERE event_type='linked') linked_events,
      count(*) FILTER(WHERE event_type='review_required') review_required_events,
      count(*) FILTER(WHERE event_type='conflict') conflict_events
    FROM public.user_auth_migration_events
  ), login_events AS (
    SELECT count(*) FILTER(WHERE event_type='legacy_login_success' AND occurred_at>=now()-interval '30 days') legacy_logins_30d,
      count(*) FILTER(WHERE event_type='legacy_login_not_found') legacy_login_not_found,
      count(*) FILTER(WHERE event_type='legacy_login_auth_required') legacy_login_auth_required,
      count(*) FILTER(WHERE event_type='legacy_login_review_required') legacy_login_review_required,
      count(*) FILTER(WHERE event_type='legacy_login_conflict') legacy_login_conflict
    FROM public.user_legacy_login_events
  ) SELECT jsonb_build_object(
    'total_users',t.total_users,'legacy_users',t.legacy_users,'activation_pending',t.activation_pending,
    'linked_users',t.linked_users,'review_required_users',t.review_required_users,'conflict_users',t.conflict_users,
    'merged_users',t.merged_users,'unlinked_users',t.unlinked,'auth_linked_users',t.auth_linked,
    'active_person_profiles',t.active_person_profiles,
    'legacy_person_profiles',t.legacy_person_profiles,
    'active_auth_linked_person_profiles',t.active_auth_linked_person_profiles,
    'auth_linked_active_percent',CASE WHEN t.active_person_profiles=0 THEN 0
      ELSE round(100.0*t.active_auth_linked_person_profiles/t.active_person_profiles,1) END,
    'pending_groups',g.pending,'manual_only_groups',g.manual_only,'merged_groups',g.merged_groups,
    'conflicts',g.conflicts,'approved_groups',g.approved,'rejected_groups',g.rejected,'stale_groups',g.stale,
    'activation_started',m.activation_started,'verification_completed',m.verification_completed,
    'linked_events',m.linked_events,'review_required_events',m.review_required_events,'conflict_events',m.conflict_events,
    'legacy_logins_30d',l.legacy_logins_30d,'legacy_login_not_found',l.legacy_login_not_found,
    'legacy_login_auth_required',l.legacy_login_auth_required,
    'legacy_login_review_required',l.legacy_login_review_required,'legacy_login_conflict',l.legacy_login_conflict,
    'completion_percent',CASE WHEN t.total_users=0 THEN 100 ELSE round(100.0*(t.linked_users+t.merged_users)/t.total_users,1) END,
    'completion_definition','linked or merged profiles; active Auth percentage excludes invalid synthetic profiles')
  FROM totals t CROSS JOIN groups g CROSS JOIN migration_events m CROSS JOIN login_events l;
$$;

ALTER TABLE public.user_legacy_login_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_legacy_login_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.user_legacy_login_events_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.user_legacy_login_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.user_legacy_login_events_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.legacy_user_login_lookup(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_user_login_lookup(text,text) TO service_role;

COMMENT ON FUNCTION public.legacy_user_login_lookup(text,text) IS
  'Stage 5B lookup-only legacy authentication decision. It never creates, links, merges, or updates a profile.';
COMMENT ON TABLE public.user_legacy_login_events IS
  'Private immutable Stage 5B outcome telemetry. It contains no submitted email, phone, password, token, or cookie.';
