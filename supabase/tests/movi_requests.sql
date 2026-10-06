begin;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
insert into public.users(id,full_name,phone,gender) values('eded8000-0000-4000-8000-000000000001','SQL synthetic user','+390000008001','M');
insert into public.movi_requests(id,user_id,client_request_id,request_type,date_mode,time_window,level,match_type,group_size,required_player_side) values('eded8000-0000-4000-8000-000000000002','eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'gioca','flexible','any','unknown',array['male','mixed'],1,null);
insert into public.movi_requests(user_id,client_request_id,request_type,date_mode,time_window,level,match_type,group_size,required_player_side) values
 ('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'gioca','flexible','any','unknown',array['male'],2,null),
 ('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'gioca','flexible','any','unknown',array['male'],3,'right'),
 ('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'gioca','flexible','any','unknown',array['male'],3,'left'),
 ('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'gioca','flexible','any','unknown',array['male'],3,'any');
insert into public.movi_requests(user_id,client_request_id,request_type,date_mode,time_window,level,training_type,training_goal) values('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'allenati','flexible','morning','principiante',array['individual','group'],array['learn','technique','other']);
do $$begin
 begin insert into public.movi_requests(user_id,client_request_id,request_type,date_mode,time_window,level,match_type,group_size) values('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'gioca','flexible','any','unknown',array['any','mixed'],1);raise exception 'any combination accepted';exception when check_violation then null;end;
 begin insert into public.movi_requests(user_id,client_request_id,request_type,date_mode,time_window,level,match_type,group_size) values('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'gioca','flexible','any','unknown',array['male'],0);raise exception 'group zero accepted';exception when check_violation then null;end;
 begin insert into public.movi_requests(user_id,client_request_id,request_type,date_mode,time_window,level,match_type,group_size,required_player_side) values('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'gioca','flexible','any','unknown',array['male'],1,'right');raise exception 'fourth side for group one accepted';exception when check_violation then null;end;
 begin insert into public.movi_requests(user_id,client_request_id,request_type,date_mode,time_window,level,match_type,group_size) values('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'gioca','flexible','any','unknown',array['male'],3);raise exception 'group three without side accepted';exception when check_violation then null;end;
 begin insert into public.movi_requests(user_id,client_request_id,request_type,date_mode,time_window,level,match_type,group_size,required_player_side) values('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'gioca','flexible','any','unknown',array['male'],3,'center');raise exception 'unknown fourth side accepted';exception when check_violation then null;end;
 begin insert into public.movi_requests(user_id,client_request_id,request_type,date_mode,time_window,level,training_type,training_goal,group_size) values('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'allenati','flexible','any','unknown',array['advice'],array['learn'],1);raise exception 'Allenati group accepted';exception when check_violation then null;end;
 begin insert into public.movi_requests(user_id,client_request_id,request_type,date_mode,time_window,level,training_type,training_goal,required_player_side) values('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'allenati','flexible','any','unknown',array['advice'],array['learn'],'right');raise exception 'Allenati fourth side accepted';exception when check_violation then null;end;
 begin insert into public.movi_requests(user_id,client_request_id,request_type,date_mode,time_window,level,training_type,training_goal) values('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'allenati','flexible','any','unknown',array['advice','group'],array['learn']);raise exception 'advice combination accepted';exception when check_violation then null;end;
 begin insert into public.movi_requests(user_id,client_request_id,request_type,date_mode,time_window,level,training_type,training_goal) values('eded8000-0000-4000-8000-000000000001',gen_random_uuid(),'allenati','flexible','any','unknown',array['group','group'],array['learn']);raise exception 'duplicate accepted';exception when check_violation then null;end;
 begin update public.movi_requests set status='found' where id='eded8000-0000-4000-8000-000000000002';raise exception 'jump accepted';exception when raise_exception then if SQLERRM='jump accepted' then raise;end if;end;
 begin update public.movi_requests set request_type='bad' where id='eded8000-0000-4000-8000-000000000002';raise exception 'type accepted';exception when raise_exception then if SQLERRM='type accepted' then raise;end if;end;
 begin update public.movi_requests set status='bad' where id='eded8000-0000-4000-8000-000000000002';raise exception 'status accepted';exception when raise_exception then if SQLERRM='status accepted' then raise;end if;end;
end$$;
update public.movi_requests set status='searching' where id='eded8000-0000-4000-8000-000000000002';
update public.movi_requests set status='found' where id='eded8000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select found_at is not null and completed_at is null from public.movi_requests where id='eded8000-0000-4000-8000-000000000002'),'found timestamp');
update public.movi_requests set status='cancelled' where id='eded8000-0000-4000-8000-000000000002' and status in ('received','searching');
select pg_temp.assert_true((select status='found' from public.movi_requests where id='eded8000-0000-4000-8000-000000000002'),'user cancel found blocked');
update public.movi_requests set status='completed' where id='eded8000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select completed_at>=found_at from public.movi_requests where id='eded8000-0000-4000-8000-000000000002'),'completion timestamp');
update public.movi_requests set status='cancelled' where user_id='eded8000-0000-4000-8000-000000000001' and status='received';
select pg_temp.assert_true((select count(*)=6 from public.movi_requests where user_id='eded8000-0000-4000-8000-000000000001'),'history retained');
select pg_temp.assert_true((select match_type=array['male','mixed'] from public.movi_requests where id='eded8000-0000-4000-8000-000000000002'),'gioca multi-select retained');
set local role anon;
do $$begin begin perform id from public.movi_requests;raise exception 'anon read allowed';exception when insufficient_privilege then null;end;end$$;
reset role;
set local role authenticated;
do $$begin begin update public.movi_requests set admin_notes='bad';raise exception 'user update allowed';exception when insufficient_privilege then null;end;end$$;
reset role;
rollback;
