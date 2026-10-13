begin;

-- C7 uses the existing durable user-email outbox. Convention audit rows are
-- written by the authoritative C3-C5 RPCs in the same transaction as the
-- business outcome, so this trigger provides atomic event production without
-- duplicating transition logic or sending email inline.
create function public.enqueue_moviback_agreement_user_notification()
returns trigger
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $$
declare
  v_entitlement public.moviback_agreement_entitlements%rowtype;
  v_agreement public.moviback_agreements%rowtype;
  v_membership public.loyalty_memberships%rowtype;
  v_recipient uuid;
  v_event_type text;
  v_key text;
begin
  if new.entitlement_id is null then return new; end if;

  if new.event_type in ('entitlement_activated','entitlement_activated_on_membership_approval') then
    v_event_type := 'moviback.agreement.activated';
  elsif new.event_type = 'entitlement_assigned'
        and new.after_state->>'status' = 'active' then
    v_event_type := 'moviback.agreement.activated';
  elsif new.event_type = 'entitlement_not_activated_on_membership_approval' then
    v_event_type := 'moviback.agreement.not_activated';
  elsif new.event_type = 'entitlement_revoked'
        and new.before_state->>'status' = 'active'
        and coalesce(nullif(new.before_state->>'effective_from','')::timestamptz,new.created_at) <= new.created_at
        and (
          nullif(new.before_state->>'effective_until','') is null
          or (new.before_state->>'effective_until')::timestamptz > new.created_at
        ) then
    v_event_type := 'moviback.agreement.revoked';
  else
    return new;
  end if;

  select * into v_entitlement
  from public.moviback_agreement_entitlements
  where id=new.entitlement_id;
  if not found then return new; end if;

  -- A scheduled Admin assignment is intentionally silent until an actual
  -- activation transition exists.
  if v_event_type='moviback.agreement.activated'
     and (
       v_entitlement.status<>'active'
       or v_entitlement.effective_from is null
       or v_entitlement.effective_from>new.created_at
       or (v_entitlement.effective_until is not null and v_entitlement.effective_until<=new.created_at)
     ) then
    return new;
  end if;

  select * into v_agreement from public.moviback_agreements where id=v_entitlement.agreement_id;
  select * into v_membership from public.loyalty_memberships where id=v_entitlement.membership_id;
  if v_agreement.id is null or v_membership.id is null then return new; end if;

  v_recipient := public.resolve_canonical_user_id(v_membership.user_id);
  if v_recipient is null or not exists(
    select 1 from public.users where id=v_recipient and identity_status='active'
  ) then
    return new;
  end if;

  v_key := v_event_type||':entitlement:'||v_entitlement.id;
  perform public.enqueue_user_notification(
    v_event_type,
    'moviback',
    v_recipient,
    v_key,
    'moviback_agreement_entitlement',
    v_entitlement.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'agreement_id',v_agreement.id,
      'agreement_name',v_agreement.name,
      'multiplier',v_agreement.multiplier,
      'entitlement_id',v_entitlement.id,
      'entitlement_status',v_entitlement.status,
      'activation_source',v_entitlement.activation_source,
      'effective_from',v_entitlement.effective_from,
      'effective_until',v_entitlement.effective_until
    )),
    new.created_at
  );

  return new;
end;
$$;

create trigger moviback_agreement_user_email_outbox
after insert on public.moviback_agreement_audit_events
for each row execute function public.enqueue_moviback_agreement_user_notification();

revoke all on function public.enqueue_moviback_agreement_user_notification()
from public,anon,authenticated;

comment on function public.enqueue_moviback_agreement_user_notification() is
  'C7 transactional email outbox producer for authoritative convention activation, non-activation and effective revocation outcomes.';

commit;
