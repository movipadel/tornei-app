-- Read-only production precheck; run manually before a future release.
begin;
set transaction read only;
show transaction_read_only;
select count(*) as partner_count,
       count(*) filter (where status = 'active' and deleted_at is null) as active_partners,
       count(*) filter (where btrim(address) <> '' or btrim(locality) <> '') as with_legacy_location,
       count(*) filter (where btrim(phone) <> '') as with_legacy_phone,
       count(*) filter (where logo_path is not null) as with_logo,
       count(*) filter (where cover_path is not null) as with_cover
from public.movi_partners;

select category,count(*) as partner_count
from public.movi_partners group by category order by category;

-- Aggregate only; inspect the raw values separately in a controlled review if needed.
select count(*) as legacy_phone_multiple_apparent_numbers
from public.movi_partners
where btrim(phone) <> '' and length(regexp_replace(phone,'[^0-9]','','g')) > 13;

rollback;
