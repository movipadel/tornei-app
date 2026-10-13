-- MoviBack corporate conventions C3: server-only administration.
-- Plaintext agreement codes never cross the database boundary.

CREATE TABLE public.moviback_agreement_code_batches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    agreement_id uuid NOT NULL REFERENCES public.moviback_agreements(id),
    idempotency_key uuid NOT NULL UNIQUE,
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 500),
    valid_from timestamptz NOT NULL,
    valid_until timestamptz,
    generated_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT moviback_code_batches_validity_check CHECK (valid_until IS NULL OR valid_until > valid_from)
);

ALTER TABLE public.moviback_agreement_codes
    ADD CONSTRAINT moviback_agreement_codes_batch_fkey
    FOREIGN KEY (batch_id) REFERENCES public.moviback_agreement_code_batches(id);

DROP INDEX public.moviback_entitlements_one_active_per_membership;
CREATE UNIQUE INDEX moviback_entitlements_one_current_per_membership
    ON public.moviback_agreement_entitlements (membership_id)
    WHERE status IN ('scheduled','active') AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_moviback_agreement(
    p_name text, p_slug text, p_status text, p_multiplier numeric,
    p_valid_from timestamptz, p_valid_until timestamptz, p_actor_staff_id uuid
) RETURNS public.moviback_agreements
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public AS $function$
DECLARE v_row public.moviback_agreements%rowtype;
BEGIN
  IF p_actor_staff_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.staff_users WHERE id=p_actor_staff_id AND is_active) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_AGREEMENT_OPERATOR_INVALID';
  END IF;
  INSERT INTO public.moviback_agreements(name,slug,status,multiplier,valid_from,valid_until,created_by)
  VALUES(btrim(p_name),lower(btrim(p_slug)),p_status,p_multiplier,p_valid_from,p_valid_until,p_actor_staff_id)
  RETURNING * INTO v_row;
  INSERT INTO public.moviback_agreement_audit_events(agreement_id,event_type,actor_staff_id,after_state)
  VALUES(v_row.id,'agreement_created',p_actor_staff_id,to_jsonb(v_row));
  RETURN v_row;
END $function$;

CREATE OR REPLACE FUNCTION public.update_moviback_agreement(
    p_agreement_id uuid, p_name text, p_slug text, p_status text, p_multiplier numeric,
    p_valid_from timestamptz, p_valid_until timestamptz, p_actor_staff_id uuid
) RETURNS public.moviback_agreements
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public AS $function$
DECLARE v_before public.moviback_agreements%rowtype; v_after public.moviback_agreements%rowtype; v_membership_id uuid;
BEGIN
  IF p_actor_staff_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.staff_users WHERE id=p_actor_staff_id AND is_active) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_AGREEMENT_OPERATOR_INVALID';
  END IF;
  -- Same lock order as credit/assignment: membership before agreement.
  FOR v_membership_id IN
    SELECT DISTINCT membership_id FROM public.moviback_agreement_entitlements
    WHERE agreement_id=p_agreement_id AND status IN ('scheduled','active') AND revoked_at IS NULL ORDER BY membership_id
  LOOP
    PERFORM 1 FROM public.loyalty_memberships WHERE id=v_membership_id FOR UPDATE;
  END LOOP;
  SELECT * INTO v_before FROM public.moviback_agreements WHERE id=p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_AGREEMENT_NOT_FOUND'; END IF;
  UPDATE public.moviback_agreements SET
    name=btrim(p_name), slug=lower(btrim(p_slug)), status=p_status, multiplier=p_multiplier,
    valid_from=p_valid_from, valid_until=p_valid_until, updated_at=transaction_timestamp()
  WHERE id=p_agreement_id RETURNING * INTO v_after;
  INSERT INTO public.moviback_agreement_audit_events(agreement_id,event_type,actor_staff_id,before_state,after_state)
  VALUES(p_agreement_id,'agreement_updated',p_actor_staff_id,to_jsonb(v_before),to_jsonb(v_after));
  RETURN v_after;
END $function$;

