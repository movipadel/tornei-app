-- MOVI operator permissions Phase 4: atomic Admin operator editor.

ALTER TABLE public.operator_access_audit_events
  ADD COLUMN old_is_active boolean,
  ADD COLUMN new_is_active boolean,
  ADD COLUMN changes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE FUNCTION public.protect_last_active_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $function$
DECLARE
  other_active_admins integer;
BEGIN
  IF OLD.role = 'admin' AND OLD.is_active
     AND (TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NOT NEW.is_active) THEN
    -- Serialize every operation capable of removing an active Admin. Unlike a
    -- count-before-update check, the second concurrent transaction observes
    -- the first transaction's committed result after acquiring this lock.
    PERFORM pg_advisory_xact_lock(42017, 4);
    SELECT count(*) INTO other_active_admins
    FROM public.staff_users
    WHERE role = 'admin' AND is_active AND id <> OLD.id;
    IF other_active_admins = 0 THEN
      RAISE EXCEPTION 'LAST_ACTIVE_ADMIN' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER staff_users_last_active_admin_guard
BEFORE UPDATE OF role, is_active OR DELETE ON public.staff_users
FOR EACH ROW EXECUTE FUNCTION public.protect_last_active_admin();

REVOKE ALL ON FUNCTION public.protect_last_active_admin() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.admin_create_operator(
  p_actor_staff_user_id uuid,
  p_full_name text,
  p_email text,
  p_password text,
  p_role text,
  p_is_active boolean,
  p_permissions text[],
  p_request_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $function$
DECLARE
  created public.staff_users%ROWTYPE;
  desired text[];
BEGIN
  PERFORM pg_advisory_xact_lock(42017, 4);
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_users
    WHERE id = p_actor_staff_user_id AND role = 'admin' AND is_active
  ) THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = 'P0001'; END IF;

  IF p_role NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  IF btrim(coalesce(p_full_name, '')) = '' THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
  IF btrim(coalesce(p_email, '')) = '' OR position('@' in p_email) = 0 THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
  IF length(coalesce(p_password, '')) < 8 THEN RAISE EXCEPTION 'INVALID_PASSWORD'; END IF;

  SELECT coalesce(array_agg(DISTINCT value ORDER BY value), '{}'::text[]) INTO desired
  FROM unnest(coalesce(p_permissions, '{}'::text[])) value;
  IF EXISTS (SELECT 1 FROM unnest(desired) value WHERE value <> ALL (ARRAY[
    'scanner.manage','tournaments.manage','circuits.manage','players.manage','requests.manage',
    'padelleria.manage','communications.manage','moviback.manage','partners.manage','store.manage',
    'monday_league.manage'
  ])) THEN RAISE EXCEPTION 'INVALID_PERMISSION'; END IF;
  IF p_role = 'admin' THEN desired := '{}'::text[]; END IF;

  INSERT INTO public.staff_users(full_name,email,password_hash,role,is_active)
  VALUES (btrim(p_full_name), lower(btrim(p_email)), NULL, p_role, p_is_active)
  RETURNING * INTO created;
  PERFORM public.set_staff_password(created.id, p_password);

  INSERT INTO public.staff_permissions(staff_user_id,permission_key,granted_by_staff_id)
  SELECT created.id, value, p_actor_staff_user_id FROM unnest(desired) value;

  INSERT INTO public.operator_access_audit_events(
    target_staff_user_id,actor_staff_user_id,action,old_role,new_role,
    permissions_added,permissions_removed,old_is_active,new_is_active,request_id,changes
  ) VALUES (
    created.id,p_actor_staff_user_id,'operator.created',NULL,p_role,
    desired,'{}',NULL,p_is_active,p_request_id,
    jsonb_build_object('before',NULL,'after',jsonb_build_object(
      'full_name',created.full_name,'email',created.email,'role',p_role,
      'is_active',p_is_active,'permissions',desired))
  );

  SELECT * INTO created FROM public.staff_users WHERE id = created.id;
  RETURN jsonb_build_object('id',created.id,'updated_at',created.updated_at);
END;
$function$;

