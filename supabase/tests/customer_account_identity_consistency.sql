-- Canonical phone matching is read-only and uses the existing Auth identity helper.
begin;
set transaction read only;
show transaction_read_only;
do $$
begin
  if public.normalize_user_mobile_e164('3471112233') <> '+393471112233'
     or public.normalize_user_mobile_e164('00393471112233') <> '+393471112233'
     or public.normalize_user_mobile_e164('39 347 1112233') is not null
     or public.normalize_user_mobile_e164('40') is not null then
    raise exception 'Canonical Italian phone equivalence failed';
  end if;
end $$;
rollback;
