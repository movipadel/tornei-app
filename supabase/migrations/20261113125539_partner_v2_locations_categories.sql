begin;

alter table public.movi_partners drop constraint if exists movi_partners_category_check;
alter table public.movi_partners add constraint movi_partners_category_check check (category in (
 'Ristorazione','Sport','Benessere','Abbigliamento','Gioielleria',
 'Tecnologia e Telefonia','Casa e Design','Salute','Automotive','Turismo',
 'Servizi','Professionisti','Altro'
));

create table public.partner_locations (
 id uuid primary key default gen_random_uuid(),
 partner_id uuid not null references public.movi_partners(id) on delete cascade,
 slot smallint not null check (slot in (1,2)),
 label text not null default '' check (length(label) <= 120),
 address text not null default '' check (length(address) <= 300),
 locality text not null default '' check (length(locality) <= 120),
 landline_phone text not null default '' check (length(landline_phone) <= 50),
 mobile_phone text not null default '' check (length(mobile_phone) <= 50),
 mobile_action text not null default 'call' check (mobile_action in ('call','whatsapp')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (partner_id,slot),
 check (length(btrim(address || locality || landline_phone || mobile_phone)) > 0),
 check (landline_phone = '' or (
   landline_phone ~ '^[+0-9(). -]+$' and
   regexp_replace(landline_phone,'[^+0-9]','','g') ~ '^(\+39|0039)?0[0-9]{5,12}$'
 )),
 check (mobile_phone = '' or (
   mobile_phone ~ '^[+0-9(). -]+$' and
   regexp_replace(mobile_phone,'[^+0-9]','','g') ~ '^(\+39|0039)?3[0-9]{9}$'
 ))
);
create index partner_locations_partner_slot on public.partner_locations(partner_id,slot);
alter table public.partner_locations enable row level security;
revoke all on public.partner_locations from public,anon,authenticated;
grant select,insert,update,delete on public.partner_locations to service_role;

-- Preserve the generic legacy phone exactly as recorded. It may contain more than one number.
insert into public.partner_locations(partner_id,slot,address,locality)
select id,1,address,locality from public.movi_partners
where btrim(address) <> '' or btrim(locality) <> '';

create function public.movi_partner_save(
 p_id uuid, p_expected_updated_at timestamptz, p_partner jsonb, p_locations jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
 if jsonb_typeof(p_partner) <> 'object' or jsonb_typeof(p_locations) <> 'array'
    or jsonb_array_length(p_locations) > 2 then
   raise exception 'Invalid partner payload' using errcode = '22023';
 end if;
 if p_id is null then
   insert into public.movi_partners (
     status,name,slug,category,short_description,full_description,benefit_title,
     benefit_description,conditions,website_url,contact_url,instagram_url,
     facebook_url,contact_label,phone,address,locality,valid_from,valid_until,
     sort_order,featured
   ) values (
     p_partner->>'status',p_partner->>'name',p_partner->>'slug',p_partner->>'category',
     p_partner->>'short_description',p_partner->>'full_description',p_partner->>'benefit_title',
     p_partner->>'benefit_description',p_partner->>'conditions',p_partner->>'website_url',
     p_partner->>'contact_url',p_partner->>'instagram_url',p_partner->>'facebook_url',
     p_partner->>'contact_label',p_partner->>'phone',p_partner->>'address',p_partner->>'locality',
     (p_partner->>'valid_from')::timestamptz,(p_partner->>'valid_until')::timestamptz,
     (p_partner->>'sort_order')::integer,(p_partner->>'featured')::boolean
   ) returning id into v_id;
 else
   update public.movi_partners set
     status=p_partner->>'status',name=p_partner->>'name',slug=p_partner->>'slug',
     category=p_partner->>'category',short_description=p_partner->>'short_description',
     full_description=p_partner->>'full_description',benefit_title=p_partner->>'benefit_title',
     benefit_description=p_partner->>'benefit_description',conditions=p_partner->>'conditions',
     website_url=p_partner->>'website_url',contact_url=p_partner->>'contact_url',
     instagram_url=p_partner->>'instagram_url',facebook_url=p_partner->>'facebook_url',
     contact_label=p_partner->>'contact_label',phone=p_partner->>'phone',
     address=p_partner->>'address',locality=p_partner->>'locality',
     valid_from=(p_partner->>'valid_from')::timestamptz,
     valid_until=(p_partner->>'valid_until')::timestamptz,
     sort_order=(p_partner->>'sort_order')::integer,featured=(p_partner->>'featured')::boolean
   where id=p_id and updated_at=p_expected_updated_at and deleted_at is null
   returning id into v_id;
   if v_id is null then
     raise exception 'Partner changed elsewhere' using errcode='40001';
   end if;
 end if;

 delete from public.partner_locations where partner_id=v_id;
 insert into public.partner_locations (
   partner_id,slot,label,address,locality,landline_phone,mobile_phone,mobile_action
 )
 select v_id,x.slot,x.label,x.address,x.locality,x.landline_phone,x.mobile_phone,x.mobile_action
 from jsonb_to_recordset(p_locations) as x(
   slot smallint,label text,address text,locality text,landline_phone text,
   mobile_phone text,mobile_action text
 );
 return v_id;
end $$;
revoke all on function public.movi_partner_save(uuid,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.movi_partner_save(uuid,timestamptz,jsonb,jsonb) to service_role;

commit;
