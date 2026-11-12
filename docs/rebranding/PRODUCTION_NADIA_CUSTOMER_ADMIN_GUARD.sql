-- Future release guard. Run with psql -v target_user_id=<canonical public.users UUID>.
-- Read-only. The output contains internal identifiers and state, no contact or medical file data.
-- Suspended eligibility is definitive here; for other statuses compare the canonical Admin API.
\set ON_ERROR_STOP on
begin;
set transaction read only;
show transaction_read_only;

with target as (
  select u.id,u.identity_status,u.auth_migration_state,u.auth_user_id
  from public.users u where u.id=:'target_user_id'::uuid
), membership as (
  select m.id,m.user_id,m.status,m.suspension_reason,m.suspended_at,
    m.fee_paid,m.health_data_consent_at,m.approved_at
  from public.loyalty_memberships m join target t on t.id=m.user_id
), certificate as (
  select distinct on (c.user_id) c.user_id,c.id,c.status,c.expiry_date,c.uploaded_at
  from public.medical_certificates c join target t on t.id=c.user_id
  order by c.user_id,c.uploaded_at desc,c.id desc
), approved_certificate as (
  select distinct on (c.user_id) c.user_id,c.id,c.expiry_date
  from public.medical_certificates c join target t on t.id=c.user_id
  where c.status='approved'
  order by c.user_id,c.uploaded_at desc,c.id desc
)
select t.id as account_user_id,t.identity_status,t.auth_migration_state,
  (t.auth_user_id is not null) as auth_linked,
  (select count(*) from public.player_identities p where p.account_user_id=t.id and p.status<>'merged') as linked_player_identities,
  (select count(*) from membership) as membership_count,
  m.id as membership_id,m.status as membership_status,m.suspension_reason,m.suspended_at,
  m.fee_paid,(m.health_data_consent_at is not null) as health_consent_recorded,
  c.id as latest_certificate_id,c.status as latest_certificate_status,c.expiry_date as latest_certificate_expiry,
  a.id as approved_certificate_id,a.expiry_date as approved_certificate_expiry,
  case when m.status='suspended' then false end as can_use_card_while_suspended,
  case when m.status='suspended' then false end as can_earn_while_suspended,
  case when m.status='suspended' then false end as can_redeem_while_suspended,
  coalesce(b.points_balance,0) as full_ledger_points,
  (select count(*) from public.moviback_customer_audit_events e where e.membership_id=m.id) as customer_admin_event_count
from target t left join membership m on true
left join certificate c on c.user_id=t.id
left join approved_certificate a on a.user_id=t.id
left join lateral public.get_moviback_points_balances(array[m.id]) b on b.membership_id=m.id;

rollback;
