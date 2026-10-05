-- LOCAL-only transactional verification for operator permissions Phase 1.
BEGIN;

CREATE FUNCTION pg_temp.assert_true(value boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
END $$;

SELECT pg_temp.assert_true(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.staff_permissions'::regclass),
  'staff_permissions RLS enabled'
);
SELECT pg_temp.assert_true(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.operator_access_audit_events'::regclass),
  'operator audit RLS enabled'
);
SELECT pg_temp.assert_true(NOT has_table_privilege('anon','public.staff_permissions','SELECT'),'anon cannot read permissions');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.operator_access_audit_events','SELECT'),'authenticated cannot read audit');
-- Phase 1 backfilled operators that existed when its migration ran. Phase 4
-- intentionally permits newly created Staff with an empty explicit grant set,
-- so current rows must no longer be assumed to all have scanner.manage.
SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staff_permissions_key_check'),
  'the strict V1 permission catalogue remains enforced'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.staff_permissions p
    JOIN public.staff_users s ON s.id=p.staff_user_id
    WHERE s.role='admin'
  ),
  'Admin received no backfill rows'
);

INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES
('15000000-0000-4000-8000-000000000001','Permission Admin','permission-admin@example.invalid','admin',true),
('15000000-0000-4000-8000-000000000002','Permission Staff','permission-staff@example.invalid','staff',true),
('15000000-0000-4000-8000-000000000003','Permission Actor','permission-actor@example.invalid','admin',true);

INSERT INTO public.staff_permissions(staff_user_id,permission_key,granted_by_staff_id)
VALUES('15000000-0000-4000-8000-000000000002','tournaments.manage','15000000-0000-4000-8000-000000000003');
SELECT pg_temp.assert_true(
  (SELECT count(*)=1 FROM public.staff_permissions WHERE staff_user_id='15000000-0000-4000-8000-000000000002'),
  'valid exact grant stored'
);

DO $$ BEGIN
  BEGIN
    INSERT INTO public.staff_permissions(staff_user_id,permission_key)
    VALUES('15000000-0000-4000-8000-000000000002','unknown.manage');
    RAISE EXCEPTION 'unknown permission accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

DELETE FROM public.staff_users WHERE id='15000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true(
  (SELECT granted_by_staff_id IS NULL FROM public.staff_permissions WHERE staff_user_id='15000000-0000-4000-8000-000000000002'),
  'deleted grant actor becomes null'
);

INSERT INTO public.operator_access_audit_events(
  target_staff_user_id,action,old_role,new_role,permissions_added,request_id
) VALUES(
  '15000000-0000-4000-8000-000000000002','permissions_changed','staff','staff',
  ARRAY['tournaments.manage'],'local-security-test'
);

DO $$ BEGIN
  BEGIN
    UPDATE public.operator_access_audit_events SET action='tampered'
    WHERE target_staff_user_id='15000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'audit update accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'OPERATOR_ACCESS_AUDIT_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.operator_access_audit_events
    WHERE target_staff_user_id='15000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'audit delete accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'OPERATOR_ACCESS_AUDIT_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.staff_users WHERE id='15000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'audited target delete accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

ROLLBACK;
SELECT 'Operator permissions SQL PASS (rolled back)' AS result;
