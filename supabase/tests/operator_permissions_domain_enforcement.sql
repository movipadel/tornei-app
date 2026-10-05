\set ON_ERROR_STOP on
begin;

do $$
declare
  v_admin uuid := '16200000-0000-4000-8000-000000000001';
  v_staff uuid := '16200000-0000-4000-8000-000000000002';
begin
  insert into public.staff_users(id,full_name,email,password_hash,role,is_active)
  values
    (v_admin,'Phase 2 Admin','phase2-admin@example.invalid','local-only','admin',true),
    (v_staff,'Phase 2 Staff','phase2-staff@example.invalid','local-only','staff',true);

  if not public.operator_has_permission(v_admin,'monday_league.manage') then raise exception 'Admin bypass missing'; end if;
  if public.operator_has_permission(v_staff,'monday_league.manage') then raise exception 'Unexpected Staff grant'; end if;

  begin
    perform public.league_assert_admin(v_staff);
    raise exception 'League permission denial missing';
  exception when others then
    if sqlerrm not like '%ML_ADMIN_REQUIRED%' then raise; end if;
  end;

  insert into public.staff_permissions(staff_user_id,permission_key,granted_by_staff_id)
  values(v_staff,'monday_league.manage',v_admin),(v_staff,'players.manage',v_admin);
  perform public.league_assert_admin(v_staff);

  begin
    perform public.player_profile_write_operator(v_staff,'16200000-0000-4000-8000-000000000099',null,'{"descriptive_level":"Principiante","preferred_clubs":[],"available_other_clubs":false,"preferred_match_types":[],"available_last_minute":false,"availability":[]}'::jsonb,null,'');
    raise exception 'Expected missing player failure';
  exception when others then
    if sqlerrm like '%PLAYER_OPERATOR_REQUIRED%' then raise exception 'Granted Staff was rejected'; end if;
  end;

  delete from public.staff_permissions where staff_user_id=v_staff and permission_key='players.manage';
  begin
    perform public.player_profile_write_operator(v_staff,'16200000-0000-4000-8000-000000000099',null,'{}'::jsonb,null,'');
    raise exception 'Player permission denial missing';
  exception when others then
    if sqlerrm not like '%PLAYER_OPERATOR_REQUIRED%' then raise; end if;
  end;

  update public.staff_users set is_active=false where id=v_staff;
  if public.operator_has_permission(v_staff,'monday_league.manage') then raise exception 'Inactive Staff retained permission'; end if;
end $$;

do $$ begin
  if has_function_privilege('anon','public.operator_has_permission(uuid,text)','EXECUTE') then raise exception 'anon helper execute leaked'; end if;
  if has_function_privilege('authenticated','public.player_profile_write_operator(uuid,uuid,integer,jsonb,numeric,text)','EXECUTE') then raise exception 'authenticated player writer execute leaked'; end if;
end $$;

rollback;
\echo 'Operator domain permission SQL PASS (rolled back)'