CREATE OR REPLACE FUNCTION public.generate_moviback_agreement_code_batch(
    p_agreement_id uuid, p_idempotency_key uuid, p_codes jsonb,
    p_valid_from timestamptz, p_valid_until timestamptz, p_actor_staff_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public AS $function$
DECLARE v_batch public.moviback_agreement_code_batches%rowtype; v_count integer; v_agreement public.moviback_agreements%rowtype;
BEGIN
  IF p_actor_staff_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.staff_users WHERE id=p_actor_staff_id AND is_active) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_AGREEMENT_OPERATOR_INVALID';
  END IF;
  v_count := jsonb_array_length(coalesce(p_codes,'[]'::jsonb));
  IF v_count < 1 OR v_count > 500 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_CODE_BATCH_QUANTITY_INVALID'; END IF;
  SELECT * INTO v_agreement FROM public.moviback_agreements WHERE id=p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_AGREEMENT_NOT_FOUND'; END IF;
  INSERT INTO public.moviback_agreement_code_batches(agreement_id,idempotency_key,quantity,valid_from,valid_until,generated_by)
  VALUES(p_agreement_id,p_idempotency_key,v_count,p_valid_from,p_valid_until,p_actor_staff_id)
  ON CONFLICT (idempotency_key) DO NOTHING RETURNING * INTO v_batch;
  IF NOT FOUND THEN
    SELECT * INTO v_batch FROM public.moviback_agreement_code_batches WHERE idempotency_key=p_idempotency_key;
    IF v_batch.agreement_id<>p_agreement_id OR v_batch.quantity<>v_count THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_CODE_BATCH_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('created',false,'replayed',true,'batch_id',v_batch.id,'quantity',v_batch.quantity,'plaintext_recoverable',false);
  END IF;
  INSERT INTO public.moviback_agreement_codes(agreement_id,code_hash,code_suffix,batch_id,status,valid_from,valid_until,created_by)
  SELECT p_agreement_id,btrim(item->>'hash'),btrim(item->>'suffix'),v_batch.id,'available',p_valid_from,p_valid_until,p_actor_staff_id
  FROM jsonb_array_elements(p_codes) item
  WHERE item ? 'hash' AND item ? 'suffix';
  IF (SELECT count(*) FROM public.moviback_agreement_codes WHERE batch_id=v_batch.id)<>v_count THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_CODE_BATCH_PAYLOAD_INVALID';
  END IF;
  INSERT INTO public.moviback_agreement_audit_events(agreement_id,event_type,actor_staff_id,after_state)
  VALUES(p_agreement_id,'code_batch_generated',p_actor_staff_id,jsonb_build_object('batch_id',v_batch.id,'quantity',v_count,'valid_from',p_valid_from,'valid_until',p_valid_until));
  RETURN jsonb_build_object('created',true,'replayed',false,'batch_id',v_batch.id,'quantity',v_count,'plaintext_recoverable',true);
END $function$;

CREATE OR REPLACE FUNCTION public.revoke_moviback_agreement_code(
    p_code_id uuid, p_reason text, p_actor_staff_id uuid
) RETURNS public.moviback_agreement_codes
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public AS $function$
DECLARE v_before public.moviback_agreement_codes%rowtype; v_after public.moviback_agreement_codes%rowtype;
BEGIN
  IF btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_CODE_REVOKE_REASON_REQUIRED'; END IF;
  SELECT * INTO v_before FROM public.moviback_agreement_codes WHERE id=p_code_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_CODE_NOT_FOUND'; END IF;
  IF v_before.status='revoked' THEN RETURN v_before; END IF;
  IF v_before.status NOT IN ('available','reserved') THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_CODE_REVOKE_INVALID_STATUS'; END IF;
  UPDATE public.moviback_agreement_codes SET status='revoked',revoked_at=transaction_timestamp() WHERE id=p_code_id RETURNING * INTO v_after;
  INSERT INTO public.moviback_agreement_audit_events(agreement_id,code_id,event_type,actor_staff_id,before_state,after_state,reason)
  VALUES(v_after.agreement_id,v_after.id,'code_revoked',p_actor_staff_id,to_jsonb(v_before)-'code_hash',to_jsonb(v_after)-'code_hash',btrim(p_reason));
  RETURN v_after;
END $function$;

