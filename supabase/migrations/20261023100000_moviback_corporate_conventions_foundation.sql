-- MoviBack corporate conventions C1+C2.
-- Category-specific administration and public code activation are intentionally deferred.

CREATE TABLE public.moviback_agreements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL CHECK (btrim(name) <> ''),
    slug text NOT NULL UNIQUE CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended','expired','revoked')),
    multiplier numeric NOT NULL CHECK (multiplier > 0),
    valid_from timestamptz NOT NULL,
    valid_until timestamptz,
    created_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT moviback_agreements_validity_check CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE public.moviback_agreement_codes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    agreement_id uuid NOT NULL REFERENCES public.moviback_agreements(id),
    code_hash text NOT NULL UNIQUE CHECK (btrim(code_hash) <> ''),
    code_suffix text NOT NULL CHECK (code_suffix ~ '^[A-Za-z0-9]{2,12}$'),
    batch_id uuid,
    status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','claimed','used','revoked','expired')),
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz,
    claimed_at timestamptz,
    claimed_by_membership_id uuid REFERENCES public.loyalty_memberships(id),
    revoked_at timestamptz,
    created_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT moviback_agreement_codes_validity_check CHECK (valid_until IS NULL OR valid_until > valid_from),
    CONSTRAINT moviback_agreement_codes_claim_check CHECK (
        (claimed_at IS NULL) = (claimed_by_membership_id IS NULL)
        AND (status NOT IN ('claimed','used') OR claimed_at IS NOT NULL)
        AND (status NOT IN ('available','reserved') OR claimed_at IS NULL)
    ),
    CONSTRAINT moviback_agreement_codes_revoke_check CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
    UNIQUE (id, agreement_id)
);

CREATE TABLE public.moviback_agreement_entitlements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    membership_id uuid NOT NULL REFERENCES public.loyalty_memberships(id),
    agreement_id uuid NOT NULL REFERENCES public.moviback_agreements(id),
    code_id uuid,
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','revoked','expired')),
    activation_source text NOT NULL CHECK (activation_source IN ('code','admin','migration')),
    activated_at timestamptz,
    effective_from timestamptz NOT NULL,
    effective_until timestamptz,
    revoked_at timestamptz,
    revoked_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
    revocation_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT moviback_entitlements_code_agreement_fkey
        FOREIGN KEY (code_id, agreement_id)
        REFERENCES public.moviback_agreement_codes(id, agreement_id),
    CONSTRAINT moviback_entitlements_validity_check CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT moviback_entitlements_activation_check CHECK (
        (status = 'scheduled' AND activated_at IS NULL)
        OR (status IN ('active','revoked','expired') AND activated_at IS NOT NULL)
    ),
    CONSTRAINT moviback_entitlements_code_source_check CHECK (activation_source <> 'code' OR code_id IS NOT NULL),
    CONSTRAINT moviback_entitlements_revoke_check CHECK (
        status <> 'revoked'
        OR (revoked_at IS NOT NULL AND btrim(coalesce(revocation_reason,'')) <> '')
    )
);

CREATE UNIQUE INDEX moviback_entitlements_one_active_per_membership
    ON public.moviback_agreement_entitlements (membership_id)
    WHERE status = 'active' AND revoked_at IS NULL;

CREATE INDEX moviback_entitlements_effective_lookup
    ON public.moviback_agreement_entitlements (membership_id, status, effective_from, effective_until);

CREATE TABLE public.moviback_agreement_audit_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    agreement_id uuid REFERENCES public.moviback_agreements(id),
    code_id uuid REFERENCES public.moviback_agreement_codes(id),
    entitlement_id uuid REFERENCES public.moviback_agreement_entitlements(id),
    event_type text NOT NULL CHECK (btrim(event_type) <> ''),
    actor_staff_id uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
    actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    before_state jsonb,
    after_state jsonb,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT moviback_agreement_audit_actor_check CHECK (
        NOT (actor_staff_id IS NOT NULL AND actor_user_id IS NOT NULL)
    )
);

CREATE FUNCTION public.prevent_moviback_agreement_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public
AS $function$
BEGIN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_AGREEMENT_AUDIT_APPEND_ONLY';
END
$function$;

CREATE TRIGGER moviback_agreement_audit_append_only
    BEFORE UPDATE OR DELETE ON public.moviback_agreement_audit_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_moviback_agreement_audit_mutation();

