\set ON_ERROR_STOP on
begin;
update public.notification_deliveries set status='skipped',delivered_at=null;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); k text; ev uuid; delivery uuid; target record;
 keys text[]:=array['requests.gioca.received','requests.allenati.received','moviback.membership.requested','moviback.reward.requested','store.order.received','tournament.registration.created','tournament.reserve.created','tournament.registration.cancelled','tournament.reserve.promoted'];
begin
 insert into public.staff_users(id,full_name,email,role,is_active) values(a,'Routing A','routing-a@example.invalid','admin',true),(b,'Routing B','routing-b@example.invalid','staff',true),(c,'Routing C','routing-c@example.invalid','staff',true),(d,'Routing D','routing-d@example.invalid','staff',false);
 perform public.admin_set_staff_push_rules(a,a,keys);
 if (select count(*) from public.resolve_staff_push_recipients('requests.gioca.received'))<>1 then raise exception 'GIOCA_SINGLE';end if;
 perform public.admin_set_staff_push_rules(a,b,array['requests.gioca.received','requests.gioca.received']);
 if (select count(*) from public.resolve_staff_push_recipients('requests.gioca.received'))<>2 then raise exception 'GIOCA_TWO';end if;
 perform public.admin_set_staff_push_rules(a,c,array['requests.gioca.received']);
 begin perform public.admin_set_staff_push_rules(b,a,keys);raise exception 'STAFF_CAN_CONFIGURE';exception when raise_exception then if sqlerrm='STAFF_CAN_CONFIGURE' then raise;end if;end;
 begin perform public.admin_set_staff_push_rules(a,d,keys);raise exception 'INACTIVE_CAN_ASSIGN';exception when raise_exception then if sqlerrm='INACTIVE_CAN_ASSIGN' then raise;end if;end;
 perform public.manage_push_subscription('subscribe','https://fcm.googleapis.com/routing/a1',null,a,repeat('a',87),repeat('b',22));
 perform public.manage_push_subscription('subscribe','https://fcm.googleapis.com/routing/a2',null,a,repeat('a',87),repeat('b',22));
 perform public.manage_push_subscription('subscribe','https://fcm.googleapis.com/routing/b1',null,b,repeat('a',87),repeat('b',22));
 foreach k in array keys loop
  if public.enqueue_staff_push_event(k,'fixture',case when k like 'tournament.%' then 'tournaments' else split_part(k,'.',1) end,'{"title":"Test","body":"Fixture","url":"/admin/requests"}')<>(case when k='requests.gioca.received' then 3 else 1 end) then raise exception 'RECIPIENT_COUNT';end if;
  if public.enqueue_staff_push_event(k,'fixture','requests','{"url":"/admin/requests"}')<>0 then raise exception 'REPLAY_DUPLICATES';end if;
 end loop;
 if exists(select 1 from public.notification_deliveries nd join public.notification_events e on e.id=nd.event_id where e.recipient_staff_user_id in(a,b,c,d) and nd.channel<>'push') then raise exception 'EMAIL_LEAK';end if;
 if exists(select 1 from public.notification_deliveries nd join public.notification_events e on e.id=nd.event_id where e.recipient_staff_user_id=c and (nd.status<>'skipped' or nd.last_error_code<>'no_active_subscription')) then raise exception 'NO_DEVICE_NOT_SKIPPED';end if;
 perform public.claim_push_deliveries('routing-test',100);
 select e.id,nd.id into ev,delivery from public.notification_events e join public.notification_deliveries nd on nd.event_id=e.id where e.recipient_staff_user_id=a and e.event_type='requests.gioca.received';
 if (select count(*) from public.claim_push_targets(delivery,'routing-test'))<>2 then raise exception 'MULTIDEVICE';end if;
 for target in select * from public.push_delivery_targets where delivery_id=delivery loop perform public.finish_push_target(target.id,'routing-test','accepted');end loop;
 if (select count(*) from public.claim_push_targets(delivery,'routing-test'))<>0 then raise exception 'ACCEPTED_RETRIED';end if;
 update public.staff_users set is_active=false where id=b;
 if exists(select 1 from public.resolve_staff_push_recipients('requests.gioca.received') where staff_user_id=b) then raise exception 'INACTIVE_RESOLVED';end if;
 perform public.admin_set_staff_push_rules(a,a,'{}');perform public.admin_set_staff_push_rules(a,c,'{}');
 if public.enqueue_staff_push_event('requests.gioca.received','empty','requests','{"url":"/admin/requests"}')<>0 then raise exception 'EMPTY_ROUTING';end if;
end $$;
rollback;
