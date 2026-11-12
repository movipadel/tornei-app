-- Synthetic circuit participant link acceptance. Run only on verified local DB.
begin;
do $$
declare
  v_actor uuid;
  v_user uuid := 'efee1000-0000-4000-8000-000000000001';
  v_player uuid := 'efee2000-0000-4000-8000-000000000001';
  v_tournament uuid := gen_random_uuid();
  v_run uuid := gen_random_uuid();
  v_participant uuid := gen_random_uuid();
  v_result uuid := gen_random_uuid();
  v_case uuid;
  v_ref text;
  v_user_before text;
  v_auth_before integer;
  v_answer jsonb;
begin
  select id into v_actor from public.staff_users
    where email='padelleria-admin@example.invalid' and role='admin' and is_active;
  if v_actor is null or not exists(select 1 from public.player_identities where id=v_player and status='active' and account_user_id=v_user) then
    raise exception 'LOCAL_IDENTITY_FIXTURE_REQUIRED';
  end if;
  select md5(row_to_json(u)::text) into v_user_before from public.users u where u.id=v_user;
  select count(*) into v_auth_before from auth.users;
  insert into public.tournaments(id,name,type,category,level,date,time,location,max_participants,circuit_id,registrations_open)
  values(v_tournament,'Synthetic participant link','Baraonda','Maschile','intermedio',current_date-1,'20:00','Manta',16,
    'efee3000-0000-4000-8000-000000000001',false);
  insert into public.tournament_runs(id,tournament_id,mode,category,status)
  values(v_run,v_tournament,'baraonda','maschile','completed');
  insert into public.tournament_run_participants(id,run_id,name,phone,sex)
  values(v_participant,v_run,'Synthetic alternate sporting name','+393470005101','m');
  insert into public.circuit_results(id,circuit_id,ranking_group_id,source_tournament_id,tournament_name,tournament_type,
    player_key,player_name,player_phone,points,player_identity_id)
  values(v_result,'efee3000-0000-4000-8000-000000000001','efee3100-0000-4000-8000-000000000001',v_tournament,
    'Synthetic participant link','Baraonda','3470005101','Synthetic alternate sporting name','3470005101',125,null);
  v_ref:=v_tournament||':participant:'||v_participant;
  v_case:=public.player_identity_case('circuit_identity_ambiguity','circuit',v_ref,
    jsonb_build_object('reason','conflicting_players','full_name','Synthetic alternate sporting name',
      'phone','+393470005101','player_key','3470005101'),array[v_player]);
  begin
    perform public.player_identity_command(v_actor,'resolve_case',jsonb_build_object(
      'case_id',v_case,'version',1,'player_id',v_player,'reason','','decision','confirm'));
    raise exception 'FAIL: missing Admin reason accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' or sqlerrm <> 'REASON_REQUIRED' then raise; end if;
  end;
  if (select player_identity_id is not null from public.circuit_results where id=v_result) then
    raise exception 'FAIL: rejected link changed result';
  end if;
  v_answer:=public.player_identity_command(v_actor,'resolve_case',jsonb_build_object(
    'case_id',v_case,'version',1,'player_id',v_player,
    'reason','Admin verified synthetic participant identity','decision','confirm'));
  if v_answer->>'state'<>'saved'
     or (select status from public.player_identity_cases where id=v_case)<>'resolved'
     or (select player_identity_id from public.circuit_results where id=v_result)<>v_player
     or (select points from public.circuit_results where id=v_result)<>125
     or (select md5(row_to_json(u)::text) from public.users u where u.id=v_user)<>v_user_before
     or (select count(*) from auth.users)<>v_auth_before then
    raise exception 'FAIL: participant link, points or account invariant';
  end if;
end $$;
rollback;
select 'Synthetic participant link PASS (rolled back)' as result;
