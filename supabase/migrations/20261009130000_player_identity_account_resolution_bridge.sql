begin;

-- A reviewed sporting case may authorize the existing Auth2 engine to resolve
-- the two account links. The Auth merge remains responsible for every account
-- safety check; this bridge only removes the sporting deadlock atomically.
create or replace function public.player_identity_account_resolution_case(
  p_source_player uuid,p_canonical_player uuid,p_source_user uuid,p_canonical_user uuid
) returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
  select c.id from public.player_identity_cases c
  where c.status='in_review'
    and c.case_type in ('sporting_duplicate','sporting_merge_conflict')
    and c.decision->>'state'='requires_account_resolution'
    and (c.decision->>'selected_account_id')::uuid=p_canonical_user
    and array[p_source_user,p_canonical_user]::uuid[] <@ c.account_ids
    and array[p_source_player,p_canonical_player]::uuid[] <@ c.player_ids
  order by c.updated_at desc limit 1
$$;

create or replace function public.preview_user_merge(p_source_user_id uuid,p_canonical_user_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;s uuid;c uuid;bridge uuid;
begin
 perform player_identity_lock();
 result:=preview_user_merge_pre_player_identity(p_source_user_id,p_canonical_user_id);
 select id into s from player_identities where account_user_id=p_source_user_id;
 select id into c from player_identities where account_user_id=p_canonical_user_id;
 if s is not null and c is not null and s<>c then
  bridge:=player_identity_account_resolution_case(s,c,p_source_user_id,p_canonical_user_id);
  if bridge is null then
   result:=jsonb_set(result,'{conflicts}',(result->'conflicts')||'"different_player_identities"'::jsonb);
   perform player_identity_case('sporting_merge_conflict','account_merge',p_source_user_id||':'||p_canonical_user_id,jsonb_build_object('reason','different_player_identities'),array[s,c],array[p_source_user_id,p_canonical_user_id]);
  else
   result:=result||jsonb_build_object('sporting_resolution_case_id',bridge);
  end if;
 end if;
 return result||jsonb_build_object('fingerprint',md5((result->>'fingerprint')||coalesce(s::text,'')||coalesce(c::text,'')||coalesce(bridge::text,'')),'player_links',jsonb_build_object('source',s,'canonical',c));
end $$;

create or replace function public.player_identity_account_merge_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s uuid;c uuid;bridge uuid;
begin
 if new.identity_status='merged' and old.identity_status<>'merged' then
  perform player_identity_lock();
  select id into s from player_identities where account_user_id=old.id for update;
  select id into c from player_identities where account_user_id=new.merged_into_user_id for update;
  if s is not null and c is not null and s<>c then
   bridge:=player_identity_account_resolution_case(s,c,old.id,new.merged_into_user_id);
   if bridge is null then raise exception 'DIFFERENT_PLAYER_IDENTITIES';end if;
   update player_identities set account_user_id=null,updated_at=clock_timestamp() where id=s;
   update player_identity_cases set
    decision=decision||jsonb_build_object('state','account_resolved','resolved_account_id',new.merged_into_user_id),
    version=version+1,updated_at=clock_timestamp()
   where id=bridge and status='in_review';
   insert into player_identity_events(player_identity_id,case_id,action,details)
   values(s,bridge,'account_resolution_for_sporting_merge',jsonb_build_object('source_user_id',old.id,'canonical_user_id',new.merged_into_user_id));
  elsif s is not null then
   update player_identities set account_user_id=new.merged_into_user_id,updated_at=clock_timestamp() where id=s;
   insert into player_identity_events(player_identity_id,action,details) values(s,'account_merge_transfer',jsonb_build_object('source_user_id',old.id,'canonical_user_id',new.merged_into_user_id));
  end if;
 end if;
 return new;
end $$;

revoke all on function public.player_identity_account_resolution_case(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.player_identity_account_resolution_case(uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.preview_user_merge(uuid,uuid),public.player_identity_account_merge_guard() from public,anon,authenticated;
grant execute on function public.preview_user_merge(uuid,uuid),public.player_identity_account_merge_guard() to service_role;
commit;
