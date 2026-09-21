-- MOVI Auth 2.0 Stage 5A: progressive migration for existing normal users.
-- No Auth users are created in bulk and no duplicate is merged automatically.

ALTER TABLE public.users
  ADD COLUMN auth_migration_state text NOT NULL DEFAULT 'legacy'
    CHECK (auth_migration_state IN ('legacy','activation_pending','linked','review_required','conflict','merged'));

UPDATE public.users SET auth_migration_state=CASE
  WHEN identity_status='merged' THEN 'merged'
  WHEN auth_user_id IS NOT NULL THEN 'linked'
  ELSE 'legacy'
END;

CREATE INDEX users_auth_migration_state_idx ON public.users(auth_migration_state,updated_at DESC);

CREATE FUNCTION public.sync_user_auth_migration_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.identity_status='merged' THEN
    NEW.auth_migration_state:='merged';
  ELSIF NEW.auth_user_id IS NOT NULL
    AND (TG_OP='INSERT' OR OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id) THEN
    NEW.auth_migration_state:='linked';
  ELSIF NEW.auth_user_id IS NULL AND NEW.auth_migration_state IN('linked','merged') THEN
    NEW.auth_migration_state:='legacy';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER users_sync_auth_migration_state
BEFORE INSERT OR UPDATE OF auth_user_id,identity_status,auth_migration_state ON public.users
FOR EACH ROW EXECUTE FUNCTION public.sync_user_auth_migration_state();

CREATE TABLE public.user_auth_migration_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN (
    'activation_started','verification_completed','linked','review_required','conflict'
  )),
  public_user_id uuid,
  auth_user_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object')
);

CREATE INDEX user_auth_migration_events_type_time_idx
  ON public.user_auth_migration_events(event_type,occurred_at DESC);

CREATE TRIGGER user_auth_migration_events_immutable
BEFORE UPDATE OR DELETE ON public.user_auth_migration_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_auth_link_event_mutation();

CREATE FUNCTION public.legacy_user_auth_migration_preflight(p_phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_phone text:=public.normalize_user_mobile_e164(p_phone); v_user_id uuid; v_count integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.users WHERE identity_status='active' AND auth_user_id IS NOT NULL
    AND (phone=p_phone OR (v_phone IS NOT NULL AND public.normalize_user_mobile_e164(phone)=v_phone))) THEN
    RETURN jsonb_build_object('state','auth_required');
  END IF;
  IF EXISTS(SELECT 1 FROM public.users WHERE identity_status='merged'
    AND (phone=p_phone OR (v_phone IS NOT NULL AND public.normalize_user_mobile_e164(phone)=v_phone))) THEN
    RETURN jsonb_build_object('state','merged');
  END IF;
  SELECT id INTO v_user_id FROM public.users WHERE identity_status='active' AND auth_user_id IS NULL AND phone=p_phone;
  IF v_user_id IS NULL AND v_phone IS NOT NULL THEN
    SELECT count(*),(array_agg(id ORDER BY id))[1] INTO v_count,v_user_id FROM public.users WHERE identity_status='active' AND auth_user_id IS NULL
      AND public.normalize_user_mobile_e164(phone)=v_phone;
    IF v_count<>1 THEN v_user_id:=NULL; END IF;
  END IF;
  RETURN jsonb_build_object('state','legacy_allowed','public_user_id',v_user_id);
END $$;