CREATE FUNCTION public.admin_update_operator(
  p_actor_staff_user_id uuid,
  p_target_staff_user_id uuid,
  p_expected_updated_at timestamptz,
  p_full_name text,
  p_email text,
  p_role text,
  p_is_active boolean,
  p_permissions text[],
  p_request_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  previous public.staff_users%ROWTYPE;
  current_row public.staff_users%ROWTYPE;
  old_permissions text[];
  desired text[];
  added text[];
  removed text[];
BEGIN
  PERFORM pg_advisory_xact_lock(42017, 4);
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_users
    WHERE id = p_actor_staff_user_id AND role = 'admin' AND is_active
  ) THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO previous FROM public.staff_users WHERE id = p_target_staff_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPERATOR_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF previous.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPERATOR_EDIT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_staff_user_id = p_target_staff_user_id AND NOT p_is_active THEN
    RAISE EXCEPTION 'SELF_DEACTIVATION_DISABLED' USING ERRCODE = 'P0001';
  END IF;
  IF p_role NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  IF btrim(coalesce(p_full_name, '')) = '' THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
  IF btrim(coalesce(p_email, '')) = '' OR position('@' in p_email) = 0 THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;

  SELECT coalesce(array_agg(permission_key ORDER BY permission_key), '{}'::text[])
    INTO old_permissions FROM public.staff_permissions WHERE staff_user_id = previous.id;
  SELECT coalesce(array_agg(DISTINCT value ORDER BY value), '{}'::text[]) INTO desired
    FROM unnest(coalesce(p_permissions, '{}'::text[])) value;
  IF EXISTS (SELECT 1 FROM unnest(desired) value WHERE value <> ALL (ARRAY[
    'scanner.manage','tournaments.manage','circuits.manage','players.manage','requests.manage',
    'padelleria.manage','communications.manage','moviback.manage','partners.manage','store.manage',
    'monday_league.manage'
  ])) THEN RAISE EXCEPTION 'INVALID_PERMISSION'; END IF;
  IF p_role = 'admin' THEN desired := '{}'::text[]; END IF;

  SELECT coalesce(array_agg(value ORDER BY value), '{}'::text[]) INTO added
    FROM unnest(desired) value WHERE NOT (value = ANY(old_permissions));
  SELECT coalesce(array_agg(value ORDER BY value), '{}'::text[]) INTO removed
    FROM unnest(old_permissions) value WHERE NOT (value = ANY(desired));

  UPDATE public.staff_users SET
    full_name = btrim(p_full_name), email = lower(btrim(p_email)), role = p_role,
    is_active = p_is_active, updated_at = now()
  WHERE id = previous.id RETURNING * INTO current_row;

  DELETE FROM public.staff_permissions WHERE staff_user_id = previous.id;
  INSERT INTO public.staff_permissions(staff_user_id,permission_key,granted_by_staff_id)
    SELECT previous.id, value, p_actor_staff_user_id FROM unnest(desired) value;

  INSERT INTO public.operator_access_audit_events(
    target_staff_user_id,actor_staff_user_id,action,old_role,new_role,
    permissions_added,permissions_removed,old_is_active,new_is_active,request_id,changes
  ) VALUES (
    previous.id,p_actor_staff_user_id,'operator.updated',previous.role,p_role,
    added,removed,previous.is_active,p_is_active,p_request_id,
    jsonb_build_object(
      'before',jsonb_build_object('full_name',previous.full_name,'email',previous.email,
        'role',previous.role,'is_active',previous.is_active,'permissions',old_permissions,'updated_at',previous.updated_at),
      'after',jsonb_build_object('full_name',current_row.full_name,'email',current_row.email,
        'role',current_row.role,'is_active',current_row.is_active,'permissions',desired,'updated_at',current_row.updated_at)
    )
  );

  RETURN jsonb_build_object('id',current_row.id,'updated_at',current_row.updated_at,
    'self_demoted',p_actor_staff_user_id = previous.id AND previous.role = 'admin' AND p_role = 'staff');
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_operator(uuid,text,text,text,text,boolean,text[],text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_operator(uuid,uuid,timestamptz,text,text,text,boolean,text[],text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_operator(uuid,text,text,text,text,boolean,text[],text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_operator(uuid,uuid,timestamptz,text,text,text,boolean,text[],text) TO service_role;

COMMENT ON FUNCTION public.admin_update_operator(uuid,uuid,timestamptz,text,text,text,boolean,text[],text) IS
  'Atomically edits operator identity fields, role, active state, complete Staff grant set and append-only audit evidence.';
