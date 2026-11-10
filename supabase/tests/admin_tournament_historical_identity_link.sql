-- Local synthetic acceptance only. The entire fixture rolls back.
begin;
do $$
declare
  actor uuid:=gen_random_uuid();
  outsider uuid:=gen_random_uuid();
  fixture_circuit_id uuid:=gen_random_uuid();
  ranking_id uuid:=gen_random_uuid();
  historical_tournament uuid:=gen_random_uuid();
  pair_tournament uuid:=gen_random_uuid();
  account_id uuid:=gen_random_uuid();
  account_only_id uuid:=gen_random_uuid();
  linked_player uuid:=gen_random_uuid();
  pair_player uuid:=gen_random_uuid();
  main_registration uuid:=gen_random_uuid();
  reserve_registration uuid:=gen_random_uuid();
  account_registration uuid:=gen_random_uuid();
  new_registration uuid:=gen_random_uuid();
  failed_registration uuid:=gen_random_uuid();
  before_hash text;
  after_hash text;
  linked jsonb;
  new_player uuid;
  before_count integer;
  after_count integer;
begin
  insert into public.staff_users(id,full_name,email,role,is_active)
    values(actor,'Historical Link Fixture Admin','historical-link-admin@example.invalid','admin',true),
          (outsider,'Historical Link Fixture Staff','historical-link-staff@example.invalid','staff',true);
  insert into public.circuits(id,name,slug,tournament_type,status)
    values(fixture_circuit_id,'Synthetic Historical Circuit','synthetic-historical-'||left(fixture_circuit_id::text,8),'Baraonda','active');
  insert into public.circuit_ranking_groups(id,circuit_id,category,level)
    values(ranking_id,fixture_circuit_id,'Libero','principiante');
  insert into public.tournaments(id,name,type,category,level,date,time,location,max_participants,registrations_open,circuit_id,closed_at)
    values(historical_tournament,'Synthetic Completed Baraonda','Baraonda','Libero','principiante',current_date-30,'20:00','Local',8,false,fixture_circuit_id,now()),
          (pair_tournament,'Synthetic Pair Tournament','Coppie fisse','Libero','principiante',current_date,'20:00','Local',8,true,null,null);
  insert into public.circuit_results(circuit_id,ranking_group_id,source_tournament_id,tournament_name,tournament_type,tournament_date,player_key,player_name,points)
    values(fixture_circuit_id,ranking_id,historical_tournament,'Synthetic Completed Baraonda','Baraonda',current_date-30,'synthetic-rank-key','Synthetic Rank Player',450);
  select md5(string_agg(to_jsonb(x)::text,'|' order by x.id)) into before_hash
    from public.circuit_results x where x.circuit_id=fixture_circuit_id;

  insert into public.users(id,full_name,phone,email,gender,identity_status)
    values(account_id,'Synthetic Linked Player','+393470008801','historical-linked@example.invalid','F','active'),
          (account_only_id,'Synthetic Account Only','+393470008804','historical-account@example.invalid','M','active');
  insert into public.player_identities(id,full_name,normalized_phone,gender,account_user_id)
    values(linked_player,'Synthetic Linked Player','+393470008801','F',account_id),
          (pair_player,'Synthetic Pair Player','+393470008802','M',null);
  insert into public.tournament_registrations(id,tournament_id,position,p1_name,p1_phone,p1_gender)
    values(main_registration,historical_tournament,1,'Synthetic Linked Player','+393470008801','F');
  insert into public.tournament_registrations(id,tournament_id,position,is_reserve,p1_name,p1_phone,p1_gender,p2_name,p2_phone,p2_gender)
    values(reserve_registration,pair_tournament,1,true,'Synthetic New Pair','+393470008803','F','Synthetic Pair Player','+393470008802','M'),
          (failed_registration,pair_tournament,2,true,'Synthetic Failed New','+393470008805','M','Synthetic Unlinked Partner','+393470008806','F');
  insert into public.tournament_registrations(id,tournament_id,position,p1_name,p1_phone,p1_gender)
    values(account_registration,historical_tournament,2,'Synthetic Account Only','+393470008804','M'),
          (new_registration,historical_tournament,3,'Synthetic Brand New','+393470008807','F');

  begin
    perform public.admin_tournament_link_registration_identity(outsider,historical_tournament,main_registration,
      jsonb_build_object('slot','p1','kind','identity','confirmed',true,'player_identity_id',linked_player,
        'expected_name','Synthetic Linked Player','expected_phone','+393470008801',
        'expected_is_reserve',false,'expected_current_identity_id',null,
        'expected_candidate_name','Synthetic Linked Player','expected_candidate_phone','+393470008801'));
    raise exception 'UNAUTHORIZED_LINK_ACCEPTED';
  exception when others then if sqlerrm<>'TOURNAMENT_PERMISSION_REQUIRED' then raise; end if; end;

  linked:=public.admin_tournament_link_registration_identity(actor,historical_tournament,main_registration,
    jsonb_build_object('slot','p1','kind','identity','confirmed',true,'player_identity_id',linked_player,
      'expected_name','Synthetic Linked Player','expected_phone','+393470008801',
      'expected_is_reserve',false,'expected_current_identity_id',null,
      'expected_candidate_name','Synthetic Linked Player','expected_candidate_phone','+393470008801'));
  if linked->>'player_identity_id' is distinct from linked_player::text
     or not exists (select 1 from public.tournament_registrations
       where id=main_registration and p1_player_identity_id=linked_player and user_id is null)
  then raise exception 'COMPLETED_P1_LINK_FAILED'; end if;
  if not exists(select 1 from public.tournaments where id=historical_tournament and closed_at is not null and not registrations_open)
  then raise exception 'COMPLETED_TOURNAMENT_STATE_CHANGED'; end if;

  linked:=public.admin_tournament_link_registration_identity(actor,pair_tournament,reserve_registration,
    jsonb_build_object('slot','p2','kind','identity','confirmed',true,'player_identity_id',pair_player,
      'expected_name','Synthetic Pair Player','expected_phone','+393470008802',
      'expected_is_reserve',true,'expected_current_identity_id',null,
      'expected_candidate_name','Synthetic Pair Player','expected_candidate_phone','+393470008802'));
  if not exists(select 1 from public.tournament_registrations where id=reserve_registration
    and is_reserve and p1_player_identity_id is null and p2_player_identity_id=pair_player)
  then raise exception 'RESERVE_P2_INDEPENDENCE_FAILED'; end if;
  begin
    perform public.admin_tournament_link_registration_identity(actor,pair_tournament,reserve_registration,
      jsonb_build_object('slot','p1','kind','identity','confirmed',true,'player_identity_id',pair_player,
        'expected_name','Synthetic New Pair','expected_phone','+393470008803',
        'expected_is_reserve',true,'expected_current_identity_id',null,
        'expected_candidate_name','Synthetic Pair Player','expected_candidate_phone','+393470008802'));
    raise exception 'SAME_PAIR_PLAYER_ACCEPTED';
  exception when others then if sqlerrm<>'SAME_PLAYER_TWICE' then raise; end if; end;

  linked:=public.admin_tournament_link_registration_identity(actor,historical_tournament,account_registration,
    jsonb_build_object('slot','p1','kind','account','confirmed',true,'account_user_id',account_only_id,
      'expected_name','Synthetic Account Only','expected_phone','+393470008804',
      'expected_is_reserve',false,'expected_current_identity_id',null,
      'expected_candidate_name','Synthetic Account Only','expected_candidate_phone','+393470008804'));
  if not exists (select 1 from public.tournament_registrations r
    join public.player_identities p on p.id=r.p1_player_identity_id
    where r.id=account_registration and p.account_user_id=account_only_id and r.user_id is null)
  then raise exception 'ACCOUNT_ONLY_CANONICAL_RESOLUTION_FAILED'; end if;

  select count(*) into before_count from public.player_identities where normalized_phone='+393470008805';
  begin
    perform public.admin_tournament_link_registration_identity(actor,pair_tournament,failed_registration,
      jsonb_build_object('slot','p1','kind','new','confirmed',true,'full_name','Synthetic Failed New',
        'phone','+393470008805','gender','F','expected_name','Synthetic Failed New',
        'expected_phone','+393470008805','expected_is_reserve',true,'expected_current_identity_id',null));
    raise exception 'GENDER_CONFLICT_ACCEPTED';
  exception when others then if sqlerrm<>'GENDER_CONFLICT' then raise; end if; end;
  select count(*) into after_count from public.player_identities where normalized_phone='+393470008805';
  if before_count<>after_count then raise exception 'ORPHAN_IDENTITY_AFTER_FAILED_LINK'; end if;

  linked:=public.admin_tournament_link_registration_identity(actor,historical_tournament,new_registration,
    jsonb_build_object('slot','p1','kind','new','confirmed',true,'full_name','Synthetic Brand New',
      'phone','+393470008807','gender','F','expected_name','Synthetic Brand New',
      'expected_phone','+393470008807','expected_is_reserve',false,'expected_current_identity_id',null));
  new_player:=(linked->>'player_identity_id')::uuid;
  if not exists(select 1 from public.tournament_registrations r
    join public.player_identities p on p.id=r.p1_player_identity_id
    where r.id=new_registration and p.id=new_player and p.account_user_id is null and r.user_id is null)
  then raise exception 'ATOMIC_NEW_IDENTITY_LINK_FAILED'; end if;

  select md5(string_agg(to_jsonb(x)::text,'|' order by x.id)) into after_hash
    from public.circuit_results x where x.circuit_id=fixture_circuit_id;
  if after_hash is distinct from before_hash then raise exception 'CIRCUIT_RESULTS_CHANGED'; end if;
  if (select count(*) from public.circuit_results where circuit_id=fixture_circuit_id)<>1
     or (select sum(points) from public.circuit_results where circuit_id=fixture_circuit_id)<>450
  then raise exception 'RANKING_OUTPUT_CHANGED'; end if;
end $$;
rollback;
