-- LOCAL-only transactional verification for Phase 4 operator editor.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;

INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES
('17100000-0000-4000-8000-000000000001','Phase 4 Actor','phase4-actor@example.invalid','admin',true),
('17100000-0000-4000-8000-000000000002','Phase 4 Safety','phase4-safety@example.invalid','admin',true);

SELECT public.admin_create_operator('17100000-0000-4000-8000-000000000001','Created Admin','phase4-created-admin@example.invalid','password-123','admin',true,ARRAY['scanner.manage'],'sql-create-admin');
SELECT public.admin_create_operator('17100000-0000-4000-8000-000000000001','Scanner Staff','phase4-scanner@example.invalid','password-123','staff',true,ARRAY['scanner.manage'],'sql-create-scanner');
SELECT public.admin_create_operator('17100000-0000-4000-8000-000000000001','Combo Staff','phase4-combo@example.invalid','password-123','staff',true,ARRAY['tournaments.manage','padelleria.manage'],'sql-create-combo');
SELECT public.admin_create_operator('17100000-0000-4000-8000-000000000001','Empty Staff','phase4-empty@example.invalid','password-123','staff',true,'{}','sql-create-empty');

SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.staff_permissions p JOIN public.staff_users s ON s.id=p.staff_user_id WHERE s.email='phase4-created-admin@example.invalid'),'Admin creation has no grants');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.staff_permissions p JOIN public.staff_users s ON s.id=p.staff_user_id WHERE s.email='phase4-scanner@example.invalid' AND p.permission_key='scanner.manage'),'Scanner Staff has exact grant');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.staff_permissions p JOIN public.staff_users s ON s.id=p.staff_user_id WHERE s.email='phase4-combo@example.invalid'),'combined Staff has two grants');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.staff_permissions p JOIN public.staff_users s ON s.id=p.staff_user_id WHERE s.email='phase4-empty@example.invalid'),'empty Staff has zero grants');

DO $$ DECLARE target public.staff_users%ROWTYPE; BEGIN
 SELECT * INTO target FROM public.staff_users WHERE email='phase4-combo@example.invalid';
 PERFORM public.admin_update_operator('17100000-0000-4000-8000-000000000001',target.id,target.updated_at,'Combo Renamed','phase4-combo-renamed@example.invalid','staff',true,ARRAY['circuits.manage','players.manage'],'sql-replace');
 SELECT * INTO target FROM public.staff_users WHERE id=target.id;
 PERFORM public.admin_update_operator('17100000-0000-4000-8000-000000000001',target.id,target.updated_at,target.full_name,target.email,'admin',true,'{}','sql-promote');
 SELECT * INTO target FROM public.staff_users WHERE id=target.id;
 PERFORM public.admin_update_operator('17100000-0000-4000-8000-000000000001',target.id,target.updated_at,target.full_name,target.email,'staff',false,ARRAY['tournaments.manage'],'sql-demote-deactivate');
END $$;
SELECT pg_temp.assert_true((SELECT role='staff' AND NOT is_active FROM public.staff_users WHERE email='phase4-combo-renamed@example.invalid'),'role/status updated atomically');
SELECT pg_temp.assert_true((SELECT array_agg(permission_key)=ARRAY['tournaments.manage'] FROM public.staff_permissions p JOIN public.staff_users s ON s.id=p.staff_user_id WHERE s.email='phase4-combo-renamed@example.invalid'),'complete replacement leaves exact desired set');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM public.operator_access_audit_events WHERE request_id IN ('sql-replace','sql-promote','sql-demote-deactivate')),'one audit row per edit');
SELECT pg_temp.assert_true((SELECT old_is_active AND NOT new_is_active AND changes ? 'before' AND changes ? 'after' FROM public.operator_access_audit_events WHERE request_id='sql-demote-deactivate'),'audit records activation and snapshots');

DO $$ DECLARE target public.staff_users%ROWTYPE; BEGIN
 SELECT * INTO target FROM public.staff_users WHERE email='phase4-scanner@example.invalid';
 BEGIN PERFORM public.admin_update_operator('17100000-0000-4000-8000-000000000001',target.id,target.updated_at,target.full_name,target.email,'staff',true,ARRAY['invalid.manage'],'sql-invalid'); RAISE EXCEPTION 'invalid permission accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%INVALID_PERMISSION%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_update_operator('17100000-0000-4000-8000-000000000001',target.id,now()-interval '1 day',target.full_name,target.email,'staff',true,'{}','sql-stale'); RAISE EXCEPTION 'stale edit accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%OPERATOR_EDIT_CONFLICT%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_update_operator('17100000-0000-4000-8000-000000000001','17100000-0000-4000-8000-999999999999',now(),'Missing','missing@example.invalid','staff',true,'{}','sql-missing'); RAISE EXCEPTION 'missing operator accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%OPERATOR_NOT_FOUND%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_update_operator('17100000-0000-4000-8000-000000000001','17100000-0000-4000-8000-000000000001',(SELECT updated_at FROM public.staff_users WHERE id='17100000-0000-4000-8000-000000000001'),'Actor','phase4-actor@example.invalid','admin',false,'{}','sql-self-off'); RAISE EXCEPTION 'self-deactivation accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%SELF_DEACTIVATION_DISABLED%' THEN RAISE; END IF; END;
END $$;

DO $$ BEGIN
 BEGIN UPDATE public.operator_access_audit_events SET action='tampered' WHERE request_id='sql-promote'; RAISE EXCEPTION 'audit update accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OPERATOR_ACCESS_AUDIT_APPEND_ONLY' THEN RAISE; END IF; END;
 BEGIN DELETE FROM public.operator_access_audit_events WHERE request_id='sql-promote'; RAISE EXCEPTION 'audit delete accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OPERATOR_ACCESS_AUDIT_APPEND_ONLY' THEN RAISE; END IF; END;
END $$;

-- Database trigger protection independent of the application/RPC.
UPDATE public.staff_users SET role='staff' WHERE role='admin' AND id<>'17100000-0000-4000-8000-000000000001';
DO $$ BEGIN
 BEGIN UPDATE public.staff_users SET role='staff' WHERE id='17100000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'last Admin demotion accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'LAST_ACTIVE_ADMIN' THEN RAISE; END IF; END;
 BEGIN UPDATE public.staff_users SET is_active=false WHERE id='17100000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'last Admin deactivation accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'LAST_ACTIVE_ADMIN' THEN RAISE; END IF; END;
 BEGIN DELETE FROM public.staff_users WHERE id='17100000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'last Admin deletion accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'LAST_ACTIVE_ADMIN' THEN RAISE; END IF; END;
END $$;

ROLLBACK;
SELECT 'Operator editor SQL PASS (rolled back)' AS result;
