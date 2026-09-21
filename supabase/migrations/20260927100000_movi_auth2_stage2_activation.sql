-- MOVI Auth 2.0 Stage 2: verified activation and signup commands.
-- Additive only: no existing user is migrated, merged, deleted, or relinked.

CREATE TABLE public.user_auth_onboarding (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  flow text NOT NULL CHECK (flow IN ('activation', 'signup')),
  state text NOT NULL DEFAULT 'pending_verification' CHECK (
    state IN ('pending_verification', 'verified', 'linked', 'no_profile', 'review_required', 'conflict')
  ),
  normalized_email text NOT NULL,
  full_name text,
  normalized_phone text,
  gender text CHECK (gender IS NULL OR gender IN ('M', 'F')),
  privacy_accepted_at timestamptz,
  terms_accepted_at timestamptz,
  age_confirmed_at timestamptz,
  marketing_accepted boolean NOT NULL DEFAULT false,
  marketing_accepted_at timestamptz,
  match_count integer NOT NULL DEFAULT 0 CHECK (match_count >= 0),
  linked_public_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_auth_link_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  public_user_id uuid,
  event_type text NOT NULL CHECK (event_type IN (
    'verified', 'linked', 'idempotent_replay', 'no_profile', 'review_required',
    'conflict', 'profile_created', 'signup_blocked'
  )),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object')
);

CREATE FUNCTION public.prevent_user_auth_link_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'MOVI_AUTH_LINK_EVENT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER user_auth_link_events_immutable
BEFORE UPDATE OR DELETE ON public.user_auth_link_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_auth_link_event_mutation();

