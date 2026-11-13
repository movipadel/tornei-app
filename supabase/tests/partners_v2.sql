begin;
create function pg_temp.assert_true(v boolean, label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label; end if; end$$;
do $$declare v text; n int:=0;begin
 foreach v in array array['Ristorazione','Sport','Benessere','Abbigliamento','Gioielleria','Tecnologia e Telefonia','Casa e Design','Salute','Automotive','Turismo','Servizi','Professionisti','Altro'] loop
  n:=n+1;
  insert into public.movi_partners(name,slug,category,benefit_title)
  values('Synthetic category',format('synthetic-partner-v2-category-%s',n),v,'Synthetic benefit');
 end loop;
end$$;
select pg_temp.assert_true((select count(*)=13 from public.movi_partners where slug like 'synthetic-partner-v2-category-%'),'all categories accepted');

insert into public.movi_partners(id,name,slug,category,benefit_title,status,address,locality,phone)
values ('eded4000-0000-4000-8000-0000000000a1','Synthetic Partner A','synthetic-partner-v2-a','Gioielleria','Synthetic benefit','active','Via Demo 1','Torino','+39 011 0000000');
select pg_temp.assert_true((select count(*)=0 from public.partner_locations where partner_id='eded4000-0000-4000-8000-0000000000a1'),'new synthetic row starts without backfill');

select public.movi_partner_save(p.id,p.updated_at,to_jsonb(p),
 '[{"slot":1,"label":"Torino","address":"Via Demo 1","locality":"Torino","landline_phone":"011 0000000","mobile_phone":"333 1234567","mobile_action":"whatsapp"},{"slot":2,"label":"Saluzzo","address":"Via Demo 2","locality":"Saluzzo","landline_phone":"0175 123456","mobile_phone":"","mobile_action":"call"}]'::jsonb)
from public.movi_partners p where p.slug='synthetic-partner-v2-a';
select pg_temp.assert_true((select count(*)=2 from public.partner_locations where partner_id='eded4000-0000-4000-8000-0000000000a1'),'two locations');

do $$begin
 begin
  insert into public.partner_locations(partner_id,slot,address) values('eded4000-0000-4000-8000-0000000000a1',3,'Third');
  raise exception 'slot 3 accepted';
 exception when check_violation then null; end;
 begin
  insert into public.partner_locations(partner_id,slot,address) values('eded4000-0000-4000-8000-0000000000a1',2,'Duplicate');
  raise exception 'duplicate slot accepted';
 exception when unique_violation then null; end;
 begin
  insert into public.partner_locations(partner_id,slot,mobile_phone) values('eded4000-0000-4000-8000-0000000000a1',2,'3331234567 / 3341234567');
  raise exception 'multiple mobile numbers accepted';
 exception when check_violation then null; end;
end$$;

do $$declare p public.movi_partners;begin
 select * into p from public.movi_partners where slug='synthetic-partner-v2-a';
 begin
  perform public.movi_partner_save(p.id,p.updated_at,to_jsonb(p)||'{"name":"Must Roll Back"}'::jsonb,
   '[{"slot":1,"label":"Bad","address":"Via Demo","locality":"Torino","landline_phone":"","mobile_phone":"bad","mobile_action":"call"}]'::jsonb);
  raise exception 'bad location accepted';
 exception when check_violation then null; end;
end$$;
select pg_temp.assert_true((select name='Synthetic Partner A' from public.movi_partners where slug='synthetic-partner-v2-a'),'partner rollback on location error');
select pg_temp.assert_true((select count(*)=2 from public.partner_locations where partner_id='eded4000-0000-4000-8000-0000000000a1'),'location rollback on error');

set local role anon;
do $$begin
 begin perform 1 from public.partner_locations limit 1; raise exception 'anon location read accepted';
 exception when insufficient_privilege then null; end;
 begin perform public.movi_partner_save(null,null,'{}'::jsonb,'[]'::jsonb); raise exception 'anon write accepted';
 exception when insufficient_privilege then null; end;
end$$;
reset role;
rollback;
