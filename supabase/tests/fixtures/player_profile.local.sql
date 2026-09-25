-- Invoked exclusively by the verified local runner. Synthetic profile fixtures.
begin;
do $$declare uid uuid;begin
 foreach uid in array array['eded6000-0000-4000-8000-000000000001'::uuid,'eded6000-0000-4000-8000-000000000002'::uuid] loop
  if not exists(select 1 from player_identities where account_user_id=uid) then insert into player_identities(full_name,normalized_phone,gender,account_user_id) select full_name,normalize_user_mobile_e164(phone),gender,id from users where id=uid;end if;
 end loop;
end $$;
delete from player_profile_availability where player_identity_id=(select id from player_identities where account_user_id='eded6000-0000-4000-8000-000000000002');
delete from player_profiles where player_identity_id=(select id from player_identities where account_user_id='eded6000-0000-4000-8000-000000000002');
delete from player_profile_availability where player_identity_id in ('efee2000-0000-4000-8000-000000000002','efee2000-0000-4000-8000-000000000003');
delete from player_profiles where player_identity_id in ('efee2000-0000-4000-8000-000000000002','efee2000-0000-4000-8000-000000000003');
insert into player_profiles(player_identity_id,descriptive_level,preferred_clubs,available_other_clubs,preferred_match_types,available_last_minute,version,updated_by_user_id)
select id,'intermedio',array['Manta','Saluzzo'],true,array['mixed'],true,1,account_user_id from player_identities where account_user_id='eded6000-0000-4000-8000-000000000001'
on conflict(player_identity_id) do update set descriptive_level=excluded.descriptive_level,preferred_clubs=excluded.preferred_clubs,available_other_clubs=excluded.available_other_clubs,preferred_match_types=excluded.preferred_match_types,available_last_minute=excluded.available_last_minute,version=1,updated_at=now(),updated_by_user_id=excluded.updated_by_user_id,updated_by_admin_id=null;
delete from player_profile_availability where player_identity_id=(select id from player_identities where account_user_id='eded6000-0000-4000-8000-000000000001');
insert into player_profile_availability(player_identity_id,weekday,time_window)
select id,slot.weekday,slot.time_window from player_identities cross join (values(1::smallint,'evening'),(3::smallint,'evening'),(6::smallint,'morning')) slot(weekday,time_window) where account_user_id='eded6000-0000-4000-8000-000000000001';
do $$declare actor uuid;begin
 select id into actor from staff_users where email='padelleria-admin@example.invalid' and role='admin' and is_active;
 insert into player_admin_profiles(player_identity_id,movi_level,movi_level_updated_at,movi_level_updated_by_admin_id,internal_notes,updated_by_admin_id)
 values('efee2000-0000-4000-8000-000000000002',3.5,now(),actor,'Fixture locale: giocatore senza account.',actor),('efee2000-0000-4000-8000-000000000003',4.5,now(),actor,'Fixture locale: identità archiviata.',actor)
 on conflict(player_identity_id) do update set movi_level=excluded.movi_level,movi_level_updated_at=excluded.movi_level_updated_at,movi_level_updated_by_admin_id=excluded.movi_level_updated_by_admin_id,internal_notes=excluded.internal_notes,updated_at=now(),updated_by_admin_id=excluded.updated_by_admin_id;
 insert into player_admin_profiles(player_identity_id,movi_level,movi_level_updated_at,movi_level_updated_by_admin_id,internal_notes,updated_by_admin_id)
 select id,3.5,now(),actor,'Fixture locale: nota User A, invisibile all’utente.',actor from player_identities where account_user_id='eded6000-0000-4000-8000-000000000001'
 on conflict(player_identity_id) do update set movi_level=excluded.movi_level,movi_level_updated_at=excluded.movi_level_updated_at,movi_level_updated_by_admin_id=excluded.movi_level_updated_by_admin_id,internal_notes=excluded.internal_notes,updated_at=now(),updated_by_admin_id=excluded.updated_by_admin_id;
end $$;
commit;
