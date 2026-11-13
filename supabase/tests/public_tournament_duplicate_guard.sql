-- Local synthetic acceptance. Every fixture and write is rolled back.
begin;
do $$
declare
  circuit uuid := gen_random_uuid();
  ranking_group uuid := gen_random_uuid();
  current_tournament uuid := gen_random_uuid();
  other_tournament uuid := gen_random_uuid();
  historical_tournament uuid := gen_random_uuid();
  pairs_tournament uuid := gen_random_uuid();
  actor uuid[] := array(select gen_random_uuid() from generate_series(1,7));
  player uuid[] := array(select gen_random_uuid() from generate_series(1,7));
  shared_phone_companion uuid := gen_random_uuid();
  result jsonb;
  reserve_id uuid;
  before_results bigint;
begin
  select count(*) into before_results from public.circuit_results;
  insert into public.circuits(id,name,slug,tournament_type,status)
  values(circuit,'Duplicate Guard Fixture','duplicate-guard-'||left(circuit::text,8),'Baraonda','active');
  insert into public.circuit_ranking_groups(id,circuit_id,category,level)
  values(ranking_group,circuit,'Libero','principiante');
  insert into public.tournaments(id,name,type,category,level,date,time,location,max_participants,registrations_open,circuit_id,circuit_ranking_group_id)
  values
    (current_tournament,'Duplicate Guard Current','Baraonda','Libero','principiante',current_date,'20:00','Local',2,true,circuit,ranking_group),
    (other_tournament,'Duplicate Guard Other','Baraonda','Libero','principiante',current_date,'20:00','Local',8,true,circuit,ranking_group),
    (historical_tournament,'Duplicate Guard Historical','Baraonda','Libero','principiante',current_date-7,'20:00','Local',8,false,circuit,ranking_group),
    (pairs_tournament,'Duplicate Guard Pairs','Coppie fisse','Libero','principiante',current_date,'20:00','Local',8,true,circuit,ranking_group);
  for i in 1..7 loop
    insert into public.users(id,full_name,phone,email,gender,identity_status)
    values(actor[i],case when i=4 then 'Synthetic Player 1' else 'Synthetic Player '||i end,
      '+3934799001'||lpad(i::text,2,'0'),
      'duplicate-guard-'||i||'@example.invalid','M','active');
    insert into public.player_identities(id,full_name,normalized_phone,gender,account_user_id)
    values(player[i],case when i=4 then 'Synthetic Player 1' else 'Synthetic Player '||i end,
      '+3934799001'||lpad(i::text,2,'0'),
      'M',actor[i]);
  end loop;
  insert into public.player_identities(id,full_name,normalized_phone,gender)
  values(shared_phone_companion,'Synthetic Shared Phone Companion','+393479900101','M');
  -- The same account in an old event and a circuit result cannot block this event.
  insert into public.tournament_registrations(tournament_id,position,p1_name,p1_phone,user_id,p1_player_identity_id)
  values(historical_tournament,1,'Synthetic Player 1','+393479900101',actor[1],player[1]);
  insert into public.circuit_results(circuit_id,ranking_group_id,source_tournament_id,tournament_name,tournament_type,tournament_date,player_key,player_name,placement,points,player_identity_id)
  values(circuit,ranking_group,historical_tournament,'Duplicate Guard Historical','Baraonda',current_date-7,'synthetic-duplicate-guard','Synthetic Player 1',1,10,player[1]);
  result:=public.public_tournament_register_self(actor[1],current_tournament,null,null,null,null);
  if result->>'id' is null then raise exception 'HISTORY_OR_RESULT_BLOCKED_NEW_REGISTRATION'; end if;
  if (select count(*) from public.circuit_results)<>before_results+1 then raise exception 'RESULTS_CHANGED_BY_REGISTRATION'; end if;
  begin
    perform public.public_tournament_register_self(actor[1],current_tournament,null,null,null,null);
    raise exception 'SAME_ACCOUNT_OR_IDENTITY_ACCEPTED';
  exception when others then if sqlerrm<>'PLAYER_ALREADY_REGISTERED' then raise; end if; end;
  -- The first row has no companion. A second distinct player must not match its blank phone.
  result:=public.public_tournament_register_self(actor[2],current_tournament,null,null,null,null);
  if result->>'id' is null or (select count(*) from public.tournament_registrations where tournament_id=current_tournament and not is_reserve)<>2
  then raise exception 'BLANK_COMPANION_FALSE_DUPLICATE'; end if;
  result:=public.public_tournament_register_self(actor[3],current_tournament,null,null,null,null);
  reserve_id:=(result->>'id')::uuid;
  if not (select is_reserve from public.tournament_registrations where id=reserve_id) then raise exception 'EXPECTED_RESERVE'; end if;
  begin
    perform public.public_tournament_register_self(actor[3],current_tournament,null,null,null,null);
    raise exception 'RESERVE_DUPLICATE_ACCEPTED';
  exception when others then if sqlerrm<>'PLAYER_ALREADY_REGISTERED' then raise; end if; end;
  update public.tournament_registrations set is_reserve=false,position=3 where id=reserve_id;
  begin
    perform public.public_tournament_register_self(actor[3],current_tournament,null,null,null,null);
    raise exception 'PROMOTED_RESERVE_DUPLICATE_ACCEPTED';
  exception when others then if sqlerrm<>'PLAYER_ALREADY_REGISTERED' then raise; end if; end;
  delete from public.tournament_registrations where id=reserve_id;
  result:=public.public_tournament_register_self(actor[3],current_tournament,null,null,null,null);
  if result->>'id' is null then raise exception 'REMOVED_REGISTRATION_STILL_BLOCKED'; end if;
  -- Same display name alone is not a duplicate.
  result:=public.public_tournament_register_self(actor[4],current_tournament,null,null,null,null);
  if result->>'id' is null then raise exception 'NAME_ONLY_FALSE_DUPLICATE'; end if;
  result:=public.public_tournament_register_self(actor[5],current_tournament,null,null,null,null);
  if result->>'id' is null then raise exception 'DISTINCT_PLAYER_FALSE_DUPLICATE'; end if;
  result:=public.public_tournament_register_self(actor[1],other_tournament,null,null,null,null);
  if result->>'id' is null then raise exception 'OTHER_TOURNAMENT_BLOCKED'; end if;
  -- Phone fallback still catches a genuinely unlinked historical slot in this tournament.
  insert into public.tournament_registrations(tournament_id,position,p1_name,p1_phone)
  values(current_tournament,99,'Unlinked Fixture','+393479900106');
  begin
    perform public.public_tournament_register_self(actor[6],current_tournament,null,null,null,null);
    raise exception 'UNLINKED_PHONE_DUPLICATE_ACCEPTED';
  exception when others then if sqlerrm<>'PLAYER_ALREADY_REGISTERED' then raise; end if; end;
  -- A selected companion has its own identity; repeat P1/P2 presence remains blocked.
  result:=public.public_tournament_register_self(actor[1],pairs_tournament,player[7],null,null,null);
  if (result->>'p2_player_identity_id')::uuid<>player[7] then raise exception 'DISTINCT_COMPANION_NOT_LINKED'; end if;
  -- A different canonical companion may share an existing player's phone.
  result:=public.public_tournament_register_self(actor[2],pairs_tournament,shared_phone_companion,null,null,null);
  if (result->>'p2_player_identity_id')::uuid<>shared_phone_companion then raise exception 'SHARED_PHONE_CANONICAL_FALSE_DUPLICATE'; end if;
  begin
    perform public.public_tournament_register_self(actor[7],pairs_tournament,player[2],null,null,null);
    raise exception 'EXISTING_P2_ACCEPTED_AS_P1';
  exception when others then if sqlerrm<>'PLAYER_ALREADY_REGISTERED' then raise; end if; end;
  begin
    perform public.public_tournament_register_self(actor[2],pairs_tournament,player[2],null,null,null);
    raise exception 'SELF_COMPANION_ACCEPTED';
  exception when others then if sqlerrm<>'COMPANION_SELECTION_INVALID' then raise; end if; end;
  if (select count(*) from public.circuit_results)<>before_results+1 then raise exception 'RESULTS_MUTATED'; end if;
end $$;
rollback;
