\set ON_ERROR_STOP on
begin;

insert into public.staff_users(id,full_name,email,role,is_active)
values('e1000000-0000-4000-8000-000000000001','Access Admin','access-admin@example.invalid','admin',true);
insert into public.users(id,full_name,phone,email,gender)
values
 ('e2000000-0000-4000-8000-000000000001','Nàdia  D''Angelo','3289254430','nadia.access@example.invalid','F'),
 ('e2000000-0000-4000-8000-000000000002','Multiple One','3476000002','multi-one@example.invalid','M'),
 ('e2000000-0000-4000-8000-000000000003','Multiple Two','+393476000002','multi-two@example.invalid','M');

do $test$
declare v jsonb; r1 public.user_access_help_requests%rowtype; r2 public.user_access_help_requests%rowtype;
  users_before integer; auth_before integer; business_before integer;
begin
  select count(*) into users_before from public.users;
  select count(*) into auth_before from auth.users;
  select (select count(*) from public.loyalty_memberships)
    +(select count(*) from public.store_orders)
    +(select count(*) from public.tournament_registrations)
    +(select count(*) from public.league_team_players) into business_before;

  v:=public.lookup_legacy_profile_for_activation('  NÀDIA d’angelo ','0039 328 925 4430');
  if v->>'state'<>'found' or v->>'public_user_id'<>'e2000000-0000-4000-8000-000000000001' then raise exception 'exact lookup failed: %',v; end if;
  v:=public.lookup_legacy_profile_for_activation('Different Person','3289254430');
  if v->>'state'<>'name_mismatch' then raise exception 'wrong name disclosed/accepted: %',v; end if;
  v:=public.lookup_legacy_profile_for_activation('Multiple One','3476000002');
  if v->>'state'<>'multiple_profiles' then raise exception 'multiple profiles not blocked: %',v; end if;
  v:=public.new_user_profile_preflight('3289254430','new@example.invalid');
  if v->>'state'<>'existing_profile' then raise exception 'phone preflight missed existing profile'; end if;
  v:=public.new_user_profile_preflight('3999999999','nadia.access@example.invalid');
  if v->>'state'<>'existing_profile' then raise exception 'email preflight missed existing profile'; end if;

  r1:=public.create_user_access_help_request(repeat('a',64),'email_inaccessible','e2000000-0000-4000-8000-000000000001',null,'must not persist','3289254430');
  r2:=public.create_user_access_help_request(repeat('a',64),'email_inaccessible','e2000000-0000-4000-8000-000000000001',null,'other','000');
  if r1.id<>r2.id or r1.status<>'open' then raise exception 'help request not idempotent'; end if;
  if r1.submitted_name_normalized is not null or r1.submitted_phone_normalized is not null then raise exception 'known-profile PII was duplicated'; end if;
  r1:=public.close_user_access_help_request(r1.id,'resolved','e1000000-0000-4000-8000-000000000001','Identità verificata fuori banda');
  r2:=public.close_user_access_help_request(r1.id,'resolved','e1000000-0000-4000-8000-000000000001','replay');
  if r1.id<>r2.id or r2.status<>'resolved' then raise exception 'resolve replay not idempotent'; end if;

  r1:=public.create_user_access_help_request(repeat('b',64),'multiple_profiles',null,null,'multiple one','+393476000002');
  r1:=public.close_user_access_help_request(r1.id,'cancelled','e1000000-0000-4000-8000-000000000001',null);
  if r1.status<>'cancelled' then raise exception 'cancel failed'; end if;

  if users_before<>(select count(*) from public.users) or auth_before<>(select count(*) from auth.users) then raise exception 'identity rows changed'; end if;
  if business_before<>(select count(*) from public.loyalty_memberships)+(select count(*) from public.store_orders)+(select count(*) from public.tournament_registrations)+(select count(*) from public.league_team_players) then raise exception 'business rows changed'; end if;
  if exists(select 1 from public.users where id::text like 'e2000000-%' and auth_user_id is not null) then raise exception 'help escalated privileges'; end if;
end $test$;

do $test$ begin
  if has_table_privilege('anon','public.user_access_help_requests','select')
    or has_table_privilege('authenticated','public.user_access_help_requests','select')
    or not has_table_privilege('service_role','public.user_access_help_requests','select') then raise exception 'table grants invalid'; end if;
  if has_function_privilege('anon','public.create_user_access_help_request(text,text,uuid,uuid,text,text)','execute')
    or has_function_privilege('authenticated','public.close_user_access_help_request(uuid,text,uuid,text)','execute')
    or not has_function_privilege('service_role','public.create_user_access_help_request(text,text,uuid,uuid,text,text)','execute') then raise exception 'function grants invalid'; end if;
end $test$;

set local role authenticated;
do $test$ begin
  begin perform count(*) from public.user_access_help_requests; raise exception 'authenticated read private queue'; exception when insufficient_privilege then null; end;
  begin perform public.create_user_access_help_request(repeat('c',64),'email_inaccessible',null,null,null,null); raise exception 'authenticated created help'; exception when insufficient_privilege then null; end;
end $test$;
reset role;

rollback;
