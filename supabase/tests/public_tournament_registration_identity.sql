-- Synthetic local-only acceptance; every fixture is rolled back.
begin;
do $$
declare
  self_user uuid:=gen_random_uuid();
  new_user uuid:=gen_random_uuid();
  conflict_user uuid:=gen_random_uuid();
  ambiguous_user uuid:=gen_random_uuid();
  companion uuid:=gen_random_uuid();
  linked_player uuid:=gen_random_uuid();
  conflict_player uuid:=gen_random_uuid();
  baraonda uuid:=gen_random_uuid();
  pairs uuid:=gen_random_uuid();
  free_pairs uuid:=gen_random_uuid();
  free_tournament uuid:=gen_random_uuid();
  result jsonb;
  before_results integer;
  before_registrations integer;
begin
  select count(*) into before_results from public.circuit_results;
  insert into public.users(id,full_name,phone,email,gender,identity_status) values
    (self_user,'Public Fixture Self','+393479900001','public-self-fixture@example.invalid','F','active'),
    (new_user,'Public Fixture New','+393479900002','public-new-fixture@example.invalid','M','active'),
    (conflict_user,'Public Fixture Conflict','+393479900004','public-conflict-fixture@example.invalid','M','active'),
    (ambiguous_user,'Public Fixture Ambiguous','+393479900008','public-ambiguous-fixture@example.invalid','M','active');
  insert into public.player_identities(id,full_name,normalized_phone,gender,account_user_id) values
    (linked_player,'Public Fixture Self','+393479900001','F',self_user),
    (companion,'Public Fixture Companion','+393479900005','M',null),
    (conflict_player,'Public Fixture Conflict','+393479900004','F',conflict_user),
    (gen_random_uuid(),'Public Fixture Ambiguous','+393479900008','M',null),
    (gen_random_uuid(),'Public Fixture Ambiguous','+393479900008','M',null);
  insert into public.tournaments(id,name,type,category,date,time,location,max_participants,registrations_open) values
    (baraonda,'Public Identity Baraonda','Baraonda','Misto',current_date,'20:00','Local',2,true),
    (pairs,'Public Identity Pairs','Coppie fisse','Misto',current_date,'20:00','Local',8,true),
    (free_pairs,'Public Identity Free Pairs','Coppie fisse','Libero',current_date,'20:00','Local',8,true),
    (free_tournament,'Public Identity Free','Baraonda','Libero',current_date,'20:00','Local',8,true);

  result:=public.public_tournament_register_self(self_user,baraonda,null,null,null,null);
  if not exists(select 1 from public.tournament_registrations where id=(result->>'id')::uuid
    and user_id=self_user and p1_player_identity_id=linked_player and p1_gender='F'
    and p1_name='Public Fixture Self' and p1_phone='+393479900001') then
    raise exception 'SELF_LINK_OR_GENDER_SNAPSHOT_FAILED'; end if;
  begin
    perform public.public_tournament_register_self(self_user,baraonda,null,null,null,null);
    raise exception 'DUPLICATE_ACCEPTED';
  exception when others then
    if sqlerrm<>'PLAYER_ALREADY_REGISTERED' then raise; end if;
  end;
  begin
    perform public.public_tournament_register_self(new_user,baraonda,null,null,null,'M');
    raise exception 'BARAONDA_COMPANION_ACCEPTED';
  exception when others then
    if sqlerrm<>'COMPANION_NOT_ALLOWED' then raise; end if;
  end;

  result:=public.public_tournament_register_self(new_user,free_tournament,null,null,null,null);
  if not exists(select 1 from public.player_identities where id=(result->>'p1_player_identity_id')::uuid
    and account_user_id=new_user and gender='M') then raise exception 'SAFE_SELF_RESOLUTION_FAILED'; end if;
  if not exists(select 1 from public.tournament_registrations where id=(result->>'id')::uuid and p1_gender='M')
    then raise exception 'LIBERO_KNOWN_GENDER_NOT_SNAPSHOTTED'; end if;
  begin
    perform public.public_tournament_register_self(conflict_user,free_tournament,null,null,null,null);
    raise exception 'GENDER_CONFLICT_ACCEPTED';
  exception when others then
    if sqlerrm<>'PLAYER1_GENDER_CONFLICT' then raise; end if;
  end;
  result:=public.public_tournament_register_self(ambiguous_user,free_tournament,null,null,null,null);
  if result->>'state'<>'review' or not exists (
    select 1 from public.player_identity_cases where source_kind='account_profile'
      and source_ref=ambiguous_user::text and status='open'
  ) or exists(select 1 from public.tournament_registrations where user_id=ambiguous_user) then
    raise exception 'AMBIGUOUS_ACCOUNT_REVIEW_NOT_PRESERVED'; end if;

  result:=public.public_tournament_register_self(self_user,pairs,companion,null,null,null);
  if not exists(select 1 from public.tournament_registrations where id=(result->>'id')::uuid
    and p1_player_identity_id=linked_player and p2_player_identity_id=companion
    and p2_name='Public Fixture Companion' and p2_phone='+393479900005' and p2_gender='M')
    then raise exception 'EXPLICIT_COMPANION_SELECTION_FAILED'; end if;
  begin
    perform public.public_tournament_register_self(new_user,pairs,linked_player,null,null,null);
    raise exception 'COMPANION_DUPLICATE_ACCEPTED';
  exception when others then
    if sqlerrm<>'PLAYER_ALREADY_REGISTERED' then raise; end if;
  end;
  -- A typed name does not establish an identity link.
  result:=public.public_tournament_register_self(new_user,pairs,null,'Unlinked Fixture Companion','+393479900006','F');
  if not exists(select 1 from public.tournament_registrations where id=(result->>'id')::uuid
    and p2_player_identity_id is null and p2_gender='F') then
    raise exception 'TYPED_NAME_AUTO_LINKED'; end if;
  result:=public.public_tournament_register_self(self_user,free_pairs,null,'Unknown Gender Companion','+393479900007',null);
  if not exists(select 1 from public.tournament_registrations where id=(result->>'id')::uuid
    and p2_gender is null and p2_player_identity_id is null) then
    raise exception 'UNKNOWN_COMPANION_GENDER_WAS_GUESSED'; end if;
  if (select count(*) from public.circuit_results)<>before_results then
    raise exception 'CIRCUIT_RESULTS_CHANGED'; end if;
  select count(*) into before_registrations from public.tournament_registrations
    where tournament_id in (baraonda,pairs,free_tournament,free_pairs);
  if before_registrations<>5 then raise exception 'UNEXPECTED_REGISTRATION_COUNT'; end if;
end $$;
rollback;
