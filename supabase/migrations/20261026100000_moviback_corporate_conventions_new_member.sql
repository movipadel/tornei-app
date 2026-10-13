-- MoviBack corporate conventions C5: new-member reservation and approval activation.
-- Enrollment keeps convention benefits non-effective until the membership is approved.

ALTER TABLE public.moviback_agreement_codes
  DROP CONSTRAINT moviback_agreement_codes_claim_check,
  DROP CONSTRAINT moviback_agreement_codes_status_check;

ALTER TABLE public.moviback_agreement_codes
  ADD CONSTRAINT moviback_agreement_codes_status_check
    CHECK (status IN ('available','reserved','claimed','used','closed','revoked','expired')),
  ADD CONSTRAINT moviback_agreement_codes_claim_check CHECK (
    (claimed_at IS NULL) = (claimed_by_membership_id IS NULL)
    AND (status NOT IN ('reserved','claimed','used','closed') OR claimed_at IS NOT NULL)
    AND (status <> 'available' OR claimed_at IS NULL)
  );

ALTER TABLE public.moviback_agreement_entitlements
  DROP CONSTRAINT moviback_agreement_entitlements_status_check,
  DROP CONSTRAINT moviback_entitlements_validity_check,
  DROP CONSTRAINT moviback_entitlements_activation_check,
  ALTER COLUMN effective_from DROP NOT NULL,
  ADD COLUMN not_activation_reason text;

ALTER TABLE public.moviback_agreement_entitlements
  ADD CONSTRAINT moviback_agreement_entitlements_status_check
    CHECK (status IN ('pending','scheduled','active','not_activated','revoked','expired')),
  ADD CONSTRAINT moviback_entitlements_validity_check CHECK (
    effective_until IS NULL OR (effective_from IS NOT NULL AND effective_until > effective_from)
  ),
  ADD CONSTRAINT moviback_entitlements_activation_check CHECK (
    (status = 'pending' AND activated_at IS NULL AND effective_from IS NULL AND not_activation_reason IS NULL)
    OR (status = 'scheduled' AND activated_at IS NULL AND effective_from IS NOT NULL AND not_activation_reason IS NULL)
    OR (status = 'not_activated' AND activated_at IS NULL AND effective_from IS NULL AND btrim(coalesce(not_activation_reason,'')) <> '')
    OR (status IN ('active','revoked','expired') AND activated_at IS NOT NULL AND effective_from IS NOT NULL AND not_activation_reason IS NULL)
  );

DROP INDEX public.moviback_entitlements_one_current_per_membership;
CREATE UNIQUE INDEX moviback_entitlements_one_current_per_membership
  ON public.moviback_agreement_entitlements (membership_id)
  WHERE status IN ('pending','scheduled','active') AND revoked_at IS NULL;

CREATE TABLE public.moviback_membership_enrollment_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  membership_id uuid NOT NULL REFERENCES public.loyalty_memberships(id) ON DELETE CASCADE,
  certificate_id uuid NOT NULL REFERENCES public.medical_certificates(id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (user_id, idempotency_key)
);

ALTER TABLE public.moviback_membership_enrollment_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moviback_membership_enrollment_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.moviback_membership_enrollment_requests TO service_role;

