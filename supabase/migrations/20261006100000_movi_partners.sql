begin;
create table public.movi_partners (
 id uuid primary key default gen_random_uuid(),
 status text not null default 'draft' check(status in ('draft','active','inactive')),
 name text not null check(length(btrim(name)) between 1 and 180),
 slug text not null unique check(length(slug)<=120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 category text not null check(category in ('Ristorazione','Sport','Benessere','Abbigliamento','Servizi','Altro')),
 short_description text not null default '' check(length(short_description)<=500),
 full_description text not null default '' check(length(full_description)<=15000),
 benefit_title text not null check(length(btrim(benefit_title)) between 1 and 180),
 benefit_description text not null default '' check(length(benefit_description)<=5000),
 conditions text not null default '' check(length(conditions)<=5000),
 logo_path text, cover_path text,
 website_url text check(website_url is null or (length(website_url)<=2000 and website_url ~ '^https://[^[:space:]\\]+$')),
 contact_url text check(contact_url is null or (length(contact_url)<=2000 and contact_url ~ '^https://[^[:space:]\\]+$')),
 phone text not null default '' check(length(phone)<=50),
 address text not null default '' check(length(address)<=300),
 locality text not null default '' check(length(locality)<=120),
 valid_from timestamptz, valid_until timestamptz,
 sort_order integer not null default 0 check(sort_order between -100000 and 100000),
 featured boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 check(valid_from is null or valid_until is null or valid_from<=valid_until),
 check(logo_path is null or logo_path ~ ('^'||id::text||'/[0-9a-f-]{36}\.(png|jpg|webp)$')),
 check(cover_path is null or cover_path ~ ('^'||id::text||'/[0-9a-f-]{36}\.(png|jpg|webp)$'))
);
create index movi_partners_list on public.movi_partners(status,featured desc,sort_order,name,id) where deleted_at is null;
create index movi_partners_validity on public.movi_partners(valid_from,valid_until) where status='active' and deleted_at is null;
create index movi_partners_deleted on public.movi_partners(deleted_at);
create function public.movi_partner_touch() returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
create trigger movi_partner_touch before update on public.movi_partners for each row execute function public.movi_partner_touch();
create function public.movi_partner_visible(p public.movi_partners) returns boolean language sql stable set search_path=public as $$
 select p.status='active' and p.deleted_at is null and (p.valid_from is null or statement_timestamp()>=p.valid_from) and (p.valid_until is null or statement_timestamp()<=p.valid_until)
$$;
alter table public.movi_partners enable row level security;
revoke all on public.movi_partners from anon,authenticated;
grant select on public.movi_partners to anon,authenticated;
grant all on public.movi_partners to service_role;
create policy movi_partners_public_read on public.movi_partners for select to anon,authenticated using(public.movi_partner_visible(movi_partners));
create function public.movi_partners_public_list(p_limit integer default 12,p_offset integer default 0,p_slug text default null)
returns setof public.movi_partners language sql stable security invoker set search_path=public as $$
 select p.* from public.movi_partners p where public.movi_partner_visible(p) and (p_slug is null or p.slug=p_slug)
 order by p.featured desc,p.sort_order,p.name,p.id limit greatest(1,least(coalesce(p_limit,12),50)) offset greatest(0,least(coalesce(p_offset,0),10000))
$$;
revoke all on function public.movi_partners_public_list(integer,integer,text) from public,anon,authenticated;
grant execute on function public.movi_partners_public_list(integer,integer,text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('movi-partners-media','movi-partners-media',false,5242880,array['image/jpeg','image/png','image/webp']);
commit;