CREATE FUNCTION public.prepare_user_auth_signup(
  p_auth_user_id uuid,
  p_full_name text,
  p_phone text,
  p_gender text,
  p_privacy_accepted boolean,
  p_terms_accepted boolean,
  p_age_confirmed boolean,
  p_marketing_accepted boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_email text;
  v_phone text;
BEGIN
  SELECT public.normalize_user_email(u.email) INTO v_email
    FROM auth.users u WHERE u.id = p_auth_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'MOVI_AUTH_UNKNOWN_AUTH_USER' USING ERRCODE = '22023';
  END IF;

  v_phone := public.normalize_user_mobile_e164(p_phone);
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('state', 'invalid_phone');
  END IF;
  IF NULLIF(btrim(p_full_name), '') IS NULL OR upper(p_gender) NOT IN ('M', 'F')
     OR NOT p_privacy_accepted OR NOT p_terms_accepted OR NOT p_age_confirmed THEN
    RETURN jsonb_build_object('state', 'invalid_profile');
  END IF;

  INSERT INTO public.user_auth_onboarding (
    auth_user_id, flow, state, normalized_email, full_name, normalized_phone, gender,
    privacy_accepted_at, terms_accepted_at, age_confirmed_at,
    marketing_accepted, marketing_accepted_at
  ) VALUES (
    p_auth_user_id, 'signup', 'pending_verification', v_email, btrim(p_full_name),
    v_phone, upper(p_gender), now(), now(), now(), p_marketing_accepted,
    CASE WHEN p_marketing_accepted THEN now() END
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    normalized_phone = EXCLUDED.normalized_phone,
    gender = EXCLUDED.gender,
    privacy_accepted_at = EXCLUDED.privacy_accepted_at,
    terms_accepted_at = EXCLUDED.terms_accepted_at,
    age_confirmed_at = EXCLUDED.age_confirmed_at,
    marketing_accepted = EXCLUDED.marketing_accepted,
    marketing_accepted_at = EXCLUDED.marketing_accepted_at,
    updated_at = now()
  WHERE user_auth_onboarding.state = 'pending_verification'
    AND user_auth_onboarding.flow = 'signup';

  RETURN jsonb_build_object('state', 'pending_verification');
END;
$$;

CREATE FUNCTION public.resolve_and_link_verified_auth_user(p_auth_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_email text;
  v_confirmed timestamptz;
  v_profile public.users%ROWTYPE;
  v_count integer;
  v_existing uuid;
  v_state text;
BEGIN
  SELECT public.normalize_user_email(u.email), u.email_confirmed_at
    INTO v_email, v_confirmed
    FROM auth.users u WHERE u.id = p_auth_user_id FOR UPDATE;
  IF v_email IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_UNKNOWN_AUTH_USER' USING ERRCODE = '22023'; END IF;
  IF v_confirmed IS NULL THEN RETURN jsonb_build_object('state', 'pending_verification'); END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('movi-auth-email:' || v_email, 0));
  SELECT count(*) INTO v_count FROM public.users u
   WHERE public.normalize_user_email(u.email) = v_email;

  IF v_count = 0 THEN v_state := 'no_profile';
  ELSIF v_count > 1 THEN v_state := 'review_required';
  ELSE
    SELECT * INTO v_profile FROM public.users u
     WHERE public.normalize_user_email(u.email) = v_email FOR UPDATE;
    SELECT u.id INTO v_existing FROM public.users u
     WHERE u.auth_user_id = p_auth_user_id AND u.id <> v_profile.id FOR UPDATE;
    IF v_existing IS NOT NULL OR (v_profile.auth_user_id IS NOT NULL AND v_profile.auth_user_id <> p_auth_user_id) THEN
      v_state := 'conflict';
    ELSIF v_profile.auth_user_id = p_auth_user_id THEN
      v_state := 'linked';
      INSERT INTO public.user_auth_link_events(auth_user_id, public_user_id, event_type)
      VALUES (p_auth_user_id, v_profile.id, 'idempotent_replay');
    ELSE
      UPDATE public.users SET auth_user_id = p_auth_user_id, updated_at = now()
       WHERE id = v_profile.id AND auth_user_id IS NULL;
      v_state := 'linked';
      INSERT INTO public.user_auth_link_events(auth_user_id, public_user_id, event_type)
      VALUES (p_auth_user_id, v_profile.id, 'linked');
    END IF;
  END IF;

  INSERT INTO public.user_auth_onboarding(
    auth_user_id, flow, state, normalized_email, match_count, linked_public_user_id
  ) VALUES (
    p_auth_user_id, 'activation', v_state, v_email, v_count,
    CASE WHEN v_state = 'linked' THEN v_profile.id END
  ) ON CONFLICT (auth_user_id) DO UPDATE SET
    state = EXCLUDED.state, match_count = EXCLUDED.match_count,
    linked_public_user_id = EXCLUDED.linked_public_user_id, updated_at = now();

  IF v_state <> 'linked' THEN
    INSERT INTO public.user_auth_link_events(auth_user_id, event_type, details)
    VALUES (p_auth_user_id, v_state, jsonb_build_object('match_count', v_count));
  END IF;
  RETURN jsonb_build_object('state', v_state, 'match_count', v_count);
END;
$$;

CREATE FUNCTION public.finalize_verified_auth_signup(p_auth_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_email text;
  v_confirmed timestamptz;
  v_draft public.user_auth_onboarding%ROWTYPE;
  v_email_count integer;
  v_phone_count integer;
  v_user_id uuid;
  v_state text;
BEGIN
  SELECT public.normalize_user_email(u.email), u.email_confirmed_at
    INTO v_email, v_confirmed FROM auth.users u WHERE u.id = p_auth_user_id FOR UPDATE;
  IF v_email IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_UNKNOWN_AUTH_USER' USING ERRCODE = '22023'; END IF;
  IF v_confirmed IS NULL THEN RETURN jsonb_build_object('state', 'pending_verification'); END IF;

  SELECT * INTO v_draft FROM public.user_auth_onboarding
   WHERE auth_user_id = p_auth_user_id AND flow = 'signup' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'missing_signup'); END IF;
  IF v_draft.linked_public_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('state', 'linked');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('movi-auth-email:' || v_email, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-auth-phone:' || v_draft.normalized_phone, 0));
  SELECT count(*) INTO v_email_count FROM public.users u
    WHERE public.normalize_user_email(u.email) = v_email;
  SELECT count(*) INTO v_phone_count FROM public.users u
    WHERE public.normalize_user_mobile_e164(u.phone) = v_draft.normalized_phone;

  IF v_email_count > 1 THEN v_state := 'review_required';
  ELSIF v_email_count > 0 OR v_phone_count > 0 THEN v_state := 'conflict';
  ELSE
    INSERT INTO public.users(
      full_name, phone, email, gender, privacy_accepted_at, terms_accepted_at,
      age_confirmed_at, marketing_accepted, marketing_accepted_at, auth_user_id
    ) VALUES (
      v_draft.full_name, v_draft.normalized_phone, v_email, v_draft.gender,
      v_draft.privacy_accepted_at, v_draft.terms_accepted_at,
      v_draft.age_confirmed_at, v_draft.marketing_accepted,
      v_draft.marketing_accepted_at, p_auth_user_id
    ) RETURNING id INTO v_user_id;
    v_state := 'linked';
  END IF;

  UPDATE public.user_auth_onboarding SET state = v_state,
    match_count = v_email_count, linked_public_user_id = v_user_id, updated_at = now()
   WHERE auth_user_id = p_auth_user_id;
  INSERT INTO public.user_auth_link_events(auth_user_id, public_user_id, event_type, details)
  VALUES (p_auth_user_id, v_user_id,
    CASE WHEN v_state = 'linked' THEN 'profile_created' ELSE 'signup_blocked' END,
    jsonb_build_object('email_matches', v_email_count, 'phone_matches', v_phone_count));
  RETURN jsonb_build_object('state', v_state, 'email_matches', v_email_count, 'phone_matches', v_phone_count);
END;
$$;

ALTER TABLE public.user_auth_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_auth_link_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_auth_onboarding, public.user_auth_link_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.user_auth_link_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_auth_onboarding TO service_role;
GRANT SELECT, INSERT ON public.user_auth_link_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.user_auth_link_events_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.prepare_user_auth_signup(uuid,text,text,text,boolean,boolean,boolean,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_and_link_verified_auth_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_verified_auth_signup(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_user_auth_link_event_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_user_auth_signup(uuid,text,text,text,boolean,boolean,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_and_link_verified_auth_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_verified_auth_signup(uuid) TO service_role;

COMMENT ON TABLE public.user_auth_onboarding IS
  'Private Stage 2 activation/signup state. It is not an identity alias and grants no authorization.';
COMMENT ON FUNCTION public.resolve_and_link_verified_auth_user(uuid) IS
  'Service-only verified-email activation. Derives email from auth.users and never auto-merges duplicates.';
