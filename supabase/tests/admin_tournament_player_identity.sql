-- Synthetic, transaction-scoped acceptance test. Run against local Supabase only.
begin;
do $$
declare
  actor uuid:=gen_random_uuid();
  tournament_id uuid:=gen_random_uuid();
  pair_id uuid:=gen_random_uuid();
  existing_id uuid:=gen_random_uuid();
  account_id uuid:=gen_random_uuid();
  result jsonb;
  created_id uuid;
  before_count integer;
  after_count integer;
begin
  insert into public.staff_users(id,full_name,email,role,is_active)
    values(actor,'Tournament Fixture Admin','tournament-fixture-admin@example.invalid','admin',true);
  insert into public.tournaments(id,name,type,category,date,time,location,max_participants,registrations_open)
    values(tournament_id,'Tournament Identity Fixture','Baraonda','Libero',current_date,'20:00','Local',8,true),
          (pair_id,'Tournament Pair Fixture','Coppie fisse','Libero',current_date,'20:00','Local',8,true);
  insert into public.player_identities(id,full_name,normalized_phone,gender)
    values(existing_id,'Fixture Existing Player','+393470009901','M');
  result:=public.admin_tournament_register_players(actor,tournament_id,
    jsonb_build_object('p1',jsonb_build_object('kind','identity','player_identity_id',existing_id)));
  if result->>'p1_player_identity_id' is distinct from existing_id::text then raise exception 'IDENTITY_NOT_PERSISTED'; end if;
  if not exists(select 1 from public.tournament_registrations where id=(result->>'id')::uuid
    and p1_name='Fixture Existing Player' and p1_phone='+393470009901'
    and user_id is null and p1_player_identity_id=existing_id) then raise exception 'CANONICAL_SNAPSHOT_OR_USER_LINK_WRONG'; end if;
  begin
    perform public.admin_tournament_register_players(actor,tournament_id,
      jsonb_build_object('p1',jsonb_build_object('kind','identity','player_identity_id',existing_id)));
    raise exception 'DUPLICATE_REGISTRATION_ACCEPTED';
  exception when others then
    if sqlerrm<>'PLAYER_ALREADY_REGISTERED' then raise; end if;
  end;
  update public.tournament_registrations set is_reserve=true where id=(result->>'id')::uuid;
  if not exists(select 1 from public.tournament_registrations where id=(result->>'id')::uuid and is_reserve and p1_player_identity_id=existing_id)
  then raise exception 'RESERVE_MOVE_LOST_IDENTITY'; end if;
  insert into public.tournament_registrations(tournament_id,position,p1_name,p1_phone)
    values(tournament_id,9,'Historical Fixture Without Identity','+393470009999');
  if not exists(select 1 from public.tournament_registrations r where r.p1_name='Historical Fixture Without Identity' and r.p1_player_identity_id is null)
  then raise exception 'HISTORICAL_NULL_ID_NOT_SUPPORTED'; end if;
  begin
    perform public.admin_tournament_register_players(actor,pair_id,
      jsonb_build_object('p1',jsonb_build_object('kind','identity','player_identity_id',existing_id),
                         'p2',jsonb_build_object('kind','identity','player_identity_id',existing_id)));
    raise exception 'SAME_IDENTITY_ACCEPTED';
  exception when others then
    if sqlerrm<>'SAME_PLAYER_TWICE' then raise; end if;
  end;
  begin
    perform public.admin_tournament_register_players(actor,pair_id,
      jsonb_build_object('p1',jsonb_build_object('kind','new','confirmed',true,'full_name','Duplicate Phone','phone','+393470009901'),
                         'p2',jsonb_build_object('kind','identity','player_identity_id',existing_id)));
    raise exception 'DUPLICATE_PHONE_ACCEPTED';
  exception when others then
    if sqlerrm<>'EXISTING_PLAYER_OR_ACCOUNT_SELECT_REQUIRED' then raise; end if;
  end;
  select count(*) into before_count from public.player_identities where normalized_phone='+393470009902';
  begin
    perform public.admin_tournament_register_players(actor,pair_id,
      jsonb_build_object('p1',jsonb_build_object('kind','new','confirmed',true,'full_name','Fixture Rolled Back','phone','+393470009902'),
                         'p2',null));
    raise exception 'INVALID_REGISTRATION_ACCEPTED';
  exception when others then
    -- The caller's failed statement must leave no identity behind.
    if sqlerrm<>'PLAYER_SELECTION_REQUIRED' then raise; end if;
  end;
  select count(*) into after_count from public.player_identities where normalized_phone='+393470009902';
  if before_count<>after_count then raise exception 'ORPHAN_IDENTITY_AFTER_FAILURE'; end if;
  result:=public.admin_tournament_register_players(actor,pair_id,
    jsonb_build_object('p1',jsonb_build_object('kind','new','confirmed',true,'full_name','Fixture New Player','phone','+393470009903','gender','F'),
                       'p2',jsonb_build_object('kind','identity','player_identity_id',existing_id)));
  created_id:=(result->>'p1_player_identity_id')::uuid;
  if not exists(select 1 from public.tournament_registrations where id=(result->>'id')::uuid
    and p1_player_identity_id=created_id and p2_player_identity_id=existing_id and p1_gender='F' and user_id is null)
  then raise exception 'ATOMIC_NEW_PLAYER_REGISTRATION_FAILED'; end if;
  insert into public.users(id,full_name,phone,email,gender,identity_status)
    values(account_id,'Fixture Account Only','+393470009904','fixture-account-only@example.invalid','M','active');
  result:=public.admin_tournament_register_players(actor,tournament_id,
    jsonb_build_object('p1',jsonb_build_object('kind','account','account_user_id',account_id,'confirmed',true)));
  if not exists(select 1 from public.tournament_registrations where id=(result->>'id')::uuid and user_id=account_id
    and p1_player_identity_id=(result->>'p1_player_identity_id')::uuid)
  then raise exception 'ACCOUNT_ONLY_RESOLUTION_FAILED'; end if;
  if not exists(select 1 from public.player_identities where account_user_id=account_id and id=(result->>'p1_player_identity_id')::uuid)
  then raise exception 'ACCOUNT_IDENTITY_NOT_LINKED'; end if;
  if exists(select 1 from public.tournament_registrations r where r.tournament_id=pair_id and r.p1_player_identity_id is null)
  then raise exception 'NULL_NEW_IDENTITY'; end if;
end $$;
rollback;
