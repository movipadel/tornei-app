-- Synthetic local acceptance. Every fixture and action is rolled back.
begin;
do $$
declare
  actor uuid := gen_random_uuid();
  circuit uuid := gen_random_uuid();
  destination uuid := gen_random_uuid();
  other_circuit uuid := gen_random_uuid();
  foreign_group uuid := gen_random_uuid();
  wrong_level_group uuid := gen_random_uuid();
  tournament uuid := gen_random_uuid();
  legacy_tournament uuid := gen_random_uuid();
  admin_registration_tournament uuid := gen_random_uuid();
  registration uuid;
  admin_registration jsonb;
  eligibility jsonb;
  before_results integer;
  before_hash text;
begin
  insert into public.staff_users(id,full_name,email,role,is_active)
  values(actor,'Mixed Stage Fixture Admin','mixed-stage-admin@example.invalid','admin',true);
  insert into public.circuits(id,name,slug,tournament_type,status)
  values(circuit,'Mixed Stage Fixture','mixed-stage-'||left(circuit::text,8),'Baraonda','active'),
        (other_circuit,'Other Fixture','other-stage-'||left(other_circuit::text,8),'Baraonda','active');
  insert into public.circuit_ranking_groups(id,circuit_id,category,level)
  values(destination,circuit,'Libero','principiante'),
        (foreign_group,other_circuit,'Libero','principiante'),
        (wrong_level_group,circuit,'Libero','intermedio');
  insert into public.tournaments(id,name,type,category,level,date,time,location,max_participants,registrations_open,circuit_id,circuit_ranking_group_id)
  values(tournament,'Mixed Fixture','Baraonda','Libero','principiante',current_date,'20:00','Local',8,false,circuit,destination),
        (legacy_tournament,'Legacy Fixture','Baraonda','Libero','principiante',current_date,'20:00','Local',8,false,circuit,null);
  insert into public.tournaments(id,name,type,category,level,date,time,location,max_participants,registrations_open,circuit_id,circuit_ranking_group_id)
  values(admin_registration_tournament,'Mixed Admin Registration Fixture','Baraonda','Misto','principiante',current_date,'20:00','Local',8,true,circuit,destination);
  admin_registration := public.admin_tournament_register_players(actor,admin_registration_tournament,
    jsonb_build_object('p1',jsonb_build_object('kind','new','confirmed',true,
      'full_name','Mixed Admin Registration Synthetic','phone','+393470099088','gender','M')));
  if not exists(select 1 from public.tournament_registrations where id=(admin_registration->>'id')::uuid
    and tournament_id=admin_registration_tournament and p1_gender='M')
  then raise exception 'ADMIN_MISTO_REGISTRATION_REJECTED'; end if;
  select count(*) into before_results from public.circuit_results;
  select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) into before_hash
  from public.circuit_results r;
  for i in 1..8 loop
    insert into public.tournament_registrations(tournament_id,position,p1_name,p1_phone,p1_gender)
    values(tournament,i,'Fixture Player '||i,'+3934700990'||lpad(i::text,2,'0'),case when i<=4 then 'M' else 'F' end)
    returning id into registration;
  end loop;
  eligibility := public.admin_tournament_prepare_mixed(actor,tournament,'eligibility');
  if eligibility->>'eligible' <> 'true' or (eligibility->>'male_count')::int <> 4
     or (eligibility->>'female_count')::int <> 4 then raise exception 'BALANCED_ELIGIBILITY_FAILED'; end if;
  perform public.admin_tournament_prepare_mixed(actor,tournament,'convert_misto',null,null,null,true);
  if not exists(select 1 from public.tournaments where id=tournament and category='Misto' and circuit_ranking_group_id=destination)
  then raise exception 'RANKING_DESTINATION_MOVED'; end if;
  if (select count(*) from public.circuit_results) <> before_results then raise exception 'RESULTS_CHANGED'; end if;
  if (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.circuit_results r) <> before_hash
  then raise exception 'RANKING_FIXTURE_CHANGED'; end if;
  begin
    update public.tournaments set circuit_ranking_group_id=foreign_group where id=tournament;
    raise exception 'CROSS_CIRCUIT_ACCEPTED';
  exception when others then if sqlerrm <> 'RANKING_DESTINATION_INVALID' then raise; end if; end;
  begin
    update public.tournaments set circuit_ranking_group_id=wrong_level_group where id=tournament;
    raise exception 'WRONG_LEVEL_ACCEPTED';
  exception when others then if sqlerrm <> 'RANKING_DESTINATION_INVALID' then raise; end if; end;
  update public.tournament_registrations set p1_gender=null where tournament_id=tournament and position=1;
  eligibility := public.admin_tournament_prepare_mixed(actor,tournament,'eligibility');
  if eligibility->>'reason' <> 'GENERE_NON_INDICATO' then raise exception 'UNKNOWN_GENDER_NOT_BLOCKED'; end if;
  select id into registration from public.tournament_registrations where tournament_id=tournament and position=1;
  begin
    perform public.admin_tournament_prepare_mixed(actor,tournament,'set_gender',registration,'p1',null,true);
    raise exception 'NULL_GENDER_ACCEPTED';
  exception when others then if sqlerrm <> 'GENDER_CONFIRMATION_REQUIRED' then raise; end if; end;
  perform public.admin_tournament_prepare_mixed(actor,tournament,'set_gender',registration,'p1','M',true);
  if not exists(select 1 from public.tournament_registrations where id=registration and p1_gender='M')
  then raise exception 'SNAPSHOT_GENDER_NOT_UPDATED'; end if;
  update public.tournament_registrations set p1_gender='M' where tournament_id=tournament and position=5;
  eligibility := public.admin_tournament_prepare_mixed(actor,tournament,'eligibility');
  if eligibility->>'reason' <> 'GENERI_NON_BILANCIATI' then raise exception 'IMBALANCE_NOT_BLOCKED'; end if;
  update public.tournament_registrations set p1_gender='F' where tournament_id=tournament and position=5;
  update public.tournament_registrations set is_reserve=true where tournament_id=tournament and position=8;
  eligibility := public.admin_tournament_prepare_mixed(actor,tournament,'eligibility');
  if eligibility->>'reason' <> 'NUMERO_GIOCATORI_NON_PARi' then raise exception 'ODD_COUNT_NOT_BLOCKED'; end if;
  update public.tournament_registrations set is_reserve=false where tournament_id=tournament and position=8;
  insert into public.tournament_runs(tournament_id,mode,category,status)
  values(tournament,'baraonda','misto','locked');
  if public.player_identity_materialize_circuit(tournament,
    (select id from public.tournament_runs where tournament_id=tournament),
    jsonb_build_array(jsonb_build_object('circuit_id',circuit,'ranking_group_id',destination,
      'source_tournament_id',tournament,'tournament_name','Mixed Fixture',
      'tournament_type','Baraonda','tournament_date',current_date,
      'player_key','synthetic-mixed-key','player_name','Fixture Result',
      'player_phone','+393470099099','placement',1,'points',50))) <> 1
  then raise exception 'MATERIALIZATION_FAILED'; end if;
  if not exists(select 1 from public.circuit_results where source_tournament_id=tournament and ranking_group_id=destination and points=50)
  then raise exception 'MISTO_DID_NOT_FEED_LIBERO'; end if;
  begin
    update public.tournaments set category='Libero' where id=tournament;
    raise exception 'CATEGORY_CHANGED_AFTER_RUN';
  exception when others then if sqlerrm <> 'TOURNAMENT_CATEGORY_FROZEN' then raise; end if; end;
  if not exists(select 1 from public.tournaments where id=legacy_tournament and circuit_ranking_group_id is null and category='Libero')
  then raise exception 'LEGACY_FALLBACK_CHANGED'; end if;
  insert into public.circuit_results(circuit_id,ranking_group_id,source_tournament_id,tournament_name,tournament_type,tournament_date,player_key,player_name,placement,points)
  values(circuit,destination,legacy_tournament,'Legacy Fixture','Baraonda',current_date,'manual-score-key','Manual Score Fixture',1,40);
  eligibility := public.admin_tournament_prepare_mixed(actor,legacy_tournament,'eligibility');
  if eligibility->>'reason' <> 'TAPPA_GIA_CONCLUSA' then raise exception 'SCORED_STAGE_NOT_BLOCKED'; end if;
  begin
    update public.tournaments set category='Misto' where id=legacy_tournament;
    raise exception 'SCORED_CATEGORY_CHANGED';
  exception when others then if sqlerrm <> 'TOURNAMENT_CATEGORY_FROZEN' then raise; end if; end;
  delete from public.circuit_results where source_tournament_id=legacy_tournament;
  insert into public.tournament_runs(tournament_id,mode,category,status)
  values(legacy_tournament,'baraonda','libero','locked');
  if public.player_identity_materialize_circuit(legacy_tournament,
    (select id from public.tournament_runs where tournament_id=legacy_tournament),
    jsonb_build_array(jsonb_build_object('circuit_id',circuit,'ranking_group_id',destination,
      'source_tournament_id',legacy_tournament,'tournament_name','Legacy Fixture',
      'tournament_type','Baraonda','tournament_date',current_date,
      'player_key','synthetic-legacy-key','player_name','Legacy Fixture Result',
      'player_phone','+393470099098','placement',1,'points',40))) <> 1
  then raise exception 'LEGACY_MATERIALIZATION_FAILED'; end if;
  if not exists(select 1 from public.circuit_results where source_tournament_id=legacy_tournament and ranking_group_id=destination and points=40)
  then raise exception 'LEGACY_FALLBACK_RESULT_MISSING'; end if;
end;
$$;
rollback;
