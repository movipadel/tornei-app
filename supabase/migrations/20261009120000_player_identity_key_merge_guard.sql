begin;
-- Preserve the legacy correction's point/name/key rules, but never destroy a conflicting certified identity.
create function public.player_identity_merge_legacy_keys(p_circuit uuid,p_group uuid,p_correct text,p_wrong text[],p_name text,p_phone text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ids uuid[];r circuit_results%rowtype;target circuit_results%rowtype;updated integer:=0;deleted integer:=0;cid uuid;
begin
 perform player_identity_admin(p_actor);perform player_identity_lock();
 if nullif(btrim(p_correct),'') is null or cardinality(p_wrong)<1 or cardinality(p_wrong)>100 then raise exception 'KEYS_INVALID';end if;
 if not exists(select 1 from circuit_ranking_groups where id=p_group and circuit_id=p_circuit) then raise exception 'GROUP_INVALID';end if;
 perform id from circuit_results where ranking_group_id=p_group and (player_key=p_correct or player_key=any(p_wrong)) for update;
 select array_agg(distinct player_identity_canonical(player_identity_id)) into ids from circuit_results where ranking_group_id=p_group and (player_key=p_correct or player_key=any(p_wrong)) and player_identity_id is not null;
 if cardinality(ids)>1 then
  cid:=player_identity_case('sporting_merge_conflict','circuit_keys',p_group||':'||p_correct,jsonb_build_object('reason','different_certified_players','correct_key',p_correct,'wrong_keys',p_wrong),ids);
  return jsonb_build_object('state','review','case_id',cid);
 end if;
 for r in select * from circuit_results where ranking_group_id=p_group and player_key=any(p_wrong) and player_key<>p_correct order by id loop
  select * into target from circuit_results where ranking_group_id=p_group and source_tournament_id is not distinct from r.source_tournament_id and player_key=p_correct order by id limit 1;
  if found then
   if target.player_identity_id is null and r.player_identity_id is not null then update circuit_results set player_identity_id=r.player_identity_id where id=target.id;end if;
   delete from circuit_results where id=r.id;deleted:=deleted+1;
  else
   update circuit_results set player_key=p_correct,player_name=coalesce(nullif(btrim(p_name),''),player_name),player_phone=coalesce(nullif(btrim(p_phone),''),player_phone) where id=r.id;updated:=updated+1;
  end if;
  insert into player_identity_events(player_identity_id,actor_admin_id,action,details) values(r.player_identity_id,p_actor,'legacy_key_correction',jsonb_build_object('before',to_jsonb(r),'correct_key',p_correct,'retained_row',target.id));
 end loop;
 return jsonb_build_object('ok',true,'updatedRows',updated,'deletedDuplicates',deleted);
end $$;
revoke all on function public.player_identity_merge_legacy_keys(uuid,uuid,text,text[],text,text,uuid) from public,anon,authenticated;
grant execute on function public.player_identity_merge_legacy_keys(uuid,uuid,text,text[],text,text,uuid) to service_role;
commit;
