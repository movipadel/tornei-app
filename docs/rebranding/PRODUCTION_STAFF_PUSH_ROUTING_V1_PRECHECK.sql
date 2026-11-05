-- SELECT only. Run within an explicitly READ ONLY transaction; no PII.
select current_setting('transaction_read_only') as transaction_read_only;
select name,to_regclass('public.'||name) is not null as present from unnest(array['staff_users','staff_notification_responsibilities','notification_events','notification_deliveries','push_subscriptions','push_delivery_targets']) name;
select count(*) as routing_rows from public.staff_notification_responsibilities;
select role,is_active,count(*) from public.staff_users group by role,is_active;
select public_user_id is not null as customer_owner,staff_user_id is not null as staff_owner,is_active,count(*) from public.push_subscriptions group by 1,2,3;
select count(*) as legacy_active_ownerless from public.admin_push_subscriptions where is_active and staff_id is null;
select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name in ('staff_notification_responsibilities','notification_events','notification_deliveries') order by table_name,ordinal_position;
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('resolve_staff_push_recipients','admin_set_staff_push_rules','enqueue_staff_push_event');
select c.relname,l.mode,l.granted,count(*) from pg_locks l join pg_class c on c.oid=l.relation where c.relnamespace='public'::regnamespace and c.relname in ('staff_users','staff_notification_responsibilities','notification_events','notification_deliveries','push_subscriptions') group by 1,2,3;
select count(*) as long_transactions from pg_stat_activity where datname=current_database() and xact_start<now()-interval '1 minute' and pid<>pg_backend_pid();
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.notification_events'::regclass,'public.staff_notification_responsibilities'::regclass);
