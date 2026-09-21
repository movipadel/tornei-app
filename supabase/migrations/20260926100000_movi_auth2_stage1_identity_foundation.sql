-- MOVI Auth 2.0 Stage 1: additive identity foundation only.
-- This migration does not migrate users, create Auth identities, resolve legacy
-- cookies, or change the current application login flow.

ALTER TABLE public.users
  ADD COLUMN auth_user_id uuid;

ALTER TABLE public.users
  ADD CONSTRAINT users_auth_user_id_fkey
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX users_auth_user_id_unique
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON COLUMN public.users.auth_user_id IS
  'Optional one-to-one link to Supabase Auth. NULL is valid for legacy profiles. Stage 1 does not populate or expose this field.';

CREATE FUNCTION public.normalize_user_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(lower(btrim(p_email)), '');
$$;

COMMENT ON FUNCTION public.normalize_user_email(text) IS
  'Canonical matching helper only: trims and lowercases email. It does not prove ownership and is intentionally not unique in Stage 1.';

CREATE FUNCTION public.normalize_user_mobile_e164(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $$
DECLARE
  v_phone text;
BEGIN
  v_phone := regexp_replace(btrim(p_phone), '[[:space:]().-]+', '', 'g');

  IF v_phone LIKE '00%' THEN
    v_phone := '+' || substring(v_phone FROM 3);
  END IF;

  -- An unprefixed ten-digit Italian mobile is accepted only when it starts
  -- with 3. Short technical values such as 40/41 remain invalid (NULL).
  IF v_phone ~ '^3[0-9]{9}$' THEN
    RETURN '+39' || v_phone;
  END IF;

  -- Italian mobile numbers use exactly ten national digits in this contract.
  IF v_phone ~ '^\+393[0-9]{9}$' THEN
    RETURN v_phone;
  END IF;

  -- Explicit non-Italian international values may be retained when they have
  -- a structurally valid E.164 representation. Stage 1 does not assert that
  -- they are mobile or currently assigned.
  IF v_phone ~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN v_phone;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.normalize_user_mobile_e164(text) IS
  'Returns a conservative E.164 candidate or NULL for invalid/non-person values. It does not verify possession or assignment.';

CREATE INDEX users_normalized_email_idx
  ON public.users (public.normalize_user_email(email))
  WHERE public.normalize_user_email(email) IS NOT NULL;

CREATE INDEX users_normalized_mobile_idx
  ON public.users (public.normalize_user_mobile_e164(phone))
  WHERE public.normalize_user_mobile_e164(phone) IS NOT NULL;

CREATE TABLE public.user_merge_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  source_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  canonical_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'planned' CHECK (
    status IN ('planned', 'running', 'completed', 'failed', 'rolled_back')
  ),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  created_by_staff_id uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  error_metadata jsonb CHECK (
    error_metadata IS NULL OR jsonb_typeof(error_metadata) = 'object'
  ),
  CONSTRAINT user_merge_operations_distinct_users
    CHECK (source_user_id <> canonical_user_id),
  CONSTRAINT user_merge_operations_time_order
    CHECK (
      (started_at IS NULL OR started_at >= created_at)
      AND (completed_at IS NULL OR completed_at >= COALESCE(started_at, created_at))
    )
);

COMMENT ON TABLE public.user_merge_operations IS
  'Administrative merge request/lifecycle foundation. Stage 1 creates no operations for real users and performs no merge.';

