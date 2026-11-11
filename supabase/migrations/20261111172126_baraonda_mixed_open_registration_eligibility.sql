begin;

-- Allow preparation while registration remains open; generation closes it.
create or replace function public.admin_tournament_prepare_mixed(
  p_actor uuid, p_tournament uuid, p_action text,
  p_registration uuid default null, p_slot text default null,
  p_gender text default null, p_confirm boolean default false
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare t public.tournaments%rowtype;
declare r public.tournament_registrations%rowtype;
declare g public.circuit_ranking_groups%rowtype;
declare male_count integer;
declare female_count integer;
declare unknown_count integer;
declare player_count integer;
declare reason text;
begin
  if not exists(select 1 from public.staff_users s where s.id = p_actor and s.is_active
    and (s.role = 'admin' or exists(select 1 from public.staff_permissions sp
      where sp.staff_user_id = s.id and sp.permission_key = 'tournaments.manage'))) then
    raise exception 'TOURNAMENT_PERMISSION_REQUIRED';
  end if;
  if p_action = 'eligibility' then
    select * into t from public.tournaments where id = p_tournament;
  else
    select * into t from public.tournaments where id = p_tournament for update;
  end if;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if p_action = 'set_gender' then
    if p_gender is null or p_gender not in ('M','F') or p_slot is null or p_slot not in ('p1','p2') or p_registration is null
      or not p_confirm then raise exception 'GENDER_CONFIRMATION_REQUIRED'; end if;
    if exists(select 1 from public.tournament_runs where tournament_id = t.id)
      or t.closed_at is not null or t.circuit_snapshot_created
      or exists(select 1 from public.circuit_results where source_tournament_id = t.id) then
      raise exception 'TOURNAMENT_CATEGORY_FROZEN'; end if;
    select * into r from public.tournament_registrations
      where id = p_registration and tournament_id = t.id for update;
    if not found or (p_slot = 'p2' and nullif(btrim(r.p2_name),'') is null) then
      raise exception 'REGISTRATION_SLOT_INVALID'; end if;
    if p_slot = 'p1' then
      update public.tournament_registrations set p1_gender = p_gender where id = r.id;
    else
      update public.tournament_registrations set p2_gender = p_gender where id = r.id;
    end if;
  elsif p_action not in ('eligibility','convert_misto','convert_libero') then
    raise exception 'ACTION_INVALID';
  end if;

  select count(*) filter(where p1_gender = 'M'),
         count(*) filter(where p1_gender = 'F'),
         count(*) filter(where p1_gender is null), count(*)
  into male_count, female_count, unknown_count, player_count
  from public.tournament_registrations
  where tournament_id = t.id and not is_reserve;

  if t.type <> 'Baraonda' then reason := 'SOLO_BARAONDA';
  elsif exists(select 1 from public.tournament_runs where tournament_id = t.id) then
    reason := 'RUN_GIA_CREATA';
  elsif t.closed_at is not null or t.circuit_snapshot_created
    or exists(select 1 from public.circuit_results where source_tournament_id = t.id) then
    reason := 'TAPPA_GIA_CONCLUSA';
  elsif t.circuit_id is null then reason := 'CIRCUITO_RICHIESTO';
  elsif t.circuit_ranking_group_id is null then reason := 'CLASSIFICA_ESPPLICITA_RICHIESTA';
  elsif player_count < 4 or mod(player_count,2) <> 0 then reason := 'NUMERO_GIOCATORI_NON_PARi';
  elsif unknown_count > 0 then reason := 'GENERE_NON_INDICATO';
  elsif male_count <> female_count then reason := 'GENERI_NON_BILANCIATI';
  end if;
  if t.circuit_ranking_group_id is not null then
    select * into g from public.circuit_ranking_groups where id=t.circuit_ranking_group_id;
    if not found or g.circuit_id <> t.circuit_id or g.level <> lower(t.level) then
      reason := 'CLASSIFICA_NON_VALIDA'; end if;
  end if;
  if p_action = 'convert_misto' then
    if t.category <> 'Libero' then raise exception 'CATEGORY_CONVERSION_INVALID'; end if;
    if reason is not null then raise exception '%', reason; end if;
    if not p_confirm then raise exception 'CATEGORY_CONFIRMATION_REQUIRED'; end if;
    update public.tournaments set category='Misto' where id=t.id;
  elsif p_action = 'convert_libero' then
    if t.category <> 'Misto' or not p_confirm then raise exception 'CATEGORY_CONVERSION_INVALID'; end if;
    if exists(select 1 from public.tournament_runs where tournament_id=t.id)
      or t.closed_at is not null or t.circuit_snapshot_created
      or exists(select 1 from public.circuit_results where source_tournament_id=t.id) then
      raise exception 'TOURNAMENT_CATEGORY_FROZEN'; end if;
    update public.tournaments set category='Libero' where id=t.id;
  end if;
  return jsonb_build_object('eligible', reason is null, 'reason', reason,
    'male_count', male_count, 'female_count', female_count,
    'unknown_count', unknown_count, 'player_count', player_count,
    'ranking_group_id', t.circuit_ranking_group_id,
    'ranking_category', g.category, 'ranking_level', g.level);
end;
$$;

-- Revalidate the actual main roster under the tournament lock at run insertion.
create or replace function public.tournament_run_category_lock() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare t public.tournaments%rowtype;
declare male_count integer;
declare female_count integer;
declare unknown_count integer;
declare player_count integer;
begin
  -- Registration RPCs lock the same tournament row before accepting a player.
  select * into t from public.tournaments where id = new.tournament_id for update;
  if t.type = 'Baraonda' and t.category = 'Misto' then
    if new.mode <> 'baraonda' or new.category <> 'misto' then
      raise exception 'RUN_CATEGORY_MISMATCH';
    end if;
    select count(*) filter (where p1_gender = 'M'),
           count(*) filter (where p1_gender = 'F'),
           count(*) filter (where p1_gender is distinct from 'M' and p1_gender is distinct from 'F'),
           count(*)
      into male_count, female_count, unknown_count, player_count
      from public.tournament_registrations
      where tournament_id = t.id and not is_reserve;
    if player_count < 4 or mod(player_count, 2) <> 0
      or unknown_count > 0 or male_count <> female_count then
      raise exception 'MIXED_PARTICIPANTS_INVALID';
    end if;
    -- Close in the same statement as run creation: a waiting registration
    -- sees the closed state, while a failed insert rolls this update back.
    update public.tournaments set registrations_open = false
      where id = t.id and registrations_open;
  end if;
  return new;
end;
$$;

commit;
