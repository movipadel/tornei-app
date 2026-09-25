begin;
create function public.player_identity_case_history() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into player_identity_events(case_id,action,details) values(new.id,'case_changed',jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)));
 return new;
end $$;
create trigger player_identity_case_history after update on public.player_identity_cases for each row when(old is distinct from new) execute function public.player_identity_case_history();
revoke all on function public.player_identity_case_history() from public,anon,authenticated,service_role;
create function public.player_identity_command(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p player_identities%rowtype;c player_identity_cases%rowtype;pid uuid;phone text;result jsonb;rec record;candidate_ids uuid[];cid uuid;counted integer:=0;email text;account uuid;ref text;
begin
 perform player_identity_admin(p_actor);perform player_identity_lock();
 if p_action='create' then
  phone:=normalize_user_mobile_e164(p_data->>'phone');
  if phone is null or player_identity_name(p_data->>'full_name')='' then raise exception 'NAME_PHONE_REQUIRED';end if;
  insert into player_identities(full_name,normalized_phone,gender) values(btrim(p_data->>'full_name'),phone,nullif(p_data->>'gender','')) returning * into p;
  insert into player_identity_events(player_identity_id,actor_admin_id,action,details) values(p.id,p_actor,'admin_created',to_jsonb(p));
  return to_jsonb(p);
 elsif p_action in ('update','archive','unarchive','link_account','certify_email') then
  select * into p from player_identities where id=(p_data->>'player_id')::uuid for update;
  if p.id is null or p.status='merged' then raise exception 'PLAYER_NOT_EDITABLE';end if;
  if (p_data->>'updated_at')::timestamptz is distinct from p.updated_at then raise exception 'STALE_PLAYER';end if;
  if p_action='update' then
   update player_identities set full_name=btrim(p_data->>'full_name'),normalized_phone=normalize_user_mobile_e164(p_data->>'phone'),gender=nullif(p_data->>'gender',''),updated_at=clock_timestamp() where id=p.id;
  elsif p_action='archive' then update player_identities set status='archived',archived_at=now(),updated_at=clock_timestamp() where id=p.id;
  elsif p_action='unarchive' then update player_identities set status='active',archived_at=null,updated_at=clock_timestamp() where id=p.id;
  elsif p_action='link_account' then result:=player_identity_link_account(p.id,(p_data->>'account_user_id')::uuid);
  else
   -- No supplied email string is accepted: the evidence comes from a verified Auth record.
   select normalize_user_email(a.email) into email from auth.users a join users u on u.auth_user_id=a.id
   where a.id=(p_data->>'source_auth_user_id')::uuid and a.email_confirmed_at is not null and u.identity_status='active'
   and normalize_user_mobile_e164(u.phone)=p.normalized_phone and player_identity_name(u.full_name)=player_identity_name(p.full_name)
   and u.id=p.account_user_id;
   if email is null then raise exception 'INDEPENDENT_CERTIFIED_SOURCE_REQUIRED';end if;
   insert into player_identity_email_evidence(player_identity_id,normalized_email,source_auth_user_id,certified_by_admin_id)
   values(p.id,email,(p_data->>'source_auth_user_id')::uuid,p_actor) on conflict do nothing;
  end if;
  insert into player_identity_events(player_identity_id,actor_admin_id,action,details) values(p.id,p_actor,p_action,jsonb_build_object('before',to_jsonb(p),'result',result));
  return coalesce(result,jsonb_build_object('state','saved'));
 elsif p_action='merge_preview' then return player_identity_merge_preview((p_data->>'source_id')::uuid,(p_data->>'canonical_id')::uuid);
 elsif p_action='merge' then
  result:=player_identity_merge((p_data->>'source_id')::uuid,(p_data->>'canonical_id')::uuid,p_data->>'fingerprint',p_actor);
  if result->>'state'='merged' then
   update player_identity_cases set status='resolved',version=version+1,decision=result,resolved_at=now(),resolved_by_admin_id=p_actor,updated_at=now()
   where status in ('open','in_review') and case_type in ('sporting_duplicate','sporting_merge_conflict') and source_kind='merge'
   and source_ref=(p_data->>'source_id')||':'||(p_data->>'canonical_id');
  end if;
  return result;
 elsif p_action='scan_league' then
  for rec in select m.* from league_team_players m left join league_player_identity_links l on l.league_team_player_id=m.id where l.id is null and m.is_active order by m.id limit 501 loop
   counted:=counted+1;if counted>500 then raise exception 'LEAGUE_SCAN_LIMIT';end if;
   select array_agg(id order by id) into candidate_ids from player_identities where status='active' and player_identity_name(full_name)=player_identity_name(rec.display_name);
   cid:=player_identity_case('league_identity_confirmation','league',rec.id::text,jsonb_build_object('full_name',rec.display_name,'team_id',rec.team_id,'roster_updated_at',rec.updated_at),coalesce(candidate_ids,'{}'),case when rec.user_id is null then '{}'::uuid[] else array[rec.user_id] end);
  end loop;
  return jsonb_build_object('state','scanned','count',counted);
 elsif p_action='resolve_case' then
  select * into c from player_identity_cases where id=(p_data->>'case_id')::uuid for update;
  if c.id is null or c.version is distinct from (p_data->>'version')::integer or c.status not in ('open','in_review') then raise exception 'STALE_CASE';end if;
  if nullif(btrim(p_data->>'reason'),'') is null then raise exception 'REASON_REQUIRED';end if;
  if p_data->>'decision'='reject' then
   update player_identity_cases set status='rejected',decision=jsonb_build_object('reason',p_data->>'reason'),resolved_at=now(),resolved_by_admin_id=p_actor,version=version+1,updated_at=now() where id=c.id;
  else
   if c.source_kind not in ('league','circuit','account') then raise exception 'USE_SPECIFIC_MERGE_OR_LINK_ACTION';end if;
   pid:=(p_data->>'player_id')::uuid;
   if pid is null and p_data ? 'new_identity' then
    result:=player_identity_command(p_actor,'create',p_data->'new_identity');pid:=(result->>'id')::uuid;
   end if;
   select * into p from player_identities where id=pid and status='active';
   if p.id is null then raise exception 'ACTIVE_PLAYER_REQUIRED';end if;
   if c.source_kind='league' then
    select * into rec from league_team_players where id=c.source_ref::uuid for update;
    if rec.id is null or to_jsonb(rec.updated_at) is distinct from c.evidence->'roster_updated_at' then raise exception 'STALE_ROSTER_RESCAN';end if;
    if rec.user_id is not null and p.account_user_id is distinct from rec.user_id then raise exception 'ROSTER_ACCOUNT_CONFLICT';end if;
    insert into league_player_identity_links(league_team_player_id,player_identity_id,confirmed_by_admin_id,related_case_id)
    values(rec.id,p.id,p_actor,c.id);
   elsif c.source_kind='circuit' then
    ref:=c.source_ref;
    if split_part(ref,':',2)='registration' then
     select case when split_part(ref,':',4)='p1' then p1_name else p2_name end source_name,case when split_part(ref,':',4)='p1' then p1_phone else p2_phone end source_phone into rec from tournament_registrations where id=split_part(ref,':',3)::uuid and tournament_id=split_part(ref,':',1)::uuid for update;
     if not found or player_identity_name(rec.source_name)<>player_identity_name(c.evidence->>'full_name') or normalize_user_mobile_e164(rec.source_phone) is distinct from normalize_user_mobile_e164(c.evidence->>'phone') then raise exception 'STALE_CIRCUIT_SOURCE';end if;
    elsif split_part(ref,':',2)='participant' then
     select name source_name,phone source_phone into rec from tournament_run_participants where id=split_part(ref,':',3)::uuid for update;
     if not found or player_identity_name(rec.source_name)<>player_identity_name(c.evidence->>'full_name') or normalize_user_mobile_e164(rec.source_phone) is distinct from normalize_user_mobile_e164(c.evidence->>'phone') then raise exception 'STALE_CIRCUIT_SOURCE';end if;
    elsif split_part(ref,':',2)<>'key' then raise exception 'CIRCUIT_REFERENCE_INVALID';end if;
    insert into player_identity_events(player_identity_id,case_id,actor_admin_id,action,details) select player_identity_id,c.id,p_actor,'identifier_reassignment',to_jsonb(i) from player_identity_identifiers i where source_kind='circuit' and source_ref=ref;
    insert into player_identity_identifiers(player_identity_id,source_kind,source_ref,legacy_key,source_name,normalized_phone,confirmed_by_admin_id,related_case_id)
    values(p.id,'circuit',ref,c.evidence->>'player_key',player_identity_name(c.evidence->>'full_name'),normalize_user_mobile_e164(c.evidence->>'phone'),p_actor,c.id) on conflict(source_kind,source_ref) do update set player_identity_id=excluded.player_identity_id,source_name=excluded.source_name,normalized_phone=excluded.normalized_phone,confirmed_by_admin_id=p_actor,related_case_id=c.id;
    update circuit_results set player_identity_id=p.id where source_tournament_id=split_part(ref,':',1)::uuid and player_key=c.evidence->>'player_key';
   else
    account:=c.account_ids[1];
    if not exists(select 1 from users where id=account and identity_status='active') or p.account_user_id is not null or exists(select 1 from player_identities where account_user_id=account) then raise exception 'ACCOUNT_LINK_OCCUPIED';end if;
    update player_identities set account_user_id=account,updated_at=clock_timestamp() where id=p.id;
   end if;
   update player_identity_cases set status='resolved',decision=jsonb_build_object('player_id',p.id,'reason',p_data->>'reason'),resolved_at=now(),resolved_by_admin_id=p_actor,version=version+1,updated_at=now() where id=c.id;
  end if;
  insert into player_identity_events(player_identity_id,case_id,actor_admin_id,action,details) values(pid,c.id,p_actor,'case_decision',jsonb_build_object('before',to_jsonb(c),'reason',p_data->>'reason','decision',p_data->>'decision'));
  return jsonb_build_object('state','saved');
 end if;
 raise exception 'UNKNOWN_ACTION';
end $$;
revoke all on function public.player_identity_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.player_identity_command(uuid,text,jsonb) to service_role;
commit;