CREATE OR REPLACE FUNCTION public.assign_moviback_agreement(
    p_membership_id uuid, p_agreement_id uuid, p_effective_from timestamptz, p_effective_until timestamptz, p_actor_staff_id uuid
) RETURNS public.moviback_agreement_entitlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public AS $function$
DECLARE v_membership public.loyalty_memberships%rowtype; v_agreement public.moviback_agreements%rowtype; v_row public.moviback_agreement_entitlements%rowtype; v_now timestamptz:=transaction_timestamp(); v_start timestamptz;
BEGIN
  IF p_actor_staff_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.staff_users WHERE id=p_actor_staff_id AND is_active) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_AGREEMENT_OPERATOR_INVALID'; END IF;
  SELECT * INTO v_membership FROM public.loyalty_memberships WHERE id=p_membership_id FOR UPDATE;
  IF NOT FOUND OR v_membership.status<>'approved' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_ASSIGN_MEMBERSHIP_NOT_APPROVED'; END IF;
  SELECT * INTO v_agreement FROM public.moviback_agreements WHERE id=p_agreement_id FOR SHARE;
  IF NOT FOUND OR v_agreement.status<>'active' OR v_now<v_agreement.valid_from OR (v_agreement.valid_until IS NOT NULL AND v_now>=v_agreement.valid_until) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_ASSIGN_AGREEMENT_NOT_ACTIVE'; END IF;
  v_start:=greatest(coalesce(p_effective_from,v_now),v_now);
  IF v_start<v_agreement.valid_from OR (v_agreement.valid_until IS NOT NULL AND v_start>=v_agreement.valid_until) OR (p_effective_until IS NOT NULL AND (p_effective_until<=v_start OR (v_agreement.valid_until IS NOT NULL AND p_effective_until>v_agreement.valid_until))) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_ASSIGN_VALIDITY_INVALID'; END IF;
  INSERT INTO public.moviback_agreement_entitlements(membership_id,agreement_id,code_id,status,activation_source,activated_at,effective_from,effective_until)
  VALUES(v_membership.id,v_agreement.id,NULL,CASE WHEN v_start>v_now THEN 'scheduled' ELSE 'active' END,'admin',v_now,v_start,p_effective_until)
  RETURNING * INTO v_row;
  INSERT INTO public.moviback_agreement_audit_events(agreement_id,entitlement_id,event_type,actor_staff_id,after_state)
  VALUES(v_agreement.id,v_row.id,'entitlement_assigned',p_actor_staff_id,to_jsonb(v_row));
  RETURN v_row;
END $function$;

CREATE OR REPLACE FUNCTION public.revoke_moviback_agreement_entitlement(
    p_entitlement_id uuid, p_reason text, p_actor_staff_id uuid
) RETURNS public.moviback_agreement_entitlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public AS $function$
DECLARE v_membership_id uuid; v_before public.moviback_agreement_entitlements%rowtype; v_after public.moviback_agreement_entitlements%rowtype;
BEGIN
  IF btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_ENTITLEMENT_REVOKE_REASON_REQUIRED'; END IF;
  SELECT membership_id INTO v_membership_id FROM public.moviback_agreement_entitlements WHERE id=p_entitlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_ENTITLEMENT_NOT_FOUND'; END IF;
  PERFORM 1 FROM public.loyalty_memberships WHERE id=v_membership_id FOR UPDATE;
  SELECT * INTO v_before FROM public.moviback_agreement_entitlements WHERE id=p_entitlement_id FOR UPDATE;
  IF v_before.status='revoked' THEN RETURN v_before; END IF;
  IF v_before.status NOT IN ('scheduled','active') THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='MOVIBACK_ENTITLEMENT_REVOKE_INVALID_STATUS'; END IF;
  UPDATE public.moviback_agreement_entitlements SET status='revoked',revoked_at=transaction_timestamp(),revoked_by=p_actor_staff_id,revocation_reason=btrim(p_reason),updated_at=transaction_timestamp() WHERE id=p_entitlement_id RETURNING * INTO v_after;
  INSERT INTO public.moviback_agreement_audit_events(agreement_id,entitlement_id,event_type,actor_staff_id,before_state,after_state,reason)
  VALUES(v_after.agreement_id,v_after.id,'entitlement_revoked',p_actor_staff_id,to_jsonb(v_before),to_jsonb(v_after),btrim(p_reason));
  RETURN v_after;
END $function$;

ALTER TABLE public.moviback_agreement_code_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moviback_agreement_code_batches FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.moviback_agreement_code_batches TO service_role;

REVOKE ALL ON FUNCTION public.create_moviback_agreement(text,text,text,numeric,timestamptz,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.update_moviback_agreement(uuid,text,text,text,numeric,timestamptz,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.generate_moviback_agreement_code_batch(uuid,uuid,jsonb,timestamptz,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.revoke_moviback_agreement_code(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.assign_moviback_agreement(uuid,uuid,timestamptz,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.revoke_moviback_agreement_entitlement(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_moviback_agreement(text,text,text,numeric,timestamptz,timestamptz,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_moviback_agreement(uuid,text,text,text,numeric,timestamptz,timestamptz,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_moviback_agreement_code_batch(uuid,uuid,jsonb,timestamptz,timestamptz,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_moviback_agreement_code(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_moviback_agreement(uuid,uuid,timestamptz,timestamptz,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_moviback_agreement_entitlement(uuid,text,uuid) TO service_role;

COMMENT ON TABLE public.moviback_agreement_code_batches IS 'C3 hash-only batch metadata. Plaintext codes are returned once by the server and never persisted.';