CREATE OR REPLACE FUNCTION public.submit_moviback_membership_request_c5(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_membership_code text,
  p_tax_code text,
  p_membership_type text,
  p_fee_points integer,
  p_fee_paid boolean,
  p_has_existing_membership boolean,
  p_existing_membership_type text,
  p_existing_membership_number text,
  p_certificate_file_path text,
  p_certificate_expiry date,
  p_code_hash text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_now timestamptz := transaction_timestamp();
  v_existing_request public.moviback_membership_enrollment_requests%rowtype;
  v_membership public.loyalty_memberships%rowtype;
  v_membership_count integer;
  v_certificate public.medical_certificates%rowtype;
  v_code public.moviback_agreement_codes%rowtype;
  v_agreement public.moviback_agreements%rowtype;
  v_current_entitlement public.moviback_agreement_entitlements%rowtype;
  v_previous_entitlement public.moviback_agreement_entitlements%rowtype;
  v_entitlement public.moviback_agreement_entitlements%rowtype;
  v_replace_current boolean := false;
  v_previous_reason text;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok',false,'error_code','INVALID_REQUEST');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_user_id AND identity_status='active') THEN
    RETURN jsonb_build_object('ok',false,'error_code','USER_NOT_ELIGIBLE');
  END IF;
  IF btrim(coalesce(p_membership_code,''))='' OR btrim(coalesce(p_tax_code,''))=''
     OR p_membership_type NOT IN ('ASC','FITP') OR btrim(coalesce(p_certificate_file_path,''))=''
     OR p_certificate_expiry IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error_code','INVALID_REQUEST');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('moviback-enrollment:' || p_user_id::text,0));

  SELECT * INTO v_existing_request
  FROM public.moviback_membership_enrollment_requests
  WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_request.request_hash<>p_request_hash THEN
      RETURN jsonb_build_object('ok',false,'error_code','IDEMPOTENCY_CONFLICT');
    END IF;
    RETURN v_existing_request.result || jsonb_build_object('replayed',true);
  END IF;

  SELECT count(*) INTO v_membership_count FROM public.loyalty_memberships WHERE user_id=p_user_id;
  IF v_membership_count>1 THEN
    RETURN jsonb_build_object('ok',false,'error_code','MEMBERSHIP_CARDINALITY');
  END IF;
  IF v_membership_count=1 THEN
    SELECT * INTO v_membership FROM public.loyalty_memberships WHERE user_id=p_user_id FOR UPDATE;
    IF v_membership.status<>'rejected' THEN
      RETURN jsonb_build_object('ok',false,'error_code','MEMBERSHIP_EXISTS');
    END IF;
  ELSE
    v_membership.id := gen_random_uuid();
  END IF;

  SELECT * INTO v_current_entitlement
  FROM public.moviback_agreement_entitlements
  WHERE membership_id=v_membership.id AND status IN ('pending','scheduled','active') AND revoked_at IS NULL
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF NULLIF(btrim(coalesce(p_code_hash,'')),'') IS NOT NULL THEN
    IF FOUND THEN
      SELECT * INTO v_code FROM public.moviback_agreement_codes WHERE id=v_current_entitlement.code_id FOR UPDATE;
      IF v_code.code_hash=p_code_hash AND v_code.status='reserved'
         AND v_code.claimed_by_membership_id=v_membership.id THEN
        SELECT * INTO v_agreement FROM public.moviback_agreements WHERE id=v_code.agreement_id FOR SHARE;
        IF v_now<v_code.valid_from OR (v_code.valid_until IS NOT NULL AND v_now>=v_code.valid_until) THEN
          RETURN jsonb_build_object('ok',false,'error_code','CODE_EXPIRED');
        END IF;
        IF v_agreement.status<>'active' OR v_now<v_agreement.valid_from
           OR (v_agreement.valid_until IS NOT NULL AND v_now>=v_agreement.valid_until) THEN
          RETURN jsonb_build_object('ok',false,'error_code','AGREEMENT_NOT_ACTIVE');
        END IF;
        v_entitlement := v_current_entitlement;
      ELSIF v_code.status IN ('revoked','expired','closed') THEN
        v_previous_entitlement:=v_current_entitlement;
        v_previous_reason:='previous_reservation_' || v_code.status;
        v_replace_current:=true;
        v_current_entitlement := NULL;
      ELSE
        RETURN jsonb_build_object('ok',false,'error_code','RESERVATION_CONFLICT');
      END IF;
    END IF;

    IF v_current_entitlement.id IS NULL THEN
      SELECT * INTO v_code FROM public.moviback_agreement_codes WHERE code_hash=p_code_hash FOR UPDATE;
      IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error_code','INVALID_CODE'); END IF;
      IF v_code.status IN ('claimed','used','reserved','closed') THEN RETURN jsonb_build_object('ok',false,'error_code','CODE_ALREADY_USED'); END IF;
      IF v_code.status='revoked' OR v_code.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error_code','CODE_REVOKED'); END IF;
      IF v_code.status='expired' OR v_now<v_code.valid_from OR (v_code.valid_until IS NOT NULL AND v_now>=v_code.valid_until) THEN
        RETURN jsonb_build_object('ok',false,'error_code','CODE_EXPIRED');
      END IF;
      IF v_code.status<>'available' THEN RETURN jsonb_build_object('ok',false,'error_code','INVALID_CODE'); END IF;
      SELECT * INTO v_agreement FROM public.moviback_agreements WHERE id=v_code.agreement_id FOR SHARE;
      IF NOT FOUND OR v_agreement.status<>'active' OR v_now<v_agreement.valid_from
         OR (v_agreement.valid_until IS NOT NULL AND v_now>=v_agreement.valid_until) THEN
        RETURN jsonb_build_object('ok',false,'error_code','AGREEMENT_NOT_ACTIVE');
      END IF;
      IF v_replace_current THEN
        UPDATE public.moviback_agreement_entitlements
        SET status='not_activated',not_activation_reason=v_previous_reason,updated_at=v_now
        WHERE id=v_previous_entitlement.id RETURNING * INTO v_previous_entitlement;
        INSERT INTO public.moviback_agreement_audit_events(agreement_id,code_id,entitlement_id,event_type,actor_user_id,after_state,reason)
        VALUES(v_previous_entitlement.agreement_id,v_previous_entitlement.code_id,v_previous_entitlement.id,
          'entitlement_not_activated',p_user_id,to_jsonb(v_previous_entitlement),'Previous reservation was already terminal');
      END IF;
    END IF;
  ELSIF v_current_entitlement.id IS NOT NULL THEN
    v_entitlement := v_current_entitlement;
  END IF;

  IF v_membership_count=0 THEN
    INSERT INTO public.loyalty_memberships(
      id,user_id,status,membership_code,tax_code,membership_type,fee_points,fee_paid,
      has_existing_membership,existing_membership_type,existing_membership_number
    ) VALUES (
      v_membership.id,p_user_id,'pending_review',p_membership_code,p_tax_code,p_membership_type,p_fee_points,p_fee_paid,
      p_has_existing_membership,CASE WHEN p_has_existing_membership THEN p_existing_membership_type END,
      CASE WHEN p_has_existing_membership AND p_existing_membership_type='FITP' THEN p_existing_membership_number END
    ) RETURNING * INTO v_membership;
  ELSE
    UPDATE public.loyalty_memberships SET
      status='pending_review',tax_code=p_tax_code,membership_type=p_membership_type,
      fee_points=p_fee_points,fee_paid=p_fee_paid,has_existing_membership=p_has_existing_membership,
      existing_membership_type=CASE WHEN p_has_existing_membership THEN p_existing_membership_type END,
      existing_membership_number=CASE WHEN p_has_existing_membership AND p_existing_membership_type='FITP' THEN p_existing_membership_number END,
      rejection_reason=NULL,rejected_at=NULL,updated_at=v_now
    WHERE id=v_membership.id RETURNING * INTO v_membership;
  END IF;

  INSERT INTO public.medical_certificates(user_id,file_path,status,expiry_date)
  VALUES(p_user_id,p_certificate_file_path,'pending_review',p_certificate_expiry)
  RETURNING * INTO v_certificate;

  IF NULLIF(btrim(coalesce(p_code_hash,'')),'') IS NOT NULL AND v_entitlement.id IS NULL THEN
    UPDATE public.moviback_agreement_codes
    SET status='reserved',claimed_at=v_now,claimed_by_membership_id=v_membership.id
    WHERE id=v_code.id RETURNING * INTO v_code;
    INSERT INTO public.moviback_agreement_entitlements(
      membership_id,agreement_id,code_id,status,activation_source,activated_at,effective_from,effective_until
    ) VALUES(v_membership.id,v_agreement.id,v_code.id,'pending','code',NULL,NULL,NULL)
    RETURNING * INTO v_entitlement;
    INSERT INTO public.moviback_agreement_audit_events(agreement_id,code_id,entitlement_id,event_type,actor_user_id,after_state)
    VALUES(v_agreement.id,v_code.id,v_entitlement.id,'code_reserved',p_user_id,
      jsonb_build_object('membership_id',v_membership.id,'code_status',v_code.status,'code_suffix',v_code.code_suffix));
    INSERT INTO public.moviback_agreement_audit_events(agreement_id,code_id,entitlement_id,event_type,actor_user_id,after_state)
    VALUES(v_agreement.id,v_code.id,v_entitlement.id,'entitlement_pending_created',p_user_id,
      jsonb_build_object('membership_id',v_membership.id,'status','pending'));
  END IF;

  IF v_entitlement.id IS NOT NULL AND v_agreement.id IS NULL THEN
    SELECT * INTO v_agreement FROM public.moviback_agreements WHERE id=v_entitlement.agreement_id;
  END IF;
  v_result:=jsonb_build_object(
    'ok',true,'replayed',false,'membership_id',v_membership.id,'certificate_id',v_certificate.id,
    'membership_status',v_membership.status,
    'agreement',CASE WHEN v_entitlement.id IS NULL THEN NULL ELSE jsonb_build_object(
      'entitlement_id',v_entitlement.id,'name',v_agreement.name,'multiplier',v_agreement.multiplier,'status',v_entitlement.status
    ) END
  );
  INSERT INTO public.moviback_membership_enrollment_requests(user_id,idempotency_key,request_hash,membership_id,certificate_id,result)
  VALUES(p_user_id,p_idempotency_key,p_request_hash,v_membership.id,v_certificate.id,v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.review_moviback_membership_c5(
  p_membership_id uuid,
  p_action text,
  p_rejection_reason text,
  p_certificate_note text,
  p_actor_staff_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_now timestamptz:=transaction_timestamp();
  v_membership public.loyalty_memberships%rowtype;
  v_certificate public.medical_certificates%rowtype;
  v_entitlement public.moviback_agreement_entitlements%rowtype;
  v_code public.moviback_agreement_codes%rowtype;
  v_agreement public.moviback_agreements%rowtype;
  v_reason text;
BEGIN
  IF p_action NOT IN ('approve','reject') THEN RETURN jsonb_build_object('ok',false,'error_code','INVALID_ACTION'); END IF;
  IF p_actor_staff_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff_users WHERE id=p_actor_staff_id AND is_active) THEN
    RETURN jsonb_build_object('ok',false,'error_code','OPERATOR_INVALID');
  END IF;
  SELECT * INTO v_membership FROM public.loyalty_memberships WHERE id=p_membership_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_FOUND'); END IF;
  IF v_membership.status NOT IN ('pending_review','approved') THEN RETURN jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_REVIEWABLE'); END IF;
  SELECT * INTO v_certificate FROM public.medical_certificates
  WHERE user_id=v_membership.user_id ORDER BY uploaded_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR btrim(coalesce(v_certificate.file_path,''))='' THEN RETURN jsonb_build_object('ok',false,'error_code','CERTIFICATE_MISSING'); END IF;

  IF p_action='reject' THEN
    IF btrim(coalesce(p_rejection_reason,''))='' THEN RETURN jsonb_build_object('ok',false,'error_code','REJECTION_REASON_REQUIRED'); END IF;
    UPDATE public.medical_certificates SET status='rejected',reviewed_at=v_now,reviewed_by=p_actor_staff_id,notes=btrim(p_rejection_reason) WHERE id=v_certificate.id;
    IF v_membership.status='approved' THEN RETURN jsonb_build_object('ok',true,'certificate_only',true); END IF;
    UPDATE public.loyalty_memberships SET status='rejected',rejection_reason=btrim(p_rejection_reason),rejected_at=v_now,updated_at=v_now WHERE id=v_membership.id;
    SELECT * INTO v_entitlement FROM public.moviback_agreement_entitlements
      WHERE membership_id=v_membership.id AND status='pending' ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      INSERT INTO public.moviback_agreement_audit_events(agreement_id,code_id,entitlement_id,event_type,actor_staff_id,after_state,reason)
      VALUES(v_entitlement.agreement_id,v_entitlement.code_id,v_entitlement.id,'membership_rejected_reservation_retained',p_actor_staff_id,
        jsonb_build_object('membership_id',v_membership.id,'entitlement_status','pending'),btrim(p_rejection_reason));
    END IF;
    RETURN jsonb_build_object('ok',true,'membership_status','rejected','convention_status',CASE WHEN v_entitlement.id IS NULL THEN NULL ELSE 'pending' END);
  END IF;

  IF v_certificate.expiry_date IS NULL OR v_certificate.expiry_date < current_date-60 THEN
    RETURN jsonb_build_object('ok',false,'error_code','CERTIFICATE_NOT_ELIGIBLE');
  END IF;
  IF length(btrim(coalesce(v_membership.tax_code,''))) NOT BETWEEN 11 AND 16 THEN
    RETURN jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_ELIGIBLE');
  END IF;
  UPDATE public.medical_certificates SET status='approved',reviewed_at=v_now,reviewed_by=p_actor_staff_id,
    notes=coalesce(nullif(btrim(coalesce(p_certificate_note,'')),''),'Certificato approvato con la richiesta MoviBack') WHERE id=v_certificate.id;
  IF v_membership.status='approved' THEN RETURN jsonb_build_object('ok',true,'certificate_only',true); END IF;
  IF v_membership.fee_points>0 AND NOT v_membership.fee_paid THEN
    INSERT INTO public.loyalty_transactions(membership_id,type,source,euro_amount,points_delta,notes)
    VALUES(v_membership.id,'redeem','membership_fee',NULL,-v_membership.fee_points,
      'Costo tessera ' || coalesce(v_membership.membership_type,'MoviBack') || ': ' || v_membership.fee_points || ' punti');
  END IF;
  UPDATE public.loyalty_memberships SET status='approved',approved_at=v_now,approved_by=p_actor_staff_id,fee_paid=true,updated_at=v_now
  WHERE id=v_membership.id;

  SELECT * INTO v_entitlement FROM public.moviback_agreement_entitlements
  WHERE membership_id=v_membership.id AND status='pending' AND revoked_at IS NULL
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'membership_status','approved','convention_status',NULL); END IF;
  SELECT * INTO v_code FROM public.moviback_agreement_codes WHERE id=v_entitlement.code_id FOR UPDATE;
  SELECT * INTO v_agreement FROM public.moviback_agreements WHERE id=v_entitlement.agreement_id FOR SHARE;

  v_reason:=CASE
    WHEN v_code.id IS NULL OR v_code.claimed_by_membership_id IS DISTINCT FROM v_membership.id THEN 'code_reservation_invalid'
    WHEN v_code.status='revoked' OR v_code.revoked_at IS NOT NULL THEN 'code_revoked'
    WHEN v_code.status='expired' OR (v_code.valid_until IS NOT NULL AND v_now>=v_code.valid_until) THEN 'code_expired'
    WHEN v_code.status<>'reserved' THEN 'code_reservation_invalid'
    WHEN v_now<v_code.valid_from THEN 'code_not_yet_valid'
    WHEN v_agreement.id IS NULL THEN 'agreement_missing'
    WHEN v_agreement.status='suspended' THEN 'agreement_suspended'
    WHEN v_agreement.status='revoked' THEN 'agreement_revoked'
    WHEN v_agreement.status<>'active' THEN 'agreement_' || v_agreement.status
    WHEN v_now<v_agreement.valid_from THEN 'agreement_not_yet_valid'
    WHEN v_agreement.valid_until IS NOT NULL AND v_now>=v_agreement.valid_until THEN 'agreement_expired'
    ELSE NULL END;

  IF v_reason IS NULL THEN
    UPDATE public.moviback_agreement_codes SET status='used' WHERE id=v_code.id;
    UPDATE public.moviback_agreement_entitlements SET status='active',activated_at=v_now,effective_from=v_now,
      effective_until=v_agreement.valid_until,updated_at=v_now WHERE id=v_entitlement.id RETURNING * INTO v_entitlement;
    INSERT INTO public.moviback_agreement_audit_events(agreement_id,code_id,entitlement_id,event_type,actor_staff_id,after_state)
    VALUES(v_agreement.id,v_code.id,v_entitlement.id,'entitlement_activated_on_membership_approval',p_actor_staff_id,
      jsonb_build_object('membership_id',v_membership.id,'status','active','effective_from',v_now,'code_status','used'));
    RETURN jsonb_build_object('ok',true,'membership_status','approved','convention_status','active','entitlement_id',v_entitlement.id);
  END IF;

  IF v_code.id IS NOT NULL AND v_code.status='reserved' THEN
    IF v_reason IN ('code_expired') THEN
      UPDATE public.moviback_agreement_codes SET status='expired' WHERE id=v_code.id;
    ELSE
      UPDATE public.moviback_agreement_codes SET status='closed' WHERE id=v_code.id;
    END IF;
  END IF;
  UPDATE public.moviback_agreement_entitlements SET status='not_activated',not_activation_reason=v_reason,updated_at=v_now
  WHERE id=v_entitlement.id RETURNING * INTO v_entitlement;
  INSERT INTO public.moviback_agreement_audit_events(agreement_id,code_id,entitlement_id,event_type,actor_staff_id,after_state,reason)
  VALUES(v_entitlement.agreement_id,v_entitlement.code_id,v_entitlement.id,'entitlement_not_activated_on_membership_approval',p_actor_staff_id,
    jsonb_build_object('membership_id',v_membership.id,'status','not_activated','code_status',(SELECT status FROM public.moviback_agreement_codes WHERE id=v_entitlement.code_id)),v_reason);
  RETURN jsonb_build_object('ok',true,'membership_status','approved','convention_status','not_activated','convention_reason',v_reason,'entitlement_id',v_entitlement.id);
END
$function$;

REVOKE ALL ON FUNCTION public.submit_moviback_membership_request_c5(uuid,uuid,text,text,text,text,integer,boolean,boolean,text,text,text,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_moviback_membership_request_c5(uuid,uuid,text,text,text,text,integer,boolean,boolean,text,text,text,date,text) TO service_role;
REVOKE ALL ON FUNCTION public.review_moviback_membership_c5(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_moviback_membership_c5(uuid,text,text,text,uuid) TO service_role;

COMMENT ON FUNCTION public.submit_moviback_membership_request_c5(uuid,uuid,text,text,text,text,integer,boolean,boolean,text,text,text,date,text) IS
  'C5 atomic membership request, certificate row, optional hash-only code reservation and pending entitlement creation.';
COMMENT ON FUNCTION public.review_moviback_membership_c5(uuid,text,text,text,uuid) IS
  'C5 atomic membership review. Membership approval is independent from convention validity; invalid reservations terminate as not_activated.';
