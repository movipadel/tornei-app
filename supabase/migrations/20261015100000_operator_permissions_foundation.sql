-- MOVI operator permissions Phase 1: DB-authoritative authorization foundation.

CREATE TABLE public.staff_permissions (
  staff_user_id uuid NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by_staff_id uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  CONSTRAINT staff_permissions_pkey PRIMARY KEY (staff_user_id, permission_key),
  CONSTRAINT staff_permissions_key_check CHECK (permission_key = ANY (ARRAY[
    'scanner.manage'::text,
    'tournaments.manage'::text,
    'circuits.manage'::text,
    'players.manage'::text,
    'requests.manage'::text,
    'padelleria.manage'::text,
    'communications.manage'::text,
    'moviback.manage'::text,
    'partners.manage'::text,
    'store.manage'::text,
    'monday_league.manage'::text
  ]))
);

CREATE INDEX staff_permissions_granted_by_idx
  ON public.staff_permissions (granted_by_staff_id)
  WHERE granted_by_staff_id IS NOT NULL;

CREATE TABLE public.operator_access_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_staff_user_id uuid NOT NULL REFERENCES public.staff_users(id) ON DELETE RESTRICT,
  actor_staff_user_id uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (btrim(action) <> ''),
  old_role text CHECK (old_role IS NULL OR old_role = ANY (ARRAY['admin'::text, 'staff'::text])),
  new_role text CHECK (new_role IS NULL OR new_role = ANY (ARRAY['admin'::text, 'staff'::text])),
  permissions_added text[] NOT NULL DEFAULT '{}'::text[],
  permissions_removed text[] NOT NULL DEFAULT '{}'::text[],
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operator_access_audit_added_keys_check CHECK (permissions_added <@ ARRAY[
    'scanner.manage'::text, 'tournaments.manage'::text, 'circuits.manage'::text,
    'players.manage'::text, 'requests.manage'::text, 'padelleria.manage'::text,
    'communications.manage'::text, 'moviback.manage'::text, 'partners.manage'::text,
    'store.manage'::text, 'monday_league.manage'::text
  ]),
  CONSTRAINT operator_access_audit_removed_keys_check CHECK (permissions_removed <@ ARRAY[
    'scanner.manage'::text, 'tournaments.manage'::text, 'circuits.manage'::text,
    'players.manage'::text, 'requests.manage'::text, 'padelleria.manage'::text,
    'communications.manage'::text, 'moviback.manage'::text, 'partners.manage'::text,
    'store.manage'::text, 'monday_league.manage'::text
  ])
);

CREATE INDEX operator_access_audit_target_created_idx
  ON public.operator_access_audit_events (target_staff_user_id, created_at DESC);

CREATE INDEX operator_access_audit_actor_created_idx
  ON public.operator_access_audit_events (actor_staff_user_id, created_at DESC)
  WHERE actor_staff_user_id IS NOT NULL;

CREATE FUNCTION public.prevent_operator_access_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'OPERATOR_ACCESS_AUDIT_APPEND_ONLY';
END;
$function$;

CREATE TRIGGER operator_access_audit_events_immutable
BEFORE UPDATE OR DELETE ON public.operator_access_audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_operator_access_audit_mutation();

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_access_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.staff_permissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.operator_access_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_permissions TO service_role;
GRANT SELECT, INSERT ON TABLE public.operator_access_audit_events TO service_role;

REVOKE ALL ON FUNCTION public.prevent_operator_access_audit_mutation() FROM PUBLIC, anon, authenticated;

-- Backward compatibility: every existing Staff operator keeps the current
-- scanner/points/reward operational capability. Admin requires no grant rows.
INSERT INTO public.staff_permissions (staff_user_id, permission_key)
SELECT id, 'scanner.manage'
FROM public.staff_users
WHERE role = 'staff'
ON CONFLICT (staff_user_id, permission_key) DO NOTHING;

COMMENT ON TABLE public.staff_permissions IS
  'Explicit area grants for Staff operators. Active Admin operators bypass permission rows.';
COMMENT ON TABLE public.operator_access_audit_events IS
  'Append-only evidence for operator role, status and permission changes.';
