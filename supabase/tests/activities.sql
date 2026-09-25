begin;
-- Phone normalization must match the existing circuit key builder, including punctuation.

create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
select pg_temp.assert_true(public.movi_activity_phone_key('(+39) 347-123.4567')='3471234567','existing circuit phone key');
insert into public.users(id,full_name,phone,gender) values
('edee9900-0000-4000-8000-000000000001','Canonical Demo','+390000009911','M'),
('edee9900-0000-4000-8000-000000000002','Source Demo','00390000009922','M'),
('edee9900-0000-4000-8000-000000000003','Other Demo','+390000009933','M');
insert into public.user_identity_aliases(source_user_id,canonical_user_id,status,reason,merged_at) values('edee9900-0000-4000-8000-000000000002','edee9900-0000-4000-8000-000000000001','active','SQL local scope test',now());
select pg_temp.assert_true((public.movi_activity_identity_scope('edee9900-0000-4000-8000-000000000001')->'user_ids') @> '["edee9900-0000-4000-8000-000000000002"]','certified alias included');
select pg_temp.assert_true(jsonb_array_length(public.movi_activity_identity_scope('edee9900-0000-4000-8000-000000000001')->'player_keys')=2,'phone keys included');
update public.users set phone='+39 0000009922' where id='edee9900-0000-4000-8000-000000000003';
select pg_temp.assert_true(jsonb_array_length(public.movi_activity_identity_scope('edee9900-0000-4000-8000-000000000001')->'player_keys')=1,'shared phone excluded');
update public.user_identity_aliases set status='revoked' where source_user_id='edee9900-0000-4000-8000-000000000002';
select pg_temp.assert_true(jsonb_array_length(public.movi_activity_identity_scope('edee9900-0000-4000-8000-000000000001')->'user_ids')=1,'revoked alias excluded');
set local role anon;
do $$begin begin perform public.movi_activity_identity_scope('edee9900-0000-4000-8000-000000000001');raise exception 'anon access';exception when insufficient_privilege then null;end;end$$;
reset role;
set local role authenticated;
do $$begin begin perform public.movi_activity_registrations('edee9900-0000-4000-8000-000000000001');raise exception 'direct user scope';exception when insufficient_privilege then null;end;end$$;
reset role;
rollback;
