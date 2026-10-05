-- Invoked exclusively by the verified local runner. Synthetic namespace efee*.
begin;
-- Restore coverage with a new fixture request, without resetting a request changed during earlier visual acceptance.
insert into movi_requests(id,user_id,client_request_id,request_type,clubs,date_mode,time_window,level,training_type,training_goal,notes,telegram_state)
values('efee7000-0000-4000-8000-000000000001','eded6000-0000-4000-8000-000000000001','efee7000-0000-4000-8000-000000000001','allenati',array['Manta'],'flexible','evening','intermedio',array['individual','group'],array['technique','regular'],'Fixture regressione Player Identity locale','disabled') on conflict(id) do nothing;
insert into public.users(id,full_name,phone,email,gender) values
('efee1000-0000-4000-8000-000000000001','Identità Demo Account Uno','+393470005101','identity-one@example.invalid','M'),
('efee1000-0000-4000-8000-000000000002','Identità Demo Account Due','+393470005102','identity-two@example.invalid','F'),
('efee1000-0000-4000-8000-000000000003','Identità Demo Merge Sicuro','+393470005103','identity-safe@example.invalid','M'),
('efee1000-0000-4000-8000-000000000004','Identità Demo Merge Sicuro','3470005103','identity-safe@example.invalid','M'),
('efee1000-0000-4000-8000-000000000005','Identità Demo Automatico','+393470005105','identity-auto@example.invalid','M')
on conflict(id) do nothing;
insert into public.users(id,full_name,phone,email,gender,identity_status) values
('efee1000-0000-4000-8000-000000000006','Retest Account da sistemare','+393470005106','identity-resolution-a@example.invalid','M','active'),
('efee1000-0000-4000-8000-000000000007','Retest Account da sistemare','+393470005107','identity-resolution-b@example.invalid','F','active')
on conflict(id) do nothing;
with fixture(id,full_name,normalized_phone,gender,account_user_id) as (values
('efee2000-0000-4000-8000-000000000001','Identità Demo Account Uno','+393470005101','M','efee1000-0000-4000-8000-000000000001'),
('efee2000-0000-4000-8000-000000000002','Identità Demo P2 senza account','+393470005112','F',null),
('efee2000-0000-4000-8000-000000000003','Identità Demo Archiviata','+393470005113','M',null),
('efee2000-0000-4000-8000-000000000004','Identità Demo Alias','+393470005114','M',null),
('efee2000-0000-4000-8000-000000000005','Identità Demo Canonica','+393470005115','M',null),
('efee2000-0000-4000-8000-000000000006','Identità Demo Omonimo','+393470005116','M',null),
('efee2000-0000-4000-8000-000000000007','Identità Demo Omonimo','+393470005116','M',null),
('efee2000-0000-4000-8000-000000000008','Identità Demo Account Due','+393470005102','F','efee1000-0000-4000-8000-000000000002'),
('efee2000-0000-4000-8000-000000000009','Identità Demo Merge Sicuro','+393470005103','M','efee1000-0000-4000-8000-000000000003'),
('efee2000-0000-4000-8000-000000000010','Identità Demo Automatico','+393470005105','M',null::uuid))
insert into public.player_identities(id,full_name,normalized_phone,gender,account_user_id)
select f.id::uuid,f.full_name,f.normalized_phone,f.gender,f.account_user_id::uuid from fixture f where not exists(select 1 from player_identities p where p.id=f.id::uuid);
with fixture(id,full_name,normalized_phone,gender,account_user_id) as (values
('efee2000-0000-4000-8000-000000000021','Retest Dato Corretto','+393470005121','M',null),
('efee2000-0000-4000-8000-000000000022','Retest Dato Errato','+393470005122','F',null),
('efee2000-0000-4000-8000-000000000023','Retest Sportivo Account A','+393470005123','M','efee1000-0000-4000-8000-000000000006'),
('efee2000-0000-4000-8000-000000000024','Retest Sportivo Account B','+393470005124','F','efee1000-0000-4000-8000-000000000007'),
('efee2000-0000-4000-8000-000000000025','Retest Persona Uno','+393470005125','M',null),
('efee2000-0000-4000-8000-000000000026','Retest Persona Due','+393470005126','F',null::uuid))
insert into public.player_identities(id,full_name,normalized_phone,gender,account_user_id)
select f.id::uuid,f.full_name,f.normalized_phone,f.gender,f.account_user_id::uuid from fixture f where not exists(select 1 from player_identities p where p.id=f.id::uuid);
insert into public.player_identity_cases(id,dedupe_key,case_type,source_kind,source_ref,evidence,player_ids) values
('efee6000-0000-4000-8000-000000000001','fixture:workflow:wrong-data','sporting_duplicate','merge','efee2000-0000-4000-8000-000000000022:efee2000-0000-4000-8000-000000000021',jsonb_build_object('full_name','CASE A — dato sportivo errato'),array['efee2000-0000-4000-8000-000000000021'::uuid,'efee2000-0000-4000-8000-000000000022'::uuid]),
('efee6000-0000-4000-8000-000000000002','fixture:workflow:two-accounts','sporting_duplicate','merge','efee2000-0000-4000-8000-000000000024:efee2000-0000-4000-8000-000000000023',jsonb_build_object('full_name','CASE B — due account da sistemare'),array['efee2000-0000-4000-8000-000000000023'::uuid,'efee2000-0000-4000-8000-000000000024'::uuid]),
('efee6000-0000-4000-8000-000000000003','fixture:workflow:different-people','sporting_duplicate','merge','efee2000-0000-4000-8000-000000000026:efee2000-0000-4000-8000-000000000025',jsonb_build_object('full_name','CASE C — persone diverse'),array['efee2000-0000-4000-8000-000000000025'::uuid,'efee2000-0000-4000-8000-000000000026'::uuid])
on conflict(id) do nothing;
do $$declare actor uuid;preview jsonb;begin
 select id into actor from staff_users where email='padelleria-admin@example.invalid' and is_active and role='admin';
 if actor is null then raise exception 'Local Padelleria admin fixture required';end if;
 if exists(select 1 from player_identities where id='efee2000-0000-4000-8000-000000000003' and status='active') then
  perform player_identity_command(actor,'archive',jsonb_build_object('player_id','efee2000-0000-4000-8000-000000000003','updated_at',(select updated_at from player_identities where id='efee2000-0000-4000-8000-000000000003')));
 end if;
 if exists(select 1 from player_identities where id='efee2000-0000-4000-8000-000000000004' and status='active') then
  preview:=player_identity_merge_preview('efee2000-0000-4000-8000-000000000004','efee2000-0000-4000-8000-000000000005');
  perform player_identity_merge('efee2000-0000-4000-8000-000000000004','efee2000-0000-4000-8000-000000000005',preview->>'fingerprint',actor);
 end if;
 perform player_identity_link_account('efee2000-0000-4000-8000-000000000010','efee1000-0000-4000-8000-000000000005');
 perform preview_user_merge('efee1000-0000-4000-8000-000000000001','efee1000-0000-4000-8000-000000000002');
 perform player_identity_case('sporting_duplicate','merge','efee2000-0000-4000-8000-000000000006:efee2000-0000-4000-8000-000000000007',jsonb_build_object('full_name','Identità Demo Omonimo','phone','+393470005116'),array['efee2000-0000-4000-8000-000000000006'::uuid,'efee2000-0000-4000-8000-000000000007'::uuid]);
