-- SELECT-only precheck for 20261103201543_notification_foundation_v1.sql.
-- PREPARED ONLY: not executed against production by this task.
-- Requires authorized read access to public tables/catalogs; no endpoint, key, user or query-text output.
-- Run before migration, after schema/object existence has been reviewed.

select current_database() as database_name, current_setting('server_version') as server_version;

select count(*) as legacy_total,
 count(*) filter(where is_active) as legacy_active,
 count(*) filter(where not is_active) as legacy_inactive,
 count(*) filter(where staff_id is not null) as staff_id_populated,
 count(*) filter(where staff_id is null) as legacy_ownerless,
 count(*) filter(where is_active and staff_id is null) as active_ownerless,
 count(*) filter(where endpoint is null or btrim(endpoint)='') as missing_endpoint,
 count(*) filter(where p256dh is null or auth is null) as missing_key_material
from public.admin_push_subscriptions;

-- Optional table: dynamic SELECT avoids parsing a nonexistent relation.
-- Only an aggregate is returned. Existing canonical table remains a migration conflict.
select query_to_xml(case when to_regclass('public.push_subscriptions') is not null
 then 'select count(*) as endpoint_overlap from public.admin_push_subscriptions a join public.push_subscriptions p on p.endpoint=a.endpoint'
 else 'select 0 as endpoint_overlap' end, false, true, '') as canonical_overlap;

select c.relname,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'INSERT') as anon_insert,
 has_table_privilege('authenticated',c.oid,'INSERT') as authenticated_insert,
 has_table_privilege('service_role',c.oid,'UPDATE') as service_update
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('admin_push_subscriptions','push_subscriptions');

select tablename,cmd,roles,count(*) as policy_count
from pg_policies where schemaname='public' and tablename in ('admin_push_subscriptions','push_subscriptions')
group by tablename,cmd,roles;

select count(*) as duplicate_endpoint_groups,coalesce(sum(n-1),0) as excess_rows
from (select count(*) n from public.admin_push_subscriptions group by endpoint having count(*)>1) duplicates;

-- Aggregate-only approximation of application validation; no secrets/endpoints returned.
-- Invalid non-null staff_id does not authorize inferring ownership either.
select count(*) filter(where endpoint !~ '^https://(fcm[.]googleapis[.]com|web[.]push[.]apple[.]com|updates[.]push[.]services[.]mozilla[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/[^[:space:]]+$') as unreviewed_endpoint_shape,
 count(*) filter(where length(endpoint)>2048) as oversized_endpoint,
 count(*) filter(where p256dh !~ '^[A-Za-z0-9_-]{87}=?$' or auth !~ '^[A-Za-z0-9_-]{22}={0,2}$') as key_shape_review_required,
 count(*) filter(where staff_id is not null and not exists(select 1 from public.staff_users s where s.id=a.staff_id)) as dangling_legacy_staff_reference
from public.admin_push_subscriptions a where is_active;

select candidate,to_regclass('public.'||candidate) is not null as object_conflict
from unnest(array['push_subscriptions','push_delivery_targets','staff_notification_responsibilities','push_public_owner_idx','push_staff_owner_idx','push_targets_due_idx']) candidate;

select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and (
 (table_name in ('users','staff_users','notification_events','notification_deliveries') and column_name='id')
 or (table_name='users' and column_name in ('identity_status','merged_into_user_id'))
 or (table_name='staff_users' and column_name in ('role','is_active'))
 or (table_name='notification_events' and column_name in ('recipient_user_id','recipient_staff_user_id'))
 or (table_name='user_notification_preferences' and column_name in ('user_id','transactional_push_enabled'))
) order by table_name,column_name;

select c.relname as relation_name,k.conname,k.contype,pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('users','staff_users','notification_events','notification_deliveries','admin_push_subscriptions','staff_permissions')
and (k.contype in ('p','f','u') or k.conname in ('notification_deliveries_channel_check','notification_deliveries_status_check','notification_delivery_state_valid'))
order by c.relname,k.conname;

select channel,status,count(*) as delivery_count from public.notification_deliveries group by channel,status order by channel,status;
select count(*) filter(where recipient_user_id is null) as invalid_existing_event_owner_count from public.notification_events;

select p.proname,pg_get_function_identity_arguments(p.oid) as signature,p.prosecdef,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
 'manage_push_subscription','merge_owned_push_subscriptions','enqueue_push_delivery','push_subscription_eligible',
 'claim_push_deliveries','claim_push_targets','finish_push_target','finish_push_delivery',
 'claim_notification_deliveries','operator_has_permission') order by p.proname;

select tgname as conflicting_trigger from pg_trigger where tgname='users_merge_owned_push' and not tgisinternal;

-- Row estimates/table size indicate ALTER TABLE validation/rewrite and lock exposure.
select c.relname,c.reltuples::bigint as estimated_rows,pg_total_relation_size(c.oid) as total_bytes
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('notification_events','notification_deliveries','user_notification_preferences','users','staff_users','admin_push_subscriptions');

select c.relname,l.mode,l.granted,count(*) as locks,
 max(extract(epoch from (now()-a.xact_start)))::bigint as oldest_transaction_seconds
from pg_locks l join pg_class c on c.oid=l.relation join pg_namespace n on n.oid=c.relnamespace
left join pg_stat_activity a on a.pid=l.pid
where n.nspname='public' and c.relname in ('notification_events','notification_deliveries','user_notification_preferences','users','staff_users','admin_push_subscriptions')
group by c.relname,l.mode,l.granted order by c.relname,l.mode;

select count(*) filter(where xact_start<now()-interval '5 minutes') as long_transactions,
 count(*) filter(where state='idle in transaction') as idle_transactions,
 count(*) filter(where wait_event_type='Lock') as lock_waiters
from pg_stat_activity where datname=current_database();

-- VAPID lives in env, not these tables. Verify key pairing/build/runtime separately without printing values.
select 'NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (legacy mailto fallback retained)' as required_configuration_contract,
 'Deactivate all legacy rows; preserve history; never regenerate keys, copy legacy endpoints or infer staff ownership' as cutover_constraint,
 'Legacy mode is default; canonical sending requires explicit exclusive canonical mode plus existing enable flags' as transport_contract;

-- Gate interpretation: conflicts/non-UUID FKs/missing expected constraints => BLOCKED.
-- Active legacy rows are expected to become zero in the authorized migration transaction.
-- Browser notification permission is not stored here and never establishes canonical ownership.
-- Unreviewed endpoints/keys => possible fail-closed delivery loss; review before authorizing release.
-- AccessExclusive locks required by ALTER TABLE: schedule a bounded transaction and an operational rollback separately.