ALTER TABLE public.loyalty_transactions
    ADD COLUMN base_points integer,
    ADD COLUMN applied_multiplier numeric,
    ADD COLUMN credited_points integer,
    ADD COLUMN agreement_id uuid REFERENCES public.moviback_agreements(id),
    ADD COLUMN entitlement_id uuid REFERENCES public.moviback_agreement_entitlements(id),
    ADD COLUMN incentive_source text,
    ADD COLUMN earning_rule_version text,
    ADD COLUMN source_event_type text,
    ADD COLUMN source_event_id text,
    ADD COLUMN idempotency_key uuid,
    ADD COLUMN metadata jsonb,
    ADD CONSTRAINT loyalty_transactions_structured_credit_check CHECK (
        earning_rule_version IS DISTINCT FROM 'moviback-credit-v1'
        OR (
            type = 'earn'
            AND source = 'club_payment'
            AND base_points >= 0
            AND credited_points >= 0
            AND applied_multiplier > 0
            AND points_delta = credited_points
            AND incentive_source IN ('none','promo','agreement')
            AND source_event_type IS NOT NULL
            AND btrim(source_event_type) <> ''
            AND source_event_id IS NOT NULL
            AND btrim(source_event_id) <> ''
            AND idempotency_key IS NOT NULL
            AND (incentive_source = 'agreement') = (agreement_id IS NOT NULL AND entitlement_id IS NOT NULL)
        )
    );

CREATE UNIQUE INDEX loyalty_transactions_moviback_credit_idempotency_unique
    ON public.loyalty_transactions (idempotency_key)
    WHERE earning_rule_version = 'moviback-credit-v1';

ALTER TABLE public.business_operation_idempotency
    DROP CONSTRAINT business_operation_idempotency_operation_check,
    ADD CONSTRAINT business_operation_idempotency_operation_check
        CHECK (operation = ANY (ARRAY[
            'store_checkout'::text,
            'moviback_redemption'::text,
            'moviback_redemption_processing'::text,
            'moviback_redemption_ready'::text,
            'moviback_redemption_delivery'::text,
            'moviback_redemption_cancel'::text,
            'moviback_redemption_reject'::text,
            'store_order_ready'::text,
            'store_order_delivery'::text,
            'store_order_cancel'::text,
            'moviback_credit'::text
        ]));

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

    v_event_at := transaction_timestamp();
    v_event_date := (v_event_at AT TIME ZONE 'Europe/Rome')::date;
    SELECT * INTO v_certificate
    FROM public.medical_certificates
    WHERE user_id=v_membership.user_id AND status='approved'
    ORDER BY uploaded_at DESC,id DESC LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_CERTIFICATE_MISSING';
    END IF;
    IF v_certificate.expiry_date IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_CERTIFICATE_EXPIRY_INVALID';
    END IF;
    v_expired_days := v_event_date - v_certificate.expiry_date;
    IF v_expired_days > 60 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MOVIBACK_CREDIT_CERTIFICATE_STANDBY';
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