CREATE FUNCTION public.start_user_auth_migration(p_public_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.users%rowtype;
BEGIN
  SELECT * INTO u FROM public.users WHERE id=p_public_user_id FOR UPDATE;
  IF u.id IS NULL OR u.identity_status<>'active' THEN
    RETURN jsonb_build_object('state','unavailable');
  END IF;
  IF u.auth_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('state','linked');
  END IF;
  IF u.auth_migration_state IN('review_required','conflict') THEN
    RETURN jsonb_build_object('state',u.auth_migration_state);
  END IF;
  UPDATE public.users SET auth_migration_state='activation_pending',updated_at=now() WHERE id=u.id;
  INSERT INTO public.user_auth_migration_events(event_key,event_type,public_user_id)
  VALUES('activation_started:'||u.id,'activation_started',u.id)
  ON CONFLICT(event_key) DO NOTHING;
  RETURN jsonb_build_object('state','activation_pending');
END $$;

CREATE OR REPLACE FUNCTION public.resolve_and_link_verified_auth_user(p_auth_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE
  v_email text; v_confirmed timestamptz; v_profile public.users%rowtype;
  v_count integer; v_existing uuid; v_state text; v_group_id uuid;
BEGIN
  SELECT public.normalize_user_email(u.email),u.email_confirmed_at INTO v_email,v_confirmed
    FROM auth.users u WHERE u.id=p_auth_user_id FOR UPDATE;
  IF v_email IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_UNKNOWN_AUTH_USER' USING ERRCODE='22023'; END IF;
  IF v_confirmed IS NULL THEN RETURN jsonb_build_object('state','pending_verification'); END IF;

  INSERT INTO public.user_auth_migration_events(event_key,event_type,auth_user_id)
  VALUES('verification_completed:'||p_auth_user_id,'verification_completed',p_auth_user_id)
  ON CONFLICT(event_key) DO NOTHING;

  PERFORM pg_advisory_xact_lock(hashtextextended('movi-auth-email:'||v_email,0));
  SELECT count(*) INTO v_count FROM public.users u
    WHERE u.identity_status='active' AND public.normalize_user_email(u.email)=v_email;

  IF v_count=0 THEN
    v_state:='no_profile';
  ELSIF v_count>1 THEN
    v_state:='review_required';
    UPDATE public.users SET auth_migration_state='review_required',updated_at=now()
      WHERE identity_status='active' AND auth_user_id IS NULL AND public.normalize_user_email(email)=v_email;
    PERFORM public.run_user_duplicate_scan(NULL);
    SELECT id INTO v_group_id FROM public.user_duplicate_review_groups
      WHERE signal_type='normalized_email' AND signal_value=v_email ORDER BY updated_at DESC LIMIT 1;
    IF v_group_id IS NOT NULL THEN
      UPDATE public.user_duplicate_review_groups SET
        warning_flags=CASE WHEN warning_flags ? 'activation_review_required' THEN warning_flags
          ELSE warning_flags||'["activation_review_required"]'::jsonb END,
        updated_at=now() WHERE id=v_group_id;
    END IF;
    INSERT INTO public.user_auth_migration_events(event_key,event_type,auth_user_id,details)
    VALUES('review_required:'||p_auth_user_id,'review_required',p_auth_user_id,jsonb_build_object('match_count',v_count))
    ON CONFLICT(event_key) DO NOTHING;
  ELSE
    SELECT * INTO v_profile FROM public.users u
      WHERE u.identity_status='active' AND public.normalize_user_email(u.email)=v_email FOR UPDATE;
    SELECT u.id INTO v_existing FROM public.users u
      WHERE u.auth_user_id=p_auth_user_id AND u.id<>v_profile.id FOR UPDATE;
    IF v_existing IS NOT NULL OR (v_profile.auth_user_id IS NOT NULL AND v_profile.auth_user_id<>p_auth_user_id) THEN
      v_state:='conflict';
      UPDATE public.users SET auth_migration_state='conflict',updated_at=now() WHERE id=v_profile.id;
      INSERT INTO public.user_auth_migration_events(event_key,event_type,public_user_id,auth_user_id)
      VALUES('conflict:'||p_auth_user_id,'conflict',v_profile.id,p_auth_user_id)
      ON CONFLICT(event_key) DO NOTHING;
    ELSIF v_profile.auth_user_id=p_auth_user_id THEN
      v_state:='linked';
      UPDATE public.users SET auth_migration_state='linked',updated_at=now() WHERE id=v_profile.id;
      INSERT INTO public.user_auth_link_events(auth_user_id,public_user_id,event_type)
      VALUES(p_auth_user_id,v_profile.id,'idempotent_replay');
    ELSE
      UPDATE public.users SET auth_user_id=p_auth_user_id,auth_migration_state='linked',updated_at=now()
        WHERE id=v_profile.id AND auth_user_id IS NULL;
      v_state:='linked';
      INSERT INTO public.user_auth_link_events(auth_user_id,public_user_id,event_type)
      VALUES(p_auth_user_id,v_profile.id,'linked');
    END IF;
    IF v_state='linked' THEN
      INSERT INTO public.user_auth_migration_events(event_key,event_type,public_user_id,auth_user_id)
      VALUES('linked:'||p_auth_user_id,'linked',v_profile.id,p_auth_user_id)
      ON CONFLICT(event_key) DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.user_auth_onboarding(auth_user_id,flow,state,normalized_email,match_count,linked_public_user_id)
  VALUES(p_auth_user_id,'activation',v_state,v_email,v_count,CASE WHEN v_state='linked' THEN v_profile.id END)
  ON CONFLICT(auth_user_id) DO UPDATE SET state=EXCLUDED.state,match_count=EXCLUDED.match_count,
    linked_public_user_id=EXCLUDED.linked_public_user_id,updated_at=now();
  IF v_state<>'linked' THEN
    INSERT INTO public.user_auth_link_events(auth_user_id,event_type,details)
    VALUES(p_auth_user_id,v_state,jsonb_build_object('match_count',v_count));
  END IF;
  RETURN jsonb_build_object('state',v_state,'match_count',v_count);
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
      count(*) FILTER(WHERE identity_status='active' AND auth_user_id IS NOT NULL) auth_linked
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
  ), events AS (
    SELECT count(*) FILTER(WHERE event_type='activation_started') activation_started,
      count(*) FILTER(WHERE event_type='verification_completed') verification_completed,
      count(*) FILTER(WHERE event_type='linked') linked_events,
      count(*) FILTER(WHERE event_type='review_required') review_required_events,
      count(*) FILTER(WHERE event_type='conflict') conflict_events
    FROM public.user_auth_migration_events
  ) SELECT jsonb_build_object(
    'total_users',t.total_users,'legacy_users',t.legacy_users,'activation_pending',t.activation_pending,
    'linked_users',t.linked_users,'review_required_users',t.review_required_users,'conflict_users',t.conflict_users,
    'merged_users',t.merged_users,'unlinked_users',t.unlinked,'auth_linked_users',t.auth_linked,
    'pending_groups',g.pending,'manual_only_groups',g.manual_only,'merged_groups',g.merged_groups,
    'conflicts',g.conflicts,'approved_groups',g.approved,'rejected_groups',g.rejected,'stale_groups',g.stale,
    'activation_started',e.activation_started,'verification_completed',e.verification_completed,
    'linked_events',e.linked_events,'review_required_events',e.review_required_events,'conflict_events',e.conflict_events,
    'completion_percent',CASE WHEN t.total_users=0 THEN 100 ELSE round(100.0*(t.linked_users+t.merged_users)/t.total_users,1) END,
    'completion_definition','linked or merged profiles; review_required and conflict remain incomplete')
  FROM totals t CROSS JOIN groups g CROSS JOIN events e;
$$;

ALTER TABLE public.user_auth_migration_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_auth_migration_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.user_auth_migration_events_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.user_auth_migration_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.user_auth_migration_events_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.sync_user_auth_migration_state(),public.legacy_user_auth_migration_preflight(text),public.start_user_auth_migration(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_user_auth_migration_preflight(text),public.start_user_auth_migration(uuid) TO service_role;

COMMENT ON COLUMN public.users.auth_migration_state IS
  'Stage 5A progressive normal-user Auth migration state; it does not authorize a request.';
COMMENT ON TABLE public.user_auth_migration_events IS
  'Private immutable Stage 5A telemetry without email, password, or token content.';