CREATE TABLE public.user_identity_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  canonical_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'active', 'revoked')
  ),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  merged_at timestamptz,
  created_by_staff_id uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  merge_operation_id uuid REFERENCES public.user_merge_operations(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT user_identity_aliases_source_unique UNIQUE (source_user_id),
  CONSTRAINT user_identity_aliases_distinct_users
    CHECK (source_user_id <> canonical_user_id),
  CONSTRAINT user_identity_aliases_status_time
    CHECK (
      (status = 'pending' AND merged_at IS NULL)
      OR (status IN ('active', 'revoked') AND merged_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.user_identity_aliases IS
  'Administrative identity mapping. An alias never authenticates a legacy cookie or grants canonical privileges by itself.';

CREATE INDEX user_identity_aliases_canonical_idx
  ON public.user_identity_aliases (canonical_user_id);

CREATE FUNCTION public.prevent_user_identity_alias_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current uuid := NEW.canonical_user_id;
  v_next uuid;
  v_seen uuid[] := ARRAY[NEW.source_user_id];
  v_depth integer := 0;
BEGIN
  WHILE v_current IS NOT NULL LOOP
    IF v_current = ANY(v_seen) THEN
      RAISE EXCEPTION 'MOVI_AUTH_ALIAS_CYCLE'
        USING ERRCODE = '23514';
    END IF;

    v_seen := array_append(v_seen, v_current);
    v_depth := v_depth + 1;

    IF v_depth > 32 THEN
      RAISE EXCEPTION 'MOVI_AUTH_ALIAS_DEPTH_EXCEEDED'
        USING ERRCODE = '23514';
    END IF;

    SELECT a.canonical_user_id
      INTO v_next
      FROM public.user_identity_aliases a
     WHERE a.source_user_id = v_current
       AND a.source_user_id <> NEW.source_user_id;

    v_current := v_next;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER user_identity_aliases_prevent_cycle
BEFORE INSERT OR UPDATE OF source_user_id, canonical_user_id
ON public.user_identity_aliases
FOR EACH ROW
EXECUTE FUNCTION public.prevent_user_identity_alias_cycle();

CREATE TABLE public.user_merge_journal (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES public.user_merge_operations(id) ON DELETE RESTRICT,
  source_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  canonical_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (
    event_type IN ('requested', 'started', 'domain_step', 'completed', 'failed', 'rollback_recorded')
  ),
  domain text,
  status text NOT NULL CHECK (
    status IN ('planned', 'running', 'completed', 'failed', 'skipped', 'rolled_back')
  ),
  actor_staff_id uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  error_metadata jsonb CHECK (
    error_metadata IS NULL OR jsonb_typeof(error_metadata) = 'object'
  ),
  CONSTRAINT user_merge_journal_distinct_users
    CHECK (source_user_id <> canonical_user_id)
);

COMMENT ON TABLE public.user_merge_journal IS
  'Append-only evidence stream for future merge operations and domain steps. Stage 1 performs no merge.';

CREATE INDEX user_merge_journal_operation_idx
  ON public.user_merge_journal (operation_id, id);

CREATE FUNCTION public.prevent_user_merge_journal_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'MOVI_AUTH_MERGE_JOURNAL_IMMUTABLE'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER user_merge_journal_immutable
BEFORE UPDATE OR DELETE ON public.user_merge_journal
FOR EACH ROW
EXECUTE FUNCTION public.prevent_user_merge_journal_mutation();

CREATE FUNCTION public.resolve_canonical_user_id(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current uuid := p_user_id;
  v_next uuid;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_depth integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RETURN NULL;
  END IF;

  LOOP
    IF v_current = ANY(v_seen) THEN
      RAISE EXCEPTION 'MOVI_AUTH_ALIAS_CYCLE'
        USING ERRCODE = '23514';
    END IF;

    v_seen := array_append(v_seen, v_current);

    SELECT a.canonical_user_id
      INTO v_next
      FROM public.user_identity_aliases a
     WHERE a.source_user_id = v_current
       AND a.status = 'active';

    IF v_next IS NULL THEN
      RETURN v_current;
    END IF;

    v_depth := v_depth + 1;
    IF v_depth > 32 THEN
      RAISE EXCEPTION 'MOVI_AUTH_ALIAS_DEPTH_EXCEEDED'
        USING ERRCODE = '23514';
    END IF;

    v_current := v_next;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.resolve_canonical_user_id(uuid) IS
  'Administrative/domain resolution only. It is not used by Stage 1 authentication and cannot upgrade a legacy cookie.';

ALTER TABLE public.user_merge_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_identity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_merge_journal ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_merge_operations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_identity_aliases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_merge_journal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.user_merge_journal_id_seq FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.user_merge_operations TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_identity_aliases TO service_role;
GRANT SELECT, INSERT ON TABLE public.user_merge_journal TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.user_merge_journal_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.normalize_user_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_user_mobile_e164(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_user_identity_alias_cycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_user_merge_journal_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_canonical_user_id(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_user_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_user_mobile_e164(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_canonical_user_id(uuid) TO service_role;