end $$;
insert into circuits(id,name,slug,tournament_type,status) values('efee3000-0000-4000-8000-000000000001','Circuito Identità Demo','circuito-identita-demo','Coppie fisse','active') on conflict(id) do nothing;
insert into circuit_points_rules(id,circuit_id,min_admissions,max_admissions,rule_type,stage,points) values('efee3200-0000-4000-8000-000000000001','efee3000-0000-4000-8000-000000000001',1,32,'stage','others',100) on conflict(id) do nothing;
insert into circuit_ranking_groups(id,circuit_id,category,level) values
('efee3100-0000-4000-8000-000000000001','efee3000-0000-4000-8000-000000000001','Maschile','intermedio'),
('efee3100-0000-4000-8000-000000000002','efee3000-0000-4000-8000-000000000001','Misto','intermedio') on conflict(id) do nothing;
insert into tournaments(id,name,type,category,level,date,time,location,max_participants,circuit_id,registrations_open) values
('efee4000-0000-4000-8000-000000000001','Tappa Identità Demo','Coppie fisse','Misto','intermedio',current_date-2,'20:00','Manta',16,'efee3000-0000-4000-8000-000000000001',false) on conflict(id) do nothing;
insert into tournament_registrations(id,tournament_id,position,is_reserve,p1_name,p1_phone,p1_gender,p2_name,p2_phone,p2_gender,user_id) values
('efee4100-0000-4000-8000-000000000001','efee4000-0000-4000-8000-000000000001',1,false,'Identità Demo Account Uno','+393470005101','M','Identità Demo P2 senza account','+393470005112','F','efee1000-0000-4000-8000-000000000001'),
('efee4100-0000-4000-8000-000000000002','efee4000-0000-4000-8000-000000000001',2,false,'Identità Demo Omonimo','+393470005116','M','Identità Demo P2 Seconda','+393470005117','F',null) on conflict(id) do nothing;
insert into tournament_runs(id,tournament_id,mode,category,status) values('efee4200-0000-4000-8000-000000000001','efee4000-0000-4000-8000-000000000001','fixed_pairs','misto','completed') on conflict(id) do nothing;
insert into tournament_run_pairs(id,run_id,registration_id,name) values
('efee4300-0000-4000-8000-000000000001','efee4200-0000-4000-8000-000000000001','efee4100-0000-4000-8000-000000000001','Coppia Demo Uno'),
('efee4300-0000-4000-8000-000000000002','efee4200-0000-4000-8000-000000000001','efee4100-0000-4000-8000-000000000002','Coppia Demo Due') on conflict(id) do nothing;
select player_identity_materialize_circuit('efee4000-0000-4000-8000-000000000001','efee4200-0000-4000-8000-000000000001',(
 select jsonb_agg(jsonb_build_object('circuit_id','efee3000-0000-4000-8000-000000000001','ranking_group_id','efee3100-0000-4000-8000-000000000002','source_tournament_id','efee4000-0000-4000-8000-000000000001','tournament_name','Tappa Identità Demo','tournament_type','Coppie fisse','tournament_date',current_date-2,'player_key',movi_activity_phone_key(phone),'player_name',name,'player_phone',movi_activity_phone_key(phone),'placement',null,'points',100))
 from (select p1_name name,p1_phone phone from tournament_registrations where tournament_id='efee4000-0000-4000-8000-000000000001' union all select p2_name,p2_phone from tournament_registrations where tournament_id='efee4000-0000-4000-8000-000000000001') x));
