begin;
-- Same player-key convention used by tournament closure and circuit results.
create or replace function public.movi_activity_phone_key(p text) returns text language sql immutable set search_path=public as $$
 select regexp_replace(regexp_replace(regexp_replace(regexp_replace(btrim(coalesce(p,'')),'\s','','g'),'[().-]','','g'),'^(\+39|0039)','',''),'[^0-9]','','g')
$$;
create or replace function public.movi_activity_identity_scope(p_user_id uuid) returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare ids uuid[];keys text[];
begin
 if not exists(select 1 from users where id=p_user_id and identity_status='active') then raise exception 'Active identity required';end if;
 with recursive family(id) as (
  select p_user_id union select a.source_user_id from user_identity_aliases a join family f on f.id=a.canonical_user_id where a.status='active'
 ) select array_agg(id) into ids from family;
 if cardinality(ids)>50 then raise exception 'Identity scope too large';end if;
 select array_agg(distinct public.movi_activity_phone_key(u.phone)) into keys from users u where u.id=any(ids)
 and length(public.movi_activity_phone_key(u.phone))>=8
 and not exists(select 1 from users other where not(other.id=any(ids)) and public.movi_activity_phone_key(other.phone)=public.movi_activity_phone_key(u.phone));
 return jsonb_build_object('user_ids',ids,'player_keys',coalesce(keys,'{}'::text[]));
end $$;
create or replace function public.movi_activity_registrations(p_user_id uuid) returns table(
 id uuid,tournament_id uuid,is_reserve boolean,name text,category text,level text,date date,"time" text,location text,closed_at timestamptz
) language plpgsql stable security invoker set search_path=public as $$
declare scope jsonb; ids uuid[];keys text[];
begin
 scope=public.movi_activity_identity_scope(p_user_id);
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(scope->'user_ids');
 select array_agg(value) into keys from jsonb_array_elements_text(scope->'player_keys');
 return query select r.id,r.tournament_id,r.is_reserve,t.name,t.category,t.level,t.date,t.time,t.location,t.closed_at
 from tournament_registrations r join tournaments t on t.id=r.tournament_id
 where r.user_id=any(ids) or public.movi_activity_phone_key(r.p1_phone)=any(keys) or public.movi_activity_phone_key(r.p2_phone)=any(keys)
 order by t.date desc,r.id limit 501;
end $$;
revoke all on function public.movi_activity_phone_key(text),public.movi_activity_identity_scope(uuid),public.movi_activity_registrations(uuid) from public,anon,authenticated;
grant execute on function public.movi_activity_phone_key(text),public.movi_activity_identity_scope(uuid),public.movi_activity_registrations(uuid) to service_role;
commit;
