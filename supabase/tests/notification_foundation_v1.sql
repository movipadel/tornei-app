\set ON_ERROR_STOP on
begin;
-- Synthetic transaction only; no transport calls. Runner pins 127.0.0.1:55422.
update public.notification_deliveries set status='skipped',delivered_at=null;
do $$
declare u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
 e uuid; d uuid; a uuid; b uuid; t record; op jsonb; result jsonb;
begin
 insert into public.users(id,full_name,phone,email,gender) values(u,'Push Fixture A','391234567801','push-a@example.invalid','M'),(v,'Push Fixture B','391234567802','push-b@example.invalid','F');
 insert into public.staff_users(id,full_name,email,role) values(s,'Push Staff','push-staff@example.invalid','staff');
 if (select transactional_push_enabled from public.user_notification_preferences where user_id=u) then raise exception 'PUSH_DEFAULT_ON'; end if;
 update public.user_notification_preferences set transactional_push_enabled=true where user_id=u;
 perform public.manage_push_subscription('subscribe','https://fcm.googleapis.com/test/a',u,null,repeat('a',87),repeat('b',22));
 perform public.manage_push_subscription('subscribe','https://fcm.googleapis.com/test/b',u,null,repeat('a',87),repeat('b',22));
 if public.manage_push_subscription('subscribe','https://fcm.googleapis.com/test/a',v,null,repeat('a',87),repeat('b',22))->>'state'<>'ownership_conflict' then raise exception 'HIJACK'; end if;
 if public.manage_push_subscription('subscribe','https://fcm.googleapis.com/test/a',null,s,repeat('a',87),repeat('b',22))->>'state'<>'ownership_conflict' then raise exception 'STAFF_HIJACK'; end if;
 begin
 insert into public.push_subscriptions(endpoint,p256dh,auth,public_user_id,staff_user_id) values('https://fcm.googleapis.com/test/both',repeat('a',87),repeat('b',22),u,s);
 raise exception 'OWNER_CHECK_MISSING'; exception when check_violation then null; end;
 select id into a from public.push_subscriptions where endpoint='https://fcm.googleapis.com/test/a';
 select id into b from public.push_subscriptions where endpoint='https://fcm.googleapis.com/test/b';
 e:=public.enqueue_user_notification('foundation_test','requests',u,'push-test:'||u);
 if e is distinct from public.enqueue_user_notification('foundation_test','requests',u,'push-test:'||u) then raise exception 'EVENT_REPLAY'; end if;
 if public.enqueue_push_delivery(e) is not null then raise exception 'IMPLICIT_PUSH'; end if;
 d:=public.enqueue_push_delivery(e,true);
 if d is distinct from public.enqueue_push_delivery(e,true) then raise exception 'DELIVERY_REPLAY'; end if;
 if exists(select 1 from public.claim_notification_deliveries('email-test',100) c join public.notification_deliveries nd on nd.id=c.delivery_id where nd.channel<>'email') then raise exception 'EMAIL_CLAIM_LEAK'; end if;
 if exists(select 1 from public.claim_push_deliveries('push-test',100) where channel<>'push') then raise exception 'PUSH_CLAIM_LEAK'; end if;
 if (select count(*) from public.claim_push_targets(d,'push-test'))<>2 then raise exception 'MULTIDEVICE_MISSING'; end if;
 if (select count(*) from public.claim_push_targets(d,'push-test'))<>0 then raise exception 'TARGET_RECLAIM'; end if;
 for t in select * from public.push_delivery_targets where delivery_id=d loop
 perform public.finish_push_target(t.id,'push-test',case when t.subscription_id=a then 'accepted' else 'retry' end,'test'); end loop;
 if public.finish_push_delivery(d,'push-test')<>'retry' then raise exception 'AGGREGATE_RETRY'; end if;
 update public.push_delivery_targets set next_attempt_at=now()-interval '1 second' where delivery_id=d and status='retry';
 update public.notification_deliveries set next_attempt_at=now()-interval '1 second' where id=d;
 perform public.claim_push_deliveries('push-retry',100);
 if (select count(*) from public.claim_push_targets(d,'push-retry'))<>1 then raise exception 'ACCEPTED_RESENT'; end if;
 select * into t from public.push_delivery_targets where delivery_id=d and status='processing';
 perform public.finish_push_target(t.id,'push-retry','failed','endpoint_410',true);
 if (select is_active from public.push_subscriptions where id=b) then raise exception 'STALE_NOT_REVOKED'; end if;
 if public.finish_push_delivery(d,'push-retry')<>'failed' then raise exception 'AGGREGATE_FAILED'; end if;
 if public.push_subscription_eligible(b,e) then raise exception 'REVOKED_ELIGIBLE'; end if;
 perform public.manage_push_subscription('subscribe','https://fcm.googleapis.com/test/staff',null,s,repeat('a',87),repeat('b',22));
 insert into public.notification_events(event_type,domain,recipient_staff_user_id,idempotency_key,payload) values('requests.gioca.received','requests',s,'staff-test:'||s,'{"responsibility_key":"requests_gioca"}') returning id into e;
 select id into a from public.push_subscriptions where staff_user_id=s;
 if public.push_subscription_eligible(a,e) then raise exception 'NO_RESPONSIBILITY'; end if;
 insert into public.staff_notification_responsibilities(staff_user_id,event_key) values(s,'requests.gioca.received');
 insert into public.staff_permissions(staff_user_id,permission_key) values(s,'requests.manage');
 if not public.push_subscription_eligible(a,e) then raise exception 'STAFF_ELIGIBLE_MISSING'; end if;
 update public.staff_users set is_active=false where id=s;
 if public.push_subscription_eligible(a,e) then raise exception 'DISABLED_STAFF'; end if;
 -- Canonical merge entry point, not an isolated helper invocation.
 perform public.manage_push_subscription('subscribe','https://fcm.googleapis.com/test/canonical',v,null,repeat('a',87),repeat('b',22));
 update public.user_notification_preferences set transactional_push_enabled=true where user_id=v;
 e:=public.enqueue_user_notification('foundation_single','requests',v,'push-single:'||v);
 d:=public.enqueue_push_delivery(e,true);
 perform public.claim_push_deliveries('single',100);
 if (select count(*) from public.claim_push_targets(d,'single'))<>1 then raise exception 'SINGLE_DEVICE'; end if;
 select * into t from public.push_delivery_targets where delivery_id=d;
 perform public.finish_push_target(t.id,'single','failed','endpoint_404',true);
 if public.finish_push_delivery(d,'single')<>'failed' or (select is_active from public.push_subscriptions where id=t.subscription_id) then raise exception 'STALE_404'; end if;
 op:=public.create_user_merge_operation(u,v,null,'push foundation synthetic merge',null);
 result:=public.execute_user_merge((op->>'operation_id')::uuid,op->'preview'->>'fingerprint',null);
 if result->>'state'<>'completed' then raise exception 'MERGE_FAILED: %',result; end if;
 if exists(select 1 from public.push_subscriptions where public_user_id=u) then raise exception 'MERGE_OWNER'; end if;
 if (select count(*) from public.push_subscriptions where public_user_id=v)<>3 then raise exception 'MERGE_LOSS'; end if;
 if (select is_active from public.push_subscriptions where id=b) then raise exception 'MERGE_REVIVED'; end if;
 begin
 insert into public.push_subscriptions(endpoint,p256dh,auth,public_user_id) values('https://fcm.googleapis.com/test/a',repeat('a',87),repeat('b',22),v);
 raise exception 'ENDPOINT_UNIQUENESS_MISSING'; exception when unique_violation then null; end;
 if has_table_privilege('anon','public.push_subscriptions','SELECT') or has_table_privilege('authenticated','public.push_delivery_targets','INSERT') or has_function_privilege('anon','public.manage_push_subscription(text,text,uuid,uuid,text,text,text)','EXECUTE') then raise exception 'ACL_EXPOSED'; end if;
 raise notice 'PASS ownership, channel isolation, replay, per-device retries, stale cleanup, staff eligibility, canonical merge, ACL';
end $$;
rollback;
