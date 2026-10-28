BEGIN;

-- Legacy certificate compatibility is intentionally limited to memberships and
-- pending-review certificates that predate the immutable enforcement cutover.
-- No row is updated and no certificate is implicitly approved.
CREATE OR REPLACE FUNCTION public.credit_moviback_points(
    p_membership_code text,
    p_euro_amount numeric,
    p_club text,
    p_idempotency_key uuid,
    p_source_event_type text,
    p_source_event_id text,
    p_operator_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY DEFINER
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_membership public.loyalty_memberships%rowtype;
    v_membership_count integer;
    v_user public.users%rowtype;
    v_certificate public.medical_certificates%rowtype;
    v_certificate_enforcement_cutover constant timestamptz := '2026-10-28T15:13:45Z'::timestamptz;
    v_legacy_certificate_compatible boolean := false;
    v_event_at timestamptz;
    v_event_date date;
    v_expired_days integer;
    v_idempotency_id uuid;
    v_request_hash text;
    v_existing_hash text;
    v_existing_status text;
    v_existing_result jsonb;
    v_individual_promo public.loyalty_user_promos%rowtype;
    v_global_promo public.loyalty_global_promos%rowtype;
    v_promo_id uuid;
    v_promo_title text;
    v_promo_type text;
    v_promo_multiplier numeric := 1;
    v_agreement_id uuid;
    v_agreement_name text;
    v_entitlement_id uuid;
    v_agreement_multiplier numeric := 1;
    v_agreement_count integer := 0;
    v_membership_factor numeric := 1;
    v_effective_multiplier numeric := 1;
    v_incentive_source text := 'none';
    v_base_points integer;
    v_credited_points integer;
    v_transaction_id uuid;
    v_balance bigint;
    v_result jsonb;
    v_affected integer;
    v_local_time text;
    v_iso_day integer;
    v_tax_code text;
    v_birth_year integer;
    v_birth_month integer;
    v_birth_day integer;
    v_age integer;
    v_gender text;
BEGIN
    IF p_membership_code IS NULL OR btrim(p_membership_code) = ''
       OR p_euro_amount IS NULL OR p_euro_amount <= 0
       OR p_club IS NULL OR btrim(p_club) = ''
       OR p_idempotency_key IS NULL
       OR p_source_event_type IS NULL OR btrim(p_source_event_type) = ''
       OR p_source_event_id IS NULL OR btrim(p_source_event_id) = ''
       OR p_operator_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_MALFORMED_REQUEST';
    END IF;
    IF upper(btrim(p_club)) <> ALL(ARRAY['CENTALLO','COSTIGLIOLE','MANTA','SALUZZO','REVELLO']) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_CLUB_INVALID';
    END IF;
    IF NOT EXISTS(
        SELECT 1 FROM public.staff_users
        WHERE id=p_operator_id AND is_active=true AND role IN ('admin','staff')
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_OPERATOR_INVALID';
    END IF;

    SELECT * INTO v_membership
    FROM public.loyalty_memberships
    WHERE membership_code = btrim(p_membership_code)
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_MEMBERSHIP_NOT_FOUND';
    END IF;

    SELECT count(*) INTO v_membership_count
    FROM public.loyalty_memberships
    WHERE user_id = v_membership.user_id;
    IF v_membership_count <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_MEMBERSHIP_CARDINALITY';
    END IF;

    SELECT * INTO v_user FROM public.users WHERE id = v_membership.user_id FOR SHARE;
    IF NOT FOUND OR coalesce(v_user.identity_status, 'active') <> 'active' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_ACCOUNT_INACTIVE';
    END IF;
    IF v_membership.status <> 'approved' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_MEMBERSHIP_NOT_APPROVED';
    END IF;
    v_tax_code := upper(regexp_replace(coalesce(v_membership.tax_code,''), '\s+', '', 'g'));
    IF length(v_tax_code) < 11 OR length(v_tax_code) > 16 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_TAX_CODE_INVALID';
    END IF;

    -- Capture the authoritative credit instant only after the membership lock and approval validation.
    v_event_at := clock_timestamp();
    v_event_date := (v_event_at AT TIME ZONE 'Europe/Rome')::date;

    v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
        'v', 1,
        'membership_id', v_membership.id,
        'euro_amount', p_euro_amount,
        'club', upper(btrim(p_club)),
        'source_event_type', btrim(p_source_event_type),
        'source_event_id', btrim(p_source_event_id),
        'operator_id', p_operator_id
    )::text, 'UTF8'), 'sha256'), 'hex');

    INSERT INTO public.business_operation_idempotency(operation,user_id,idempotency_key,request_hash)
    VALUES ('moviback_credit',v_membership.user_id,p_idempotency_key,v_request_hash)
    ON CONFLICT (operation,user_id,idempotency_key) DO NOTHING
    RETURNING id INTO v_idempotency_id;

    IF v_idempotency_id IS NULL THEN
        SELECT request_hash,status,result
        INTO v_existing_hash,v_existing_status,v_existing_result
        FROM public.business_operation_idempotency
        WHERE operation='moviback_credit'
          AND user_id=v_membership.user_id
          AND idempotency_key=p_idempotency_key;
        IF NOT FOUND OR v_existing_status <> 'committed' OR v_existing_result IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_IDEMPOTENCY_INCOMPLETE';
        END IF;
        IF v_existing_hash <> v_request_hash THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_IDEMPOTENCY_CONFLICT';
        END IF;
        RETURN v_existing_result || jsonb_build_object('created',false,'replayed',true);
    END IF;

    SELECT * INTO v_certificate
    FROM public.medical_certificates
    WHERE user_id=v_membership.user_id AND status='approved'
    ORDER BY uploaded_at DESC,id DESC LIMIT 1;
    IF NOT FOUND THEN
        SELECT * INTO v_certificate
        FROM public.medical_certificates
        WHERE user_id=v_membership.user_id
        ORDER BY uploaded_at DESC,id DESC LIMIT 1;
        v_legacy_certificate_compatible := FOUND
          AND v_certificate.status='pending_review'
          AND v_certificate.uploaded_at < v_certificate_enforcement_cutover
          AND coalesce(v_membership.approved_at,v_membership.created_at) < v_certificate_enforcement_cutover;
        IF NOT v_legacy_certificate_compatible THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_CERTIFICATE_MISSING';
        END IF;
    ELSE
        IF v_certificate.expiry_date IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_CERTIFICATE_EXPIRY_INVALID';
        END IF;
        v_expired_days := v_event_date - v_certificate.expiry_date;
        IF v_expired_days > 60 THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_CERTIFICATE_STANDBY';
        END IF;
    END IF;

    SELECT * INTO v_individual_promo
    FROM public.loyalty_user_promos
    WHERE membership_id=v_membership.id AND is_active=true
      AND starts_at <= v_event_at AND ends_at >= v_event_at
    ORDER BY created_at DESC,id DESC LIMIT 1;

    IF FOUND THEN
        v_promo_id := v_individual_promo.id;
        v_promo_type := 'individual';
        v_promo_multiplier := coalesce(v_individual_promo.multiplier,1);
    ELSE
        v_local_time := to_char(v_event_at AT TIME ZONE 'Europe/Rome','HH24:MI');
        v_iso_day := extract(isodow FROM v_event_at AT TIME ZONE 'Europe/Rome')::integer;
        IF substring(v_tax_code FROM 7 FOR 2) ~ '^[0-9]{2}$'
           AND substring(v_tax_code FROM 9 FOR 1) ~ '^[ABCDEHLMPRST]$'
           AND substring(v_tax_code FROM 10 FOR 2) ~ '^[0-9]{2}$' THEN
            v_birth_year := substring(v_tax_code FROM 7 FOR 2)::integer;
            v_birth_year := CASE WHEN v_birth_year <= extract(year FROM v_event_date)::integer % 100 THEN 2000 ELSE 1900 END + v_birth_year;
            v_birth_month := position(substring(v_tax_code FROM 9 FOR 1) IN 'ABCDEHLMPRST');
            v_birth_day := substring(v_tax_code FROM 10 FOR 2)::integer;
            v_gender := CASE WHEN v_birth_day > 40 THEN 'F' ELSE 'M' END;
            IF v_birth_day > 40 THEN v_birth_day := v_birth_day - 40; END IF;
            IF v_birth_day BETWEEN 1 AND extract(day FROM (make_date(v_birth_year,v_birth_month,1) + interval '1 month - 1 day'))::integer THEN
                v_age := extract(year FROM age(v_event_date,make_date(v_birth_year,v_birth_month,v_birth_day)))::integer;
            END IF;
        END IF;

        SELECT * INTO v_global_promo
        FROM public.loyalty_global_promos gp
        WHERE gp.is_active=true AND gp.starts_at <= v_event_at AND gp.ends_at >= v_event_at
          AND CASE gp.schedule_type
            WHEN 'always' THEN true
            WHEN 'weekend' THEN v_iso_day IN (6,7)
            WHEN 'weekdays' THEN v_iso_day = ANY(coalesce(gp.days_of_week,'{}'::integer[]))
            WHEN 'time_window' THEN CASE
              WHEN to_char(gp.start_time,'HH24:MI') <= to_char(gp.end_time,'HH24:MI')
                THEN v_local_time BETWEEN to_char(gp.start_time,'HH24:MI') AND to_char(gp.end_time,'HH24:MI')
              ELSE v_local_time >= to_char(gp.start_time,'HH24:MI') OR v_local_time <= to_char(gp.end_time,'HH24:MI')
            END
            ELSE false END
          AND CASE gp.target_type
            WHEN 'all' THEN true
            WHEN 'new_members' THEN gp.new_member_days > 0 AND floor(extract(epoch FROM (v_event_at-v_membership.created_at))/86400) BETWEEN 0 AND gp.new_member_days
            WHEN 'birthday' THEN v_birth_month=extract(month FROM v_event_date)::integer AND v_birth_day=extract(day FROM v_event_date)::integer
            WHEN 'gender' THEN v_gender IS NOT NULL AND v_gender=gp.target_gender
            WHEN 'age_range' THEN v_age IS NOT NULL AND (gp.min_age IS NULL OR v_age>=gp.min_age) AND (gp.max_age IS NULL OR v_age<=gp.max_age)
            ELSE false END
        ORDER BY gp.created_at DESC,gp.id DESC LIMIT 1;
        IF FOUND THEN
            v_promo_id := v_global_promo.id;
            v_promo_title := v_global_promo.title;
            v_promo_type := 'global';
            v_promo_multiplier := coalesce(v_global_promo.multiplier,1);
        END IF;
    END IF;

    SELECT count(*) INTO v_agreement_count
    FROM public.moviback_agreement_entitlements e
    JOIN public.moviback_agreements a ON a.id=e.agreement_id
    WHERE e.membership_id=v_membership.id AND e.status='active'
      AND e.effective_from <= v_event_at AND (e.effective_until IS NULL OR v_event_at < e.effective_until)
      AND (e.revoked_at IS NULL OR v_event_at < e.revoked_at)
      AND a.status='active' AND a.valid_from <= v_event_at AND (a.valid_until IS NULL OR v_event_at < a.valid_until);
    IF v_agreement_count > 1 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_ENTITLEMENT_CARDINALITY';
    END IF;
    SELECT a.id,a.name,e.id,a.multiplier
    INTO v_agreement_id,v_agreement_name,v_entitlement_id,v_agreement_multiplier
    FROM public.moviback_agreement_entitlements e
    JOIN public.moviback_agreements a ON a.id=e.agreement_id
    WHERE e.membership_id=v_membership.id AND e.status='active'
      AND e.effective_from <= v_event_at AND (e.effective_until IS NULL OR v_event_at < e.effective_until)
      AND (e.revoked_at IS NULL OR v_event_at < e.revoked_at)
      AND a.status='active' AND a.valid_from <= v_event_at AND (a.valid_until IS NULL OR v_event_at < a.valid_until)
    ORDER BY e.effective_from DESC,e.id DESC LIMIT 1;
    IF NOT FOUND THEN v_agreement_multiplier := 1; END IF;

    v_effective_multiplier := greatest(1,v_promo_multiplier,v_agreement_multiplier);
    -- Deterministic tie rule: an applicable promo wins ties to preserve established promo identity.
    IF v_promo_id IS NOT NULL AND v_promo_multiplier = v_effective_multiplier THEN
        v_incentive_source := 'promo';
        v_agreement_id := NULL; v_agreement_name := NULL; v_entitlement_id := NULL;
    ELSIF v_agreement_id IS NOT NULL AND v_agreement_multiplier = v_effective_multiplier THEN
        v_incentive_source := 'agreement';
    ELSE
        v_incentive_source := 'none';
        v_agreement_id := NULL; v_agreement_name := NULL; v_entitlement_id := NULL;
    END IF;

    v_membership_factor := CASE WHEN v_membership.membership_type='FITP' THEN 1.2::numeric ELSE 1::numeric END;
    v_base_points := floor(p_euro_amount*v_membership_factor)::integer;
    v_credited_points := floor(v_base_points*v_effective_multiplier)::integer;
    IF v_credited_points <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_AMOUNT_TOO_LOW';
    END IF;

    INSERT INTO public.loyalty_transactions(
      membership_id,type,source,euro_amount,points_delta,created_by,club,notes,
      base_points,applied_multiplier,credited_points,agreement_id,entitlement_id,
      incentive_source,earning_rule_version,source_event_type,source_event_id,idempotency_key,metadata,created_at
    ) VALUES (
      v_membership.id,'earn','club_payment',p_euro_amount,v_credited_points,p_operator_id,upper(btrim(p_club)),
      'Accredito punti staff · regola moviback-credit-v1',v_base_points,v_effective_multiplier,v_credited_points,
      v_agreement_id,v_entitlement_id,v_incentive_source,'moviback-credit-v1',btrim(p_source_event_type),
      btrim(p_source_event_id),p_idempotency_key,
      jsonb_strip_nulls(jsonb_build_object('membership_type_factor',v_membership_factor,'promo_type',v_promo_type,
        'promo_id',v_promo_id,'promo_title',v_promo_title,'promo_multiplier',v_promo_multiplier,
        'agreement_name',v_agreement_name,'agreement_multiplier',v_agreement_multiplier)),v_event_at
    ) RETURNING id INTO v_transaction_id;

    SELECT coalesce(sum(points_delta),0) INTO v_balance
    FROM public.loyalty_transactions WHERE membership_id=v_membership.id;
    v_result := jsonb_build_object(
      'ok',true,'transaction_id',v_transaction_id,'membership_id',v_membership.id,
      'base_points',v_base_points,'membership_type_factor',v_membership_factor,
      'applied_multiplier',v_effective_multiplier,'credited_points',v_credited_points,
      'effective_incentive_source',v_incentive_source,'promo_id',v_promo_id,'promo_type',v_promo_type,
      'promo_title',v_promo_title,'promo_multiplier',v_promo_multiplier,'agreement_id',v_agreement_id,
      'agreement_name',v_agreement_name,'entitlement_id',v_entitlement_id,'resulting_balance',v_balance,
      'club',upper(btrim(p_club)),'event_at',v_event_at,'created',true,'replayed',false
    );
    UPDATE public.business_operation_idempotency
    SET status='committed',result=v_result,completed_at=clock_timestamp()
    WHERE id=v_idempotency_id AND status='processing' AND request_hash=v_request_hash;
    GET DIAGNOSTICS v_affected=ROW_COUNT;
    IF v_affected<>1 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_IDEMPOTENCY_INCOMPLETE';
    END IF;
    RETURN v_result;
END
$function$;

COMMENT ON FUNCTION public.credit_moviback_points(text,numeric,text,uuid,text,text,uuid) IS
  'Credits MoviBack points atomically using one post-membership-lock event instant and the frozen legacy certificate compatibility cutoff.';

COMMIT;