insert into circuit_results(id,circuit_id,ranking_group_id,tournament_name,tournament_type,player_key,player_name,player_phone,points,player_identity_id) values
('efee4400-0000-4000-8000-000000000001','efee3000-0000-4000-8000-000000000001','efee3100-0000-4000-8000-000000000001','Storico sintetico','Coppie fisse','3470005101','Identità Demo Account Uno','3470005101',80,'efee2000-0000-4000-8000-000000000001') on conflict(id) do nothing;
-- Reuse only the existing synthetic League team; captain/lineup references are untouched.
insert into league_team_players(id,team_id,display_name) values
('efee5000-0000-4000-8000-000000000001','edee8200-0000-4000-8000-000000000001','Identità Demo P2 senza account'),
('efee5000-0000-4000-8000-000000000002','edee8200-0000-4000-8000-000000000001','Identità Demo Canonica') on conflict(id) do nothing;
do $$declare actor uuid;c player_identity_cases%rowtype;begin
 select id into actor from staff_users where email='padelleria-admin@example.invalid';
 perform player_identity_command(actor,'scan_league','{}');
 select * into c from player_identity_cases where source_kind='league' and source_ref='efee5000-0000-4000-8000-000000000002';
 if c.status in ('open','in_review') then perform player_identity_command(actor,'resolve_case',jsonb_build_object('case_id',c.id,'version',c.version,'player_id','efee2000-0000-4000-8000-000000000005','reason','Conferma fixture sintetica','decision','confirm'));end if;
end $$;
commit;
