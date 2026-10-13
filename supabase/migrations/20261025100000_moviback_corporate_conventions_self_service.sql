-- MoviBack corporate conventions C4: existing-member self-service activation.
-- New-member enrollment codes remain intentionally deferred.

CREATE OR REPLACE FUNCTION public.claim_moviback_agreement_code(
    p_user_id uuid,
    p_code_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_now timestamptz := transaction_timestamp();
  v_membership public.loyalty_memberships%rowtype;
  v_membership_count integer;
  v_code public.moviback_agreement_codes%rowtype;
  v_agreement public.moviback_agreements%rowtype;
  v_entitlement public.moviback_agreement_entitlements%rowtype;
BEGIN
  IF p_user_id IS NULL OR btrim(coalesce(p_code_hash, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND identity_status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'MEMBERSHIP_NOT_ELIGIBLE');
  END IF;

  SELECT count(*) INTO v_membership_count
  FROM public.loyalty_memberships
  WHERE user_id = p_user_id;

  IF v_membership_count <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', CASE WHEN v_membership_count = 0 THEN 'MEMBERSHIP_NOT_FOUND' ELSE 'MEMBERSHIP_AMBIGUOUS' END
    );
  END IF;

  SELECT * INTO v_membership
  FROM public.loyalty_memberships
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_membership.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'MEMBERSHIP_NOT_ELIGIBLE');
  END IF;

  SELECT * INTO v_code
  FROM public.moviback_agreement_codes
  WHERE code_hash = p_code_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE');
  END IF;

  -- A lost HTTP response is safe to retry: the same member and same resulting
  -- entitlement receive the original successful outcome without another write.
  IF v_code.claimed_by_membership_id = v_membership.id
     AND v_code.status IN ('claimed', 'used') THEN
    SELECT * INTO v_entitlement
    FROM public.moviback_agreement_entitlements
    WHERE membership_id = v_membership.id
      AND code_id = v_code.id
      AND status IN ('scheduled', 'active')
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      SELECT * INTO v_agreement
      FROM public.moviback_agreements
      WHERE id = v_entitlement.agreement_id;

      RETURN jsonb_build_object(
        'ok', true,
        'replayed', true,
        'entitlement_id', v_entitlement.id,
        'agreement', jsonb_build_object(
          'id', v_agreement.id,
          'name', v_agreement.name,
          'multiplier', v_agreement.multiplier,
          'effective_from', v_entitlement.effective_from,
          'effective_until', v_entitlement.effective_until,
          'status', v_entitlement.status
        )
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.moviback_agreement_entitlements
    WHERE membership_id = v_membership.id
      AND status IN ('scheduled', 'active')
      AND revoked_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'ACTIVE_ENTITLEMENT_EXISTS');
  END IF;

  IF v_code.status IN ('claimed', 'used') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'CODE_ALREADY_USED');
  END IF;
  IF v_code.status = 'revoked' OR v_code.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'CODE_REVOKED');
  END IF;
  IF v_code.status = 'expired'
     OR v_now < v_code.valid_from
     OR (v_code.valid_until IS NOT NULL AND v_now >= v_code.valid_until) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'CODE_EXPIRED');
  END IF;
  -- C1/C3 reserved codes do not carry a member reservation, so they are not
  -- publicly claimable until a later phase defines that lifecycle.
  IF v_code.status <> 'available' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE');
  END IF;

  SELECT * INTO v_agreement
  FROM public.moviback_agreements
  WHERE id = v_code.agreement_id
  FOR SHARE;

  IF NOT FOUND
     OR v_agreement.status <> 'active'
     OR v_now < v_agreement.valid_from
     OR (v_agreement.valid_until IS NOT NULL AND v_now >= v_agreement.valid_until) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'AGREEMENT_NOT_ACTIVE');
  END IF;

  UPDATE public.moviback_agreement_codes
  SET status = 'used',
      claimed_at = v_now,
      claimed_by_membership_id = v_membership.id
  WHERE id = v_code.id;

  INSERT INTO public.moviback_agreement_entitlements(
    membership_id, agreement_id, code_id, status, activation_source,
    activated_at, effective_from, effective_until
  ) VALUES (
    v_membership.id, v_agreement.id, v_code.id, 'active', 'code',
    v_now, v_now, v_agreement.valid_until
  ) RETURNING * INTO v_entitlement;

  INSERT INTO public.moviback_agreement_audit_events(
    agreement_id, code_id, entitlement_id, event_type, actor_user_id, after_state
  ) VALUES (
    v_agreement.id,
    v_code.id,
    v_entitlement.id,
    'entitlement_activated',
    p_user_id,
    jsonb_build_object(
      'membership_id', v_membership.id,
      'entitlement_id', v_entitlement.id,
      'status', v_entitlement.status,
      'activation_source', v_entitlement.activation_source,
      'effective_from', v_entitlement.effective_from,
      'effective_until', v_entitlement.effective_until
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'replayed', false,
    'entitlement_id', v_entitlement.id,
    'agreement', jsonb_build_object(
      'id', v_agreement.id,
      'name', v_agreement.name,
      'multiplier', v_agreement.multiplier,
      'effective_from', v_entitlement.effective_from,
      'effective_until', v_entitlement.effective_until,
      'status', v_entitlement.status
    )
  );
END
$function$;

REVOKE ALL ON FUNCTION public.claim_moviback_agreement_code(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_moviback_agreement_code(uuid,text) TO service_role;

COMMENT ON FUNCTION public.claim_moviback_agreement_code(uuid,text) IS
  'C4 atomic hash-only code claim for one canonical approved existing MoviBack member, with safe self replay and no point movement.';
