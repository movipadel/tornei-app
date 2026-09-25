begin;

create table public.player_identities (
 id uuid primary key default gen_random_uuid(),
 full_name text not null check (length(btrim(full_name)) between 1 and 200),
 normalized_phone text not null check (public.normalize_user_mobile_e164(normalized_phone) is not null and normalized_phone=public.normalize_user_mobile_e164(normalized_phone)),
 gender text check (gender in ('M','F')),
 account_user_id uuid references public.users(id) on delete restrict unique,
 status text not null default 'active' check (status in ('active','archived','merged')),
 merged_into_player_id uuid references public.player_identities(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 archived_at timestamptz, merged_at timestamptz,
 check ((status='active' and archived_at is null and merged_at is null and merged_into_player_id is null)
 or (status='archived' and archived_at is not null and merged_at is null and merged_into_player_id is null)
 or (status='merged' and merged_at is not null and merged_into_player_id is not null and merged_into_player_id<>id and account_user_id is null))
);
create index player_identities_phone_idx on public.player_identities(normalized_phone);
create function public.player_identity_name(p text) returns text language sql immutable set search_path=pg_catalog as $$
 select lower(regexp_replace(btrim(coalesce(p,'')),'\s+',' ','g'))
$$;
create index player_identities_name_idx on public.player_identities(public.player_identity_name(full_name));
create index player_identities_status_idx on public.player_identities(status,updated_at desc);

create table public.player_identity_cases (
 id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
 case_type text not null check(case_type in ('sporting_duplicate','ambiguous_account_link','circuit_identity_ambiguity','league_identity_confirmation','identity_data_conflict','sporting_merge_conflict')),
 status text not null default 'open' check(status in ('open','in_review','resolved','rejected','superseded')),
 player_ids uuid[] not null default '{}', account_ids uuid[] not null default '{}',
 source_kind text not null, source_ref text not null,
 evidence jsonb not null default '{}' check(jsonb_typeof(evidence)='object'),
 version integer not null default 1, decision jsonb,
 resolved_by_admin_id uuid references public.staff_users(id) on delete restrict,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),resolved_at timestamptz
);
create index player_identity_cases_queue_idx on public.player_identity_cases(status,updated_at desc);
-- Source references survive circuit result DELETE/INSERT. Keys are NOT globally unique.
create table public.player_identity_identifiers (
 id uuid primary key default gen_random_uuid(),
 player_identity_id uuid not null references public.player_identities(id) on delete restrict,
 source_kind text not null,source_ref text not null,
 legacy_key text, source_name text, normalized_phone text,
 confirmed_by_admin_id uuid references public.staff_users(id) on delete restrict,
 related_case_id uuid references public.player_identity_cases(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(source_kind,source_ref)
);
create index player_identity_identifiers_key_idx on public.player_identity_identifiers(legacy_key);
create table public.league_player_identity_links (
 id uuid primary key default gen_random_uuid(),
 league_team_player_id uuid not null unique references public.league_team_players(id) on delete restrict,
 player_identity_id uuid not null references public.player_identities(id) on delete restrict,
 confirmed_by_admin_id uuid not null references public.staff_users(id) on delete restrict,
 confirmed_at timestamptz not null default now(),
 related_case_id uuid references public.player_identity_cases(id) on delete restrict,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index league_player_identity_links_player_idx on public.league_player_identity_links(player_identity_id);
-- Email evidence is private, captured only from independently verified Auth data.
create table public.player_identity_email_evidence (
 id uuid primary key default gen_random_uuid(),
 player_identity_id uuid not null references public.player_identities(id) on delete restrict,
 normalized_email text not null,
 source_auth_user_id uuid not null references auth.users(id) on delete restrict,
 certified_by_admin_id uuid not null references public.staff_users(id) on delete restrict,
 created_at timestamptz not null default now(), unique(player_identity_id,source_auth_user_id)
);
create table public.player_identity_events (
 id bigint generated always as identity primary key,
 player_identity_id uuid references public.player_identities(id) on delete restrict,
 case_id uuid references public.player_identity_cases(id) on delete restrict,
 actor_admin_id uuid references public.staff_users(id) on delete restrict,
 action text not null,details jsonb not null default '{}',created_at timestamptz not null default now()
);
alter table public.circuit_results add column player_identity_id uuid references public.player_identities(id) on delete restrict;
create index circuit_results_player_identity_idx on public.circuit_results(player_identity_id) where player_identity_id is not null;

create function public.player_identity_lock() returns void language sql volatile set search_path=pg_catalog as $$
 select pg_advisory_xact_lock(hashtextextended('movi-player-identities-v1',0))
$$;
create function public.player_identity_admin(p_actor uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from staff_users where id=p_actor and role='admin' and is_active) then raise exception 'ADMIN_REQUIRED';end if;
end $$;
create function public.player_identity_canonical(p_id uuid) returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare cur uuid:=p_id;nxt uuid;seen uuid[]:='{}';
begin
 loop
  if cur=any(seen) or cardinality(seen)>32 then raise exception 'PLAYER_CYCLE';end if;
  seen:=array_append(seen,cur);
  select merged_into_player_id into nxt from player_identities where id=cur;
  if not found then return null;end if;
  if nxt is null then return cur;end if;cur:=nxt;
 end loop;
end $$;
create function public.player_identity_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform player_identity_lock();
 if tg_op='DELETE' then raise exception 'PLAYER_DELETE_FORBIDDEN';end if;
 if tg_op='UPDATE' and old.status='merged' and new is distinct from old then raise exception 'MERGED_PLAYER_IMMUTABLE';end if;
 if new.merged_into_player_id is not null and (player_identity_canonical(new.merged_into_player_id)=new.id or not exists(select 1 from player_identities where id=new.merged_into_player_id and status='active')) then raise exception 'PLAYER_CANONICAL_INVALID';end if;
 if new.account_user_id is not null and not exists(select 1 from users where id=new.account_user_id and identity_status='active') then raise exception 'ACTIVE_ACCOUNT_REQUIRED';end if;
 return new;
end $$;
create trigger player_identity_guard before insert or update or delete on public.player_identities for each row execute function public.player_identity_guard();
create trigger player_identity_events_immutable before update or delete on public.player_identity_events for each row execute function public.prevent_user_merge_journal_mutation();

create function public.player_identity_case(p_type text,p_kind text,p_ref text,p_evidence jsonb,p_players uuid[] default '{}',p_accounts uuid[] default '{}') returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare cid uuid; key text:=p_type||':'||p_kind||':'||p_ref;
begin
 perform player_identity_lock();
 insert into player_identity_cases(dedupe_key,case_type,source_kind,source_ref,evidence,player_ids,account_ids)
 values(key,p_type,p_kind,p_ref,p_evidence,p_players,p_accounts)
 on conflict(dedupe_key) do update set evidence=excluded.evidence,player_ids=excluded.player_ids,account_ids=excluded.account_ids,
 version=player_identity_cases.version+1,updated_at=now(),status='open',decision=null,resolved_at=null,resolved_by_admin_id=null
 where (player_identity_cases.evidence,player_identity_cases.player_ids,player_identity_cases.account_ids) is distinct from (excluded.evidence,excluded.player_ids,excluded.account_ids)
 returning id into cid;
 if cid is null then select id into cid from player_identity_cases where dedupe_key=key;end if;
 return cid;
end $$;

-- Only certified email evidence predating the proposed account association is consulted.
create function public.player_identity_link_account(p_player uuid,p_user uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p player_identities%rowtype;u users%rowtype;conflict text;cid uuid;v_phone text; candidates integer;
begin
 perform player_identity_lock();
 select * into p from player_identities where id=p_player for update;
 select * into u from users where id=p_user for update;
 v_phone:=normalize_user_mobile_e164(u.phone);
 if p.id is null or u.id is null then raise exception 'IDENTITY_NOT_FOUND';end if;
 if p.account_user_id=u.id then return jsonb_build_object('state','linked','player_id',p.id);end if;
 if p.status<>'active' or u.identity_status<>'active' then conflict:='inactive';
 elsif p.account_user_id is not null or exists(select 1 from player_identities where account_user_id=u.id) then conflict:='occupied';
 elsif v_phone is distinct from p.normalized_phone then conflict:='phone_mismatch';
 elsif exists(select 1 from player_identity_email_evidence where player_identity_canonical(player_identity_id)=p.id) then
  if exists(select 1 from player_identity_email_evidence where player_identity_canonical(player_identity_id)=p.id and source_auth_user_id=u.auth_user_id) then conflict:='non_independent_email_evidence';
  elsif normalize_user_email(u.email) is null or exists(select 1 from player_identity_email_evidence where player_identity_canonical(player_identity_id)=p.id and normalized_email is distinct from normalize_user_email(u.email)) then conflict:='email_mismatch';end if;
 elsif player_identity_name(p.full_name)<>player_identity_name(u.full_name) then conflict:='name_mismatch';end if;
 select count(*) into candidates from users where identity_status='active' and normalize_user_mobile_e164(users.phone)=v_phone;
 if candidates<>1 then conflict:='ambiguous_accounts';end if;
 if exists(select 1 from player_identities where id<>p.id and status<>'merged' and normalized_phone=p.normalized_phone) then conflict:='ambiguous_players';end if;
 if conflict is not null then
  cid:=player_identity_case('ambiguous_account_link','account',p.id||':'||u.id,jsonb_build_object('reason',conflict,'full_name',p.full_name,'phone',p.normalized_phone),array[p.id],array[u.id]);
  return jsonb_build_object('state','review','case_id',cid);
 end if;
 update player_identities set account_user_id=u.id,updated_at=now() where id=p.id;
 insert into player_identity_events(player_identity_id,action,details) values(p.id,'account_linked',jsonb_build_object('account_user_id',u.id));
 return jsonb_build_object('state','linked','player_id',p.id);
end $$;

-- This resolver is called only by circuit materialization or explicit Admin correction.
create function public.player_identity_resolve_circuit(p_ref text,p_key text,p_name text,p_phone text,p_gender text,p_account uuid default null) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare phone text:=normalize_user_mobile_e164(p_phone); pid uuid;found_ids uuid[]; ident player_identity_identifiers%rowtype; u users%rowtype;cid uuid;
begin
 perform player_identity_lock();
 select * into ident from player_identity_identifiers where source_kind='circuit' and source_ref=p_ref;
 if found then
  pid:=player_identity_canonical(ident.player_identity_id);
  -- An explicit correction survives a re-close of the unchanged source, not arbitrary source edits.
  if ident.source_name=player_identity_name(p_name) and ident.normalized_phone is not distinct from phone then return pid;end if;
  perform player_identity_case('circuit_identity_ambiguity','circuit',p_ref,jsonb_build_object('reason','source_changed','full_name',p_name,'phone',p_phone,'player_key',p_key),array[pid]);return null;
 end if;
 if phone is null or player_identity_name(p_name)='' then
  perform player_identity_case('circuit_identity_ambiguity','circuit',p_ref,jsonb_build_object('reason','insufficient_identity','full_name',p_name,'phone',p_phone,'player_key',p_key));return null;
 end if;
 select array_agg(id order by id) into found_ids from player_identities where normalized_phone=phone and status<>'merged';
 if cardinality(found_ids)>1 or (cardinality(found_ids)=1 and not exists(select 1 from player_identities where id=found_ids[1] and status='active' and player_identity_name(full_name)=player_identity_name(p_name) and (gender is null or p_gender is null or gender=p_gender))) then
  perform player_identity_case('circuit_identity_ambiguity','circuit',p_ref,jsonb_build_object('reason','conflicting_players','full_name',p_name,'phone',p_phone,'player_key',p_key),coalesce(found_ids,'{}'));return null;
 end if;
 if cardinality(found_ids)=1 then pid:=found_ids[1];
 else
  insert into player_identities(full_name,normalized_phone,gender) values(btrim(p_name),phone,case when p_gender in ('M','F') then p_gender end) returning id into pid;
  insert into player_identity_events(player_identity_id,action,details) values(pid,'created_from_circuit',jsonb_build_object('source_ref',p_ref));
 end if;
 if p_account is not null then
  select * into u from users where id=p_account;
  if u.identity_status='merged' then select * into u from users where id=resolve_canonical_user_id(p_account);end if;
  if u.id is not null and player_identity_name(u.full_name)=player_identity_name(p_name) and normalize_user_mobile_e164(u.phone)=phone then
   perform player_identity_link_account(pid,u.id);
  else perform player_identity_case('identity_data_conflict','circuit_account',p_ref,jsonb_build_object('reason','p1_snapshot_mismatch','full_name',p_name,'phone',p_phone),array[pid],array[p_account]);end if;
 end if;
 insert into player_identity_identifiers(player_identity_id,source_kind,source_ref,legacy_key,source_name,normalized_phone)
 values(pid,'circuit',p_ref,p_key,player_identity_name(p_name),phone);
 return pid;
end $$;

-- Atomic replacement of result rows and their identity links. Sporting values are supplied unchanged by the existing calculator.
create function public.player_identity_materialize_circuit(p_tournament uuid,p_run uuid,p_rows jsonb) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t tournaments%rowtype;r jsonb;pid uuid;n integer:=0;src jsonb;srcs jsonb;ref text;runmode text;
begin
 perform player_identity_lock();
 select * into t from tournaments where id=p_tournament for update;
 select mode into runmode from tournament_runs where id=p_run and tournament_id=p_tournament for update;
 if t.circuit_id is null or runmode is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'CIRCUIT_SOURCE_INVALID';end if;
 delete from circuit_results where source_tournament_id=p_tournament;
 for r in select value from jsonb_array_elements(p_rows) loop
  if (r->>'circuit_id')::uuid<>t.circuit_id or (r->>'source_tournament_id')::uuid<>t.id or not exists(select 1 from circuit_ranking_groups where id=(r->>'ranking_group_id')::uuid and circuit_id=t.circuit_id and category=t.category and level=lower(t.level)) then raise exception 'CIRCUIT_GROUP_INVALID';end if;
  if runmode='fixed_pairs' then
   select jsonb_agg(x.obj) into srcs from (
    select jsonb_build_object('ref',t.id||':registration:'||reg.id||':p1','name',reg.p1_name,'phone',reg.p1_phone,'gender',reg.p1_gender,'account',reg.user_id) obj
    from tournament_run_pairs pair join tournament_registrations reg on reg.id=pair.registration_id where pair.run_id=p_run and reg.tournament_id=t.id and movi_activity_phone_key(reg.p1_phone)=r->>'player_key'
    union all
    select jsonb_build_object('ref',t.id||':registration:'||reg.id||':p2','name',reg.p2_name,'phone',reg.p2_phone,'gender',reg.p2_gender,'account',null)
    from tournament_run_pairs pair join tournament_registrations reg on reg.id=pair.registration_id where pair.run_id=p_run and reg.tournament_id=t.id and movi_activity_phone_key(reg.p2_phone)=r->>'player_key'
   ) x;
  else
   select jsonb_agg(jsonb_build_object('ref',t.id||':participant:'||p.id,'name',p.name,'phone',p.phone,'gender',upper(p.sex),'account',p.user_id)) into srcs
   from tournament_run_participants p where p.run_id=p_run and movi_activity_phone_key(p.phone)=r->>'player_key';
  end if;
  pid:=null;
  if jsonb_array_length(srcs)=1 and player_identity_name(srcs->0->>'name')=player_identity_name(r->>'player_name') then
   src:=srcs->0;ref:=src->>'ref';
   pid:=player_identity_resolve_circuit(ref,r->>'player_key',src->>'name',src->>'phone',src->>'gender',(src->>'account')::uuid);
  else
   select player_identity_canonical(player_identity_id) into pid from player_identity_identifiers where source_kind='circuit' and source_ref=t.id||':key:'||(r->>'player_key') and source_name=player_identity_name(r->>'player_name') and normalized_phone is not distinct from normalize_user_mobile_e164(r->>'player_phone');
   if pid is null then perform player_identity_case('circuit_identity_ambiguity','circuit',t.id||':key:'||(r->>'player_key'),jsonb_build_object('reason','source_not_unique','full_name',r->>'player_name','phone',r->>'player_phone','player_key',r->>'player_key'));end if;
  end if;
  insert into circuit_results(circuit_id,ranking_group_id,source_tournament_id,tournament_name,tournament_type,tournament_date,player_key,player_name,player_phone,placement,points,player_identity_id)
  values(t.circuit_id,(r->>'ranking_group_id')::uuid,t.id,r->>'tournament_name',r->>'tournament_type',(r->>'tournament_date')::date,r->>'player_key',r->>'player_name',r->>'player_phone',(r->>'placement')::integer,(r->>'points')::integer,pid);
  n:=n+1;
 end loop;
 update tournament_runs set status='completed' where id=p_run;
 update tournaments set registrations_open=false where id=t.id;
 return n;
end $$;

create function public.player_identity_merge_preview(p_source uuid,p_canonical uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s player_identities%rowtype;c player_identities%rowtype;blockers jsonb:='[]';fingerprint text;
begin
 perform player_identity_lock();
 select * into s from player_identities where id=p_source;select * into c from player_identities where id=p_canonical;
 if s.id is null or c.id is null or s.id=c.id then raise exception 'PLAYER_PAIR_INVALID';end if;
 if s.status='merged' or c.status<>'active' then blockers:=blockers||'"inactive_identity"'::jsonb;end if;
 if s.account_user_id is not null and c.account_user_id is not null and s.account_user_id<>c.account_user_id then blockers:=blockers||'"different_accounts"'::jsonb;end if;
 if exists(select 1 from circuit_results a join circuit_results b on a.ranking_group_id=b.ranking_group_id and a.source_tournament_id is not distinct from b.source_tournament_id where a.player_identity_id=s.id and b.player_identity_id=c.id) then blockers:=blockers||'"overlapping_circuit_results"'::jsonb;end if;
 if exists(select 1 from league_player_identity_links a join league_team_players pa on pa.id=a.league_team_player_id join league_player_identity_links b on b.player_identity_id=c.id join league_team_players pb on pb.id=b.league_team_player_id and pb.team_id=pa.team_id where a.player_identity_id=s.id) then blockers:=blockers||'"overlapping_roster"'::jsonb;end if;
 select md5(jsonb_build_object('source',to_jsonb(s),'canonical',to_jsonb(c),'results',(select jsonb_agg(to_jsonb(r) order by r.id) from circuit_results r where player_identity_id in(s.id,c.id)),'links',(select jsonb_agg(to_jsonb(l) order by l.id) from league_player_identity_links l where player_identity_id in(s.id,c.id)),'identifiers',(select jsonb_agg(to_jsonb(i) order by i.id) from player_identity_identifiers i where player_identity_id in(s.id,c.id)))::text) into fingerprint;
 return jsonb_build_object('source',to_jsonb(s),'canonical',to_jsonb(c),'blockers',blockers,'fingerprint',fingerprint);
end $$;

create function public.player_identity_merge(p_source uuid,p_canonical uuid,p_fingerprint text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare preview jsonb;account uuid;cid uuid;
begin
 perform player_identity_admin(p_actor);perform player_identity_lock();
 preview:=player_identity_merge_preview(p_source,p_canonical);
 if preview->>'fingerprint' is distinct from p_fingerprint then raise exception 'STALE_PREVIEW';end if;
 if jsonb_array_length(preview->'blockers')>0 then
  cid:=player_identity_case('sporting_merge_conflict','merge',p_source||':'||p_canonical,preview,array[p_source,p_canonical]);
  return jsonb_build_object('state','review','case_id',cid,'blockers',preview->'blockers');
 end if;
 select account_user_id into account from player_identities where id=p_source;
 update player_identities set account_user_id=null where id=p_source;
 update player_identities set account_user_id=coalesce(account_user_id,account),updated_at=now() where id=p_canonical;
 update circuit_results set player_identity_id=p_canonical where player_identity_id=p_source;
 update league_player_identity_links set player_identity_id=p_canonical,updated_at=now() where player_identity_id=p_source;
 -- Identifiers retain their original identity as alias/history and resolve through the canonical chain.
 update player_identities set status='merged',merged_into_player_id=p_canonical,merged_at=now(),updated_at=now() where id=p_source;
 insert into player_identity_events(player_identity_id,actor_admin_id,action,details) values(p_canonical,p_actor,'sporting_merge',preview);
 return jsonb_build_object('state','merged','player_id',p_canonical);
end $$;

-- Lock account merges before their original locks; retain all Auth2 checks.
alter function public.preview_user_merge(uuid,uuid) rename to preview_user_merge_pre_player_identity;
create function public.preview_user_merge(p_source_user_id uuid,p_canonical_user_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;s uuid;c uuid;
begin
 perform player_identity_lock();
 result:=preview_user_merge_pre_player_identity(p_source_user_id,p_canonical_user_id);
 select id into s from player_identities where account_user_id=p_source_user_id;
 select id into c from player_identities where account_user_id=p_canonical_user_id;
 if s is not null and c is not null and s<>c then
  result:=jsonb_set(result,'{conflicts}',(result->'conflicts')||'"different_player_identities"'::jsonb);
  perform player_identity_case('sporting_merge_conflict','account_merge',p_source_user_id||':'||p_canonical_user_id,jsonb_build_object('reason','different_player_identities'),array[s,c],array[p_source_user_id,p_canonical_user_id]);
 end if;
 return result||jsonb_build_object('fingerprint',md5((result->>'fingerprint')||coalesce(s::text,'')||coalesce(c::text,'')),'player_links',jsonb_build_object('source',s,'canonical',c));
end $$;
alter function public.execute_user_merge(uuid,text,uuid) rename to execute_user_merge_pre_player_identity;
create function public.execute_user_merge(p_operation_id uuid,p_expected_fingerprint text,p_actor_staff_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform player_identity_lock();
 return execute_user_merge_pre_player_identity(p_operation_id,p_expected_fingerprint,p_actor_staff_id);
end $$;
alter function public.execute_reviewed_user_merge(uuid,text,uuid) rename to execute_reviewed_user_merge_pre_player_identity;
create function public.execute_reviewed_user_merge(p_operation_id uuid,p_expected_fingerprint text,p_actor_staff_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform player_identity_lock();
 return execute_reviewed_user_merge_pre_player_identity(p_operation_id,p_expected_fingerprint,p_actor_staff_id);
end $$;
create function public.player_identity_account_merge_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare s uuid;c uuid;
begin
 if new.identity_status='merged' and old.identity_status<>'merged' then
  perform player_identity_lock();
  select id into s from player_identities where account_user_id=old.id;
  select id into c from player_identities where account_user_id=new.merged_into_user_id;
  if s is not null and c is not null and s<>c then raise exception 'DIFFERENT_PLAYER_IDENTITIES';end if;
  if s is not null then
   update player_identities set account_user_id=new.merged_into_user_id,updated_at=now() where id=s;
   insert into player_identity_events(player_identity_id,action,details) values(s,'account_merge_transfer',jsonb_build_object('source_user_id',old.id,'canonical_user_id',new.merged_into_user_id));
  end if;
 end if;
 return new;
end $$;
create trigger player_identity_account_merge_guard before update of identity_status on public.users for each row execute function public.player_identity_account_merge_guard();

-- Every table is private. All sensitive entrypoints remain service-only.
do $$ declare tab text;fn record;begin
 foreach tab in array array['player_identities','player_identity_cases','player_identity_identifiers','player_identity_email_evidence','player_identity_events','league_player_identity_links'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant select,insert,update on public.%I to service_role',tab);
 end loop;
 for fn in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and (proname like 'player_identity_%' or proname like '%_pre_player_identity' or proname in('preview_user_merge','execute_user_merge','execute_reviewed_user_merge')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
  if fn.signature::text not like '%_pre_player_identity(%' then execute format('grant execute on function %s to service_role',fn.signature);end if;
 end loop;
end $$;
revoke all on sequence public.player_identity_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.player_identity_events_id_seq to service_role;
commit;