-- Extend reviewed identity reconciliation without changing its surrounding workflow.
CREATE OR REPLACE FUNCTION public.execute_reviewed_user_merge(p_operation_id uuid,p_expected_fingerprint text,p_actor_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.user_merge_operations%rowtype; g public.user_duplicate_review_groups%rowtype;
  v_preview jsonb; movi jsonb; base jsonb; result jsonb; verification jsonb;
  s public.users%rowtype; c public.users%rowtype; sm public.loyalty_memberships%rowtype; cm public.loyalty_memberships%rowtype;
  winners jsonb; before_balance bigint; after_balance bigint; source_tx integer; source_redemptions integer; moved_entitlements integer:=0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-auth-stage4-scan',0));
  SELECT * INTO op FROM public.user_merge_operations WHERE id=p_operation_id FOR UPDATE;
  IF op.id IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_MERGE_OPERATION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF op.status='completed' THEN RETURN jsonb_build_object('state','completed','operation_id',op.id,'idempotent',true,'verification',op.metadata->'verification'); END IF;
  IF op.status<>'planned' THEN RETURN jsonb_build_object('state',op.status,'operation_id',op.id); END IF;
  SELECT * INTO g FROM public.user_duplicate_review_groups WHERE id=op.candidate_group_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-user:'||least(op.source_user_id::text,op.canonical_user_id::text),0));
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-user:'||greatest(op.source_user_id::text,op.canonical_user_id::text),0));
  SELECT * INTO s FROM public.users WHERE id=op.source_user_id FOR UPDATE;
  SELECT * INTO c FROM public.users WHERE id=op.canonical_user_id FOR UPDATE;
  v_preview:=public.preview_reviewed_user_merge(g.id,s.id,c.id);
  IF p_expected_fingerprint IS DISTINCT FROM op.expected_fingerprint OR p_expected_fingerprint IS DISTINCT FROM v_preview->>'fingerprint' THEN RETURN jsonb_build_object('state','stale_preview','code','STALE_PREVIEW','current_preview',v_preview); END IF;
  IF jsonb_array_length(v_preview->'blockers')>0 THEN RETURN jsonb_build_object('state','conflict','blockers',v_preview->'blockers'); END IF;
  BEGIN
    winners:=coalesce(g.review_config->'field_winners','{}'::jsonb);
    IF winners->>'phone'=s.id::text AND s.phone IS DISTINCT FROM c.phone THEN UPDATE public.users SET phone='merged-'||replace(s.id::text,'-',''),updated_at=now() WHERE id=s.id; END IF;
    UPDATE public.users SET full_name=CASE WHEN winners->>'full_name'=s.id::text THEN s.full_name ELSE c.full_name END,
      phone=CASE WHEN winners->>'phone'=s.id::text THEN s.phone ELSE c.phone END,email=CASE WHEN winners->>'email'=s.id::text THEN s.email ELSE c.email END,
      gender=CASE WHEN winners->>'gender'=s.id::text THEN s.gender ELSE c.gender END,updated_at=now() WHERE id=c.id;
    movi:=v_preview->'moviback';
    IF coalesce((movi->>'applicable')::boolean,false) THEN
      IF NOT coalesce((movi->>'safe')::boolean,false) THEN RAISE EXCEPTION 'MOVI_AUTH_MOVIBACK_RECONCILIATION_BLOCKED'; END IF;
      SELECT * INTO sm FROM public.loyalty_memberships WHERE id=(movi->'source_membership'->>'id')::uuid FOR UPDATE;
      SELECT * INTO cm FROM public.loyalty_memberships WHERE id=(movi->'canonical_membership'->>'id')::uuid FOR UPDATE;
      PERFORM 1 FROM public.moviback_agreement_entitlements WHERE membership_id IN(sm.id,cm.id) FOR UPDATE;
      IF EXISTS(SELECT 1 FROM public.moviback_agreement_entitlements WHERE membership_id=sm.id AND status='active' AND revoked_at IS NULL)
         AND EXISTS(SELECT 1 FROM public.moviback_agreement_entitlements WHERE membership_id=cm.id AND status='active' AND revoked_at IS NULL) THEN
        RAISE EXCEPTION 'MOVI_AUTH_MOVIBACK_ENTITLEMENT_CONFLICT';
      END IF;
      before_balance:=(movi->>'expected_balance')::bigint; source_tx:=(movi->'source_membership'->>'transactions')::integer; source_redemptions:=(movi->'source_membership'->>'redemptions')::integer;
      INSERT INTO public.user_moviback_reconciliation_evidence(operation_id,source_user_id,canonical_user_id,source_membership_id,canonical_membership_id,preview_fingerprint,source_membership_summary,canonical_membership_summary,ledger_summary)
      VALUES(op.id,s.id,c.id,sm.id,cm.id,movi->>'fingerprint',movi->'source_membership',movi->'canonical_membership',jsonb_build_object('expected_balance',before_balance,'source_transactions',source_tx,'source_redemptions',source_redemptions));
      UPDATE public.loyalty_transactions SET membership_id=cm.id WHERE membership_id=sm.id;
      UPDATE public.reward_redemptions SET membership_id=cm.id WHERE membership_id=sm.id;
      UPDATE public.loyalty_user_promos SET membership_id=cm.id,updated_at=now() WHERE membership_id=sm.id;
      UPDATE public.moviback_agreement_codes SET claimed_by_membership_id=cm.id WHERE claimed_by_membership_id=sm.id;
      WITH moved AS (
        UPDATE public.moviback_agreement_entitlements SET membership_id=cm.id,updated_at=clock_timestamp() WHERE membership_id=sm.id
        RETURNING id,agreement_id,code_id
      ), audited AS (
        INSERT INTO public.moviback_agreement_audit_events(agreement_id,code_id,entitlement_id,event_type,actor_staff_id,before_state,after_state,reason)
        SELECT agreement_id,code_id,id,'membership_reconciled',p_actor_staff_id,jsonb_build_object('membership_id',sm.id),jsonb_build_object('membership_id',cm.id),'Identity merge reconciliation' FROM moved RETURNING 1
      ) SELECT count(*) INTO moved_entitlements FROM audited;
      DELETE FROM public.loyalty_memberships WHERE id=sm.id;
      SELECT coalesce(sum(points_delta),0) INTO after_balance FROM public.loyalty_transactions WHERE membership_id=cm.id;
      IF after_balance<>before_balance OR (SELECT count(*) FROM public.reward_redemptions WHERE membership_id=cm.id)<source_redemptions THEN RAISE EXCEPTION 'MOVI_AUTH_MOVIBACK_RECONCILIATION_MISMATCH'; END IF;
      INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,domain,status,actor_staff_id,details)
      VALUES(op.id,s.id,c.id,'domain_step','moviback_reconciliation','completed',p_actor_staff_id,jsonb_build_object('ledger_balance_before',before_balance,'ledger_balance_after',after_balance,'source_membership_archived',true,'redemptions_moved',source_redemptions,'agreement_entitlements_moved',moved_entitlements));
    END IF;
    base:=public.preview_user_merge(s.id,c.id);
    IF jsonb_array_length(base->'conflicts')>0 THEN RAISE EXCEPTION 'MOVI_AUTH_POST_RECONCILIATION_CONFLICT: %',base->'conflicts'; END IF;
    UPDATE public.user_merge_operations SET expected_fingerprint=base->>'fingerprint',preview=base,metadata=metadata||jsonb_build_object('stage4_preview',v_preview) WHERE id=op.id;
    result:=public.execute_user_merge(op.id,base->>'fingerprint',p_actor_staff_id);
    IF result->>'state'<>'completed' THEN RAISE EXCEPTION 'MOVI_AUTH_STAGE3_EXECUTION_FAILED: %',result; END IF;
    verification:=public.verify_reviewed_user_merge(op.id);
    IF NOT (verification->>'passed')::boolean THEN RAISE EXCEPTION 'MOVI_AUTH_POST_MERGE_VERIFICATION_FAILED: %',verification; END IF;
    UPDATE public.user_merge_operations SET metadata=metadata||jsonb_build_object('verification',verification,'stage4',true) WHERE id=op.id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.user_merge_operations SET status='needs_review',error_metadata=jsonb_build_object('sqlstate',SQLSTATE,'message',SQLERRM,'stage',4) WHERE id=op.id;
    INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,status,actor_staff_id,details,error_metadata)
    VALUES(op.id,op.source_user_id,op.canonical_user_id,'failed','failed',p_actor_staff_id,jsonb_build_object('needs_review',true,'rolled_back',true),jsonb_build_object('sqlstate',SQLSTATE,'message',SQLERRM));
    RETURN jsonb_build_object('state','needs_review','operation_id',op.id);
  END;
  RETURN jsonb_build_object('state','completed','operation_id',op.id,'idempotent',false,'verification',verification,'domain_results',(SELECT coalesce(jsonb_agg(jsonb_build_object('domain',domain,'status',status,'details',details) ORDER BY id),'[]') FROM public.user_merge_journal WHERE operation_id=op.id AND event_type='domain_step'));
END $$;

ALTER TABLE public.moviback_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moviback_agreement_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moviback_agreement_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moviback_agreement_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.moviback_agreements,public.moviback_agreement_codes,public.moviback_agreement_entitlements,public.moviback_agreement_audit_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.credit_moviback_points(text,numeric,text,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.moviback_agreements,public.moviback_agreement_codes,public.moviback_agreement_entitlements TO service_role;
GRANT SELECT,INSERT ON TABLE public.moviback_agreement_audit_events TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_moviback_points(text,numeric,text,uuid,text,text,uuid) TO service_role;

COMMENT ON TABLE public.moviback_agreements IS 'Reusable MoviBack corporate agreements. Category-specific backgrounds and public activation are deferred.';
COMMENT ON COLUMN public.loyalty_transactions.earning_rule_version IS 'NULL for legacy rows; moviback-credit-v1 for centralized commercial earning.';
COMMENT ON FUNCTION public.credit_moviback_points(text,numeric,text,uuid,text,text,uuid) IS 'Authoritative transactional/idempotent earn/club_payment credit. Balance remains SUM(loyalty_transactions.points_delta).';
