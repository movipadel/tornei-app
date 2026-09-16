-- PF-08B2L: server-controlled, idempotent MoviBack lifecycle commands.
-- Application routes, QR integration, staff UI, and Telegram transport are deferred.

ALTER TABLE public.business_operation_idempotency
    DROP CONSTRAINT business_operation_idempotency_operation_check,
    ADD CONSTRAINT business_operation_idempotency_operation_check
        CHECK (
            operation = ANY (
                ARRAY[
                    'store_checkout'::text,
                    'moviback_redemption'::text,
                    'moviback_redemption_processing'::text,
                    'moviback_redemption_ready'::text,
                    'moviback_redemption_delivery'::text,
                    'moviback_redemption_cancel'::text,
                    'moviback_redemption_reject'::text
                ]
            )
        );

ALTER TABLE public.reward_redemptions
    ADD COLUMN terminal_reason text;

CREATE UNIQUE INDEX loyalty_transactions_redemption_refund_unique
    ON public.loyalty_transactions (related_redemption_id)
    WHERE type = 'refund'
      AND source = 'reward_redemption'
      AND related_redemption_id IS NOT NULL;

CREATE FUNCTION public.process_moviback_redemption(
    p_actor_id uuid,
    p_idempotency_key uuid,
    p_redemption_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY INVOKER
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_operation constant text := 'moviback_redemption_processing';
    v_redemption record;
    v_request_hash text;
    v_idempotency_id uuid;
    v_existing record;
    v_applied boolean := false;
    v_stored_result jsonb;
    v_affected integer;
BEGIN
    IF p_actor_id IS NULL OR p_idempotency_key IS NULL OR p_redemption_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_MALFORMED_REQUEST';
    END IF;

    SELECT r.*, m.user_id AS owner_user_id
    INTO v_redemption
    FROM public.reward_redemptions r
    JOIN public.loyalty_memberships m ON m.id = r.membership_id
    WHERE r.id = p_redemption_id
    FOR UPDATE OF r;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_REDEMPTION';
    END IF;

    v_request_hash := encode(
        extensions.digest(
            convert_to(jsonb_build_object('v',1,'operation',v_operation,'redemption_id',p_redemption_id)::text,'UTF8'),
            'sha256'
        ),
        'hex'
    );

    INSERT INTO public.business_operation_idempotency(operation,user_id,idempotency_key,request_hash)
    VALUES (v_operation,v_redemption.owner_user_id,p_idempotency_key,v_request_hash)
    ON CONFLICT (operation,user_id,idempotency_key) DO NOTHING
    RETURNING id INTO v_idempotency_id;

    IF v_idempotency_id IS NULL THEN
        SELECT request_hash,status,result INTO v_existing
        FROM public.business_operation_idempotency
        WHERE operation=v_operation
          AND user_id=v_redemption.owner_user_id
          AND idempotency_key=p_idempotency_key;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        IF v_existing.request_hash <> v_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_CONFLICT';
        END IF;
        IF v_existing.status <> 'committed' OR v_existing.result IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        RETURN v_existing.result || jsonb_build_object(
            'created',false,'replayed',true,'should_notify_staff',false,'notification',NULL
        );
    END IF;

    IF v_redemption.status = 'processing' THEN
        v_applied := false;
    ELSIF v_redemption.status = 'requested' AND v_redemption.fulfillment_type IS DISTINCT FROM 'service' THEN
        UPDATE public.reward_redemptions
        SET status='processing',
            processing_at=coalesce(processing_at,now()),
            handled_by=p_actor_id
        WHERE id=p_redemption_id;
        v_applied := true;
    ELSE
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_REDEMPTION_TRANSITION';
    END IF;

    v_stored_result := jsonb_build_object(
        'ok',true,
        'data',jsonb_build_object(
            'id',p_redemption_id,
            'status','processing',
            'fulfillment_type',v_redemption.fulfillment_type,
            'qr_deliverable',false,
            'applied',v_applied
        )
    );

    UPDATE public.business_operation_idempotency
    SET status='committed',result=v_stored_result,completed_at=now()
    WHERE id=v_idempotency_id AND status='processing' AND request_hash=v_request_hash;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
    END IF;

    RETURN v_stored_result || jsonb_build_object(
        'created',true,'replayed',false,'should_notify_staff',false,'notification',NULL
    );
END;
$function$;

CREATE FUNCTION public.cancel_moviback_redemption(
    p_actor_id uuid,
    p_idempotency_key uuid,
    p_redemption_id uuid,
    p_reason text
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY INVOKER
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_operation constant text := 'moviback_redemption_cancel';
    v_reason text;
    v_redemption record;
    v_order record;
    v_membership record;
    v_request_hash text;
    v_idempotency_id uuid;
    v_existing record;
    v_debit_count integer;
    v_reward_stock_qty integer;
    v_store_stock_qty integer;
    v_applied boolean := false;
    v_stored_result jsonb;
    v_affected integer;
BEGIN
    v_reason := nullif(btrim(coalesce(p_reason,'')),'');
    IF p_actor_id IS NULL OR p_idempotency_key IS NULL OR p_redemption_id IS NULL OR v_reason IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_MALFORMED_REQUEST';
    END IF;

    SELECT r.*, m.user_id AS owner_user_id
    INTO v_redemption
    FROM public.reward_redemptions r
    JOIN public.loyalty_memberships m ON m.id = r.membership_id
    WHERE r.id = p_redemption_id
    FOR UPDATE OF r;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_REDEMPTION';
    END IF;

    v_request_hash := encode(
        extensions.digest(
            convert_to(jsonb_build_object('v',1,'operation',v_operation,'redemption_id',p_redemption_id,'reason',v_reason)::text,'UTF8'),
            'sha256'
        ),
        'hex'
    );

    INSERT INTO public.business_operation_idempotency(operation,user_id,idempotency_key,request_hash)
    VALUES (v_operation,v_redemption.owner_user_id,p_idempotency_key,v_request_hash)
    ON CONFLICT (operation,user_id,idempotency_key) DO NOTHING
    RETURNING id INTO v_idempotency_id;

    IF v_idempotency_id IS NULL THEN
        SELECT request_hash,status,result INTO v_existing
        FROM public.business_operation_idempotency
        WHERE operation=v_operation
          AND user_id=v_redemption.owner_user_id
          AND idempotency_key=p_idempotency_key;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        IF v_existing.request_hash <> v_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_CONFLICT';
        END IF;
        IF v_existing.status <> 'committed' OR v_existing.result IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        RETURN v_existing.result || jsonb_build_object(
            'created',false,'replayed',true,'should_notify_staff',false,'notification',NULL
        );
    END IF;

    IF v_redemption.status = 'cancelled' THEN
        v_applied := false;
    ELSIF v_redemption.status IN ('requested','processing','ready') THEN
        IF v_redemption.fulfillment_type IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_LEGACY_REVERSAL_REQUIRES_ADMIN';
        END IF;
        IF v_redemption.points_refunded_at IS NOT NULL OR v_redemption.reservations_released_at IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_REVERSAL_STATE_CONFLICT';
        END IF;

        SELECT id,status INTO v_order
        FROM public.store_orders
        WHERE related_redemption_id=p_redemption_id
          AND order_type='reward_redemption'
        FOR UPDATE;

        IF v_redemption.fulfillment_type IN ('store_product','custom_physical') AND NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_REQUIRED';
        END IF;

        IF v_order.id IS NOT NULL THEN
            IF v_order.status IN ('confirmed','ordered_to_supplier','ready') THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_SUPPLIER_COMMITMENT_REQUIRES_ADMIN';
            END IF;
            IF v_order.status <> 'pending' THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_STATE_CONFLICT';
            END IF;
        END IF;

        SELECT id INTO v_membership
        FROM public.loyalty_memberships
        WHERE id=v_redemption.membership_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_MEMBERSHIP';
        END IF;

        SELECT count(*) INTO v_debit_count
        FROM public.loyalty_transactions
        WHERE related_redemption_id=p_redemption_id
          AND membership_id=v_redemption.membership_id
          AND type='redeem'
          AND source='reward_redemption'
          AND points_delta=-v_redemption.points_cost;
        IF v_debit_count <> 1 THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_LEDGER_INVARIANT';
        END IF;

        IF v_redemption.reward_stock_reserved_qty = 1 THEN
            SELECT stock_qty INTO v_reward_stock_qty
            FROM public.rewards_catalog
            WHERE id=v_redemption.reward_id
            FOR UPDATE;
            IF NOT FOUND OR v_reward_stock_qty IS NULL THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
            END IF;
        END IF;

        IF v_redemption.store_stock_reserved_qty = 1 THEN
            SELECT stock_qty INTO v_store_stock_qty
            FROM public.store_product_stock
            WHERE id=v_redemption.reserved_store_stock_id
            FOR UPDATE;
            IF NOT FOUND OR v_store_stock_qty IS NULL THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
            END IF;
        END IF;

        INSERT INTO public.loyalty_transactions(
            membership_id,type,source,euro_amount,points_delta,created_by,notes,related_redemption_id
        ) VALUES (
            v_redemption.membership_id,'refund','reward_redemption',NULL,v_redemption.points_cost,
            p_actor_id,'Rimborso annullamento premio: ' || v_reason,p_redemption_id
        );

        IF v_redemption.reward_stock_reserved_qty = 1 THEN
            UPDATE public.rewards_catalog
            SET stock_qty=stock_qty+v_redemption.reward_stock_reserved_qty,
                updated_at=now()
            WHERE id=v_redemption.reward_id AND stock_qty IS NOT NULL;
            GET DIAGNOSTICS v_affected = ROW_COUNT;
            IF v_affected <> 1 THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
            END IF;
        END IF;

        IF v_redemption.store_stock_reserved_qty = 1 THEN
            UPDATE public.store_product_stock
            SET stock_qty=stock_qty+v_redemption.store_stock_reserved_qty,
                updated_at=now()
            WHERE id=v_redemption.reserved_store_stock_id AND stock_qty IS NOT NULL;
            GET DIAGNOSTICS v_affected = ROW_COUNT;
            IF v_affected <> 1 THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
            END IF;
        END IF;

        IF v_order.id IS NOT NULL THEN
            UPDATE public.store_orders
            SET status='cancelled',
                cancelled_at=coalesce(cancelled_at,now()),
                updated_at=now()
            WHERE id=v_order.id;
        END IF;

        UPDATE public.reward_redemptions
        SET status='cancelled',
            cancelled_at=coalesce(cancelled_at,now()),
            handled_by=p_actor_id,
            terminal_reason=v_reason,
            points_refunded_at=now(),
            reservations_released_at=now()
        WHERE id=p_redemption_id;
        v_applied := true;
    ELSE
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_REDEMPTION_TRANSITION';
    END IF;

    v_stored_result := jsonb_build_object(
        'ok',true,
        'data',jsonb_build_object(
            'id',p_redemption_id,
            'status','cancelled',
            'fulfillment_type',v_redemption.fulfillment_type,
            'qr_deliverable',false,
            'refunded_points',CASE WHEN v_applied THEN v_redemption.points_cost ELSE 0 END,
            'reservations_released',v_applied,
            'applied',v_applied
        )
    );

    UPDATE public.business_operation_idempotency
    SET status='committed',result=v_stored_result,completed_at=now()
    WHERE id=v_idempotency_id AND status='processing' AND request_hash=v_request_hash;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
    END IF;

    RETURN v_stored_result || jsonb_build_object(
        'created',true,'replayed',false,'should_notify_staff',false,'notification',NULL
    );
END;
$function$;

CREATE FUNCTION public.reject_moviback_redemption(
    p_actor_id uuid,
    p_idempotency_key uuid,
    p_redemption_id uuid,
    p_reason text
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY INVOKER
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_operation constant text := 'moviback_redemption_reject';
    v_reason text;
    v_redemption record;
    v_order record;
    v_membership record;
    v_request_hash text;
    v_idempotency_id uuid;
    v_existing record;
    v_debit_count integer;
    v_reward_stock_qty integer;
    v_store_stock_qty integer;
    v_applied boolean := false;
    v_stored_result jsonb;
    v_affected integer;
BEGIN
    v_reason := nullif(btrim(coalesce(p_reason,'')),'');
    IF p_actor_id IS NULL OR p_idempotency_key IS NULL OR p_redemption_id IS NULL OR v_reason IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_MALFORMED_REQUEST';
    END IF;

    SELECT r.*, m.user_id AS owner_user_id
    INTO v_redemption
    FROM public.reward_redemptions r
    JOIN public.loyalty_memberships m ON m.id = r.membership_id
    WHERE r.id = p_redemption_id
    FOR UPDATE OF r;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_REDEMPTION';
    END IF;

    v_request_hash := encode(
        extensions.digest(
            convert_to(jsonb_build_object('v',1,'operation',v_operation,'redemption_id',p_redemption_id,'reason',v_reason)::text,'UTF8'),
            'sha256'
        ),
        'hex'
    );

    INSERT INTO public.business_operation_idempotency(operation,user_id,idempotency_key,request_hash)
    VALUES (v_operation,v_redemption.owner_user_id,p_idempotency_key,v_request_hash)
    ON CONFLICT (operation,user_id,idempotency_key) DO NOTHING
    RETURNING id INTO v_idempotency_id;

    IF v_idempotency_id IS NULL THEN
        SELECT request_hash,status,result INTO v_existing
        FROM public.business_operation_idempotency
        WHERE operation=v_operation
          AND user_id=v_redemption.owner_user_id
          AND idempotency_key=p_idempotency_key;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        IF v_existing.request_hash <> v_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_CONFLICT';
        END IF;
        IF v_existing.status <> 'committed' OR v_existing.result IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        RETURN v_existing.result || jsonb_build_object(
            'created',false,'replayed',true,'should_notify_staff',false,'notification',NULL
        );
    END IF;

    IF v_redemption.status = 'rejected' THEN
        v_applied := false;
    ELSIF v_redemption.status IN ('requested','processing','ready') THEN
        IF v_redemption.fulfillment_type IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_LEGACY_REVERSAL_REQUIRES_ADMIN';
        END IF;
        IF v_redemption.points_refunded_at IS NOT NULL OR v_redemption.reservations_released_at IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_REVERSAL_STATE_CONFLICT';
        END IF;

        SELECT id,status INTO v_order
        FROM public.store_orders
        WHERE related_redemption_id=p_redemption_id
          AND order_type='reward_redemption'
        FOR UPDATE;

        IF v_redemption.fulfillment_type IN ('store_product','custom_physical') AND NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_REQUIRED';
        END IF;

        IF v_order.id IS NOT NULL THEN
            IF v_order.status IN ('confirmed','ordered_to_supplier','ready') THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_SUPPLIER_COMMITMENT_REQUIRES_ADMIN';
            END IF;
            IF v_order.status <> 'pending' THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_STATE_CONFLICT';
            END IF;
        END IF;

        SELECT id INTO v_membership
        FROM public.loyalty_memberships
        WHERE id=v_redemption.membership_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_MEMBERSHIP';
        END IF;

        SELECT count(*) INTO v_debit_count
        FROM public.loyalty_transactions
        WHERE related_redemption_id=p_redemption_id
          AND membership_id=v_redemption.membership_id
          AND type='redeem'
          AND source='reward_redemption'
          AND points_delta=-v_redemption.points_cost;
        IF v_debit_count <> 1 THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_LEDGER_INVARIANT';
        END IF;

        IF v_redemption.reward_stock_reserved_qty = 1 THEN
            SELECT stock_qty INTO v_reward_stock_qty
            FROM public.rewards_catalog
            WHERE id=v_redemption.reward_id
            FOR UPDATE;
            IF NOT FOUND OR v_reward_stock_qty IS NULL THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
            END IF;
        END IF;

        IF v_redemption.store_stock_reserved_qty = 1 THEN
            SELECT stock_qty INTO v_store_stock_qty
            FROM public.store_product_stock
            WHERE id=v_redemption.reserved_store_stock_id
            FOR UPDATE;
            IF NOT FOUND OR v_store_stock_qty IS NULL THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
            END IF;
        END IF;

        INSERT INTO public.loyalty_transactions(
            membership_id,type,source,euro_amount,points_delta,created_by,notes,related_redemption_id
        ) VALUES (
            v_redemption.membership_id,'refund','reward_redemption',NULL,v_redemption.points_cost,
            p_actor_id,'Rimborso rifiuto premio: ' || v_reason,p_redemption_id
        );

        IF v_redemption.reward_stock_reserved_qty = 1 THEN
            UPDATE public.rewards_catalog
            SET stock_qty=stock_qty+v_redemption.reward_stock_reserved_qty,
                updated_at=now()
            WHERE id=v_redemption.reward_id AND stock_qty IS NOT NULL;
            GET DIAGNOSTICS v_affected = ROW_COUNT;
            IF v_affected <> 1 THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
            END IF;
        END IF;

        IF v_redemption.store_stock_reserved_qty = 1 THEN
            UPDATE public.store_product_stock
            SET stock_qty=stock_qty+v_redemption.store_stock_reserved_qty,
                updated_at=now()
            WHERE id=v_redemption.reserved_store_stock_id AND stock_qty IS NOT NULL;
            GET DIAGNOSTICS v_affected = ROW_COUNT;
            IF v_affected <> 1 THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
            END IF;
        END IF;

        IF v_order.id IS NOT NULL THEN
            UPDATE public.store_orders
            SET status='cancelled',
                cancelled_at=coalesce(cancelled_at,now()),
                updated_at=now()
            WHERE id=v_order.id;
        END IF;

        UPDATE public.reward_redemptions
        SET status='rejected',
            rejected_at=coalesce(rejected_at,now()),
            handled_by=p_actor_id,
            terminal_reason=v_reason,
            points_refunded_at=now(),
            reservations_released_at=now()
        WHERE id=p_redemption_id;
        v_applied := true;
    ELSE
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_REDEMPTION_TRANSITION';
    END IF;

    v_stored_result := jsonb_build_object(
        'ok',true,
        'data',jsonb_build_object(
            'id',p_redemption_id,
            'status','rejected',
            'fulfillment_type',v_redemption.fulfillment_type,
            'qr_deliverable',false,
            'refunded_points',CASE WHEN v_applied THEN v_redemption.points_cost ELSE 0 END,
            'reservations_released',v_applied,
            'applied',v_applied
        )
    );

    UPDATE public.business_operation_idempotency
    SET status='committed',result=v_stored_result,completed_at=now()
    WHERE id=v_idempotency_id AND status='processing' AND request_hash=v_request_hash;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
    END IF;

    RETURN v_stored_result || jsonb_build_object(
        'created',true,'replayed',false,'should_notify_staff',false,'notification',NULL
    );
END;
$function$;

CREATE FUNCTION public.ready_moviback_redemption(
    p_actor_id uuid,
    p_idempotency_key uuid,
    p_redemption_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY INVOKER
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_operation constant text := 'moviback_redemption_ready';
    v_redemption record;
    v_order record;
    v_request_hash text;
    v_idempotency_id uuid;
    v_existing record;
    v_applied boolean := false;
    v_stored_result jsonb;
    v_affected integer;
BEGIN
    IF p_actor_id IS NULL OR p_idempotency_key IS NULL OR p_redemption_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_MALFORMED_REQUEST';
    END IF;

    SELECT r.*, m.user_id AS owner_user_id
    INTO v_redemption
    FROM public.reward_redemptions r
    JOIN public.loyalty_memberships m ON m.id = r.membership_id
    WHERE r.id = p_redemption_id
    FOR UPDATE OF r;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_REDEMPTION';
    END IF;

    v_request_hash := encode(
        extensions.digest(
            convert_to(jsonb_build_object('v',1,'operation',v_operation,'redemption_id',p_redemption_id)::text,'UTF8'),
            'sha256'
        ),
        'hex'
    );

    INSERT INTO public.business_operation_idempotency(operation,user_id,idempotency_key,request_hash)
    VALUES (v_operation,v_redemption.owner_user_id,p_idempotency_key,v_request_hash)
    ON CONFLICT (operation,user_id,idempotency_key) DO NOTHING
    RETURNING id INTO v_idempotency_id;

    IF v_idempotency_id IS NULL THEN
        SELECT request_hash,status,result INTO v_existing
        FROM public.business_operation_idempotency
        WHERE operation=v_operation
          AND user_id=v_redemption.owner_user_id
          AND idempotency_key=p_idempotency_key;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        IF v_existing.request_hash <> v_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_CONFLICT';
        END IF;
        IF v_existing.status <> 'committed' OR v_existing.result IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        RETURN v_existing.result || jsonb_build_object(
            'created',false,'replayed',true,'should_notify_staff',false,'notification',NULL
        );
    END IF;

    IF v_redemption.status = 'ready' THEN
        v_applied := false;
    ELSIF v_redemption.status = 'processing' THEN
        IF v_redemption.fulfillment_type IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_LEGACY_FULFILLMENT_REQUIRES_ADMIN';
        END IF;

        IF v_redemption.fulfillment_type IN ('store_product','custom_physical') THEN
            SELECT id,status INTO v_order
            FROM public.store_orders
            WHERE related_redemption_id=p_redemption_id
              AND order_type='reward_redemption'
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_REQUIRED';
            END IF;
            IF v_order.status NOT IN ('pending','confirmed','ordered_to_supplier','ready') THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_STATE_CONFLICT';
            END IF;

            UPDATE public.store_orders
            SET status='ready',
                ready_at=coalesce(ready_at,now()),
                updated_at=now()
            WHERE id=v_order.id;
        END IF;

        UPDATE public.reward_redemptions
        SET status='ready',
            ready_at=coalesce(ready_at,now()),
            handled_by=p_actor_id
        WHERE id=p_redemption_id;
        v_applied := true;
    ELSE
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_REDEMPTION_TRANSITION';
    END IF;

    v_stored_result := jsonb_build_object(
        'ok',true,
        'data',jsonb_build_object(
            'id',p_redemption_id,
            'status','ready',
            'fulfillment_type',v_redemption.fulfillment_type,
            'qr_deliverable',true,
            'applied',v_applied
        )
    );

    UPDATE public.business_operation_idempotency
    SET status='committed',result=v_stored_result,completed_at=now()
    WHERE id=v_idempotency_id AND status='processing' AND request_hash=v_request_hash;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
    END IF;

    RETURN v_stored_result || jsonb_build_object(
        'created',true,'replayed',false,'should_notify_staff',false,'notification',NULL
    );
END;
$function$;

CREATE FUNCTION public.deliver_moviback_redemption(
    p_actor_id uuid,
    p_idempotency_key uuid,
    p_redemption_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY INVOKER
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_operation constant text := 'moviback_redemption_delivery';
    v_redemption record;
    v_order record;
    v_request_hash text;
    v_idempotency_id uuid;
    v_existing record;
    v_applied boolean := false;
    v_stored_result jsonb;
    v_affected integer;
BEGIN
    IF p_actor_id IS NULL OR p_idempotency_key IS NULL OR p_redemption_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_MALFORMED_REQUEST';
    END IF;

    SELECT r.*, m.user_id AS owner_user_id
    INTO v_redemption
    FROM public.reward_redemptions r
    JOIN public.loyalty_memberships m ON m.id = r.membership_id
    WHERE r.id = p_redemption_id
    FOR UPDATE OF r;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_REDEMPTION';
    END IF;

    v_request_hash := encode(
        extensions.digest(
            convert_to(jsonb_build_object('v',1,'operation',v_operation,'redemption_id',p_redemption_id)::text,'UTF8'),
            'sha256'
        ),
        'hex'
    );

    INSERT INTO public.business_operation_idempotency(operation,user_id,idempotency_key,request_hash)
    VALUES (v_operation,v_redemption.owner_user_id,p_idempotency_key,v_request_hash)
    ON CONFLICT (operation,user_id,idempotency_key) DO NOTHING
    RETURNING id INTO v_idempotency_id;

    IF v_idempotency_id IS NULL THEN
        SELECT request_hash,status,result INTO v_existing
        FROM public.business_operation_idempotency
        WHERE operation=v_operation
          AND user_id=v_redemption.owner_user_id
          AND idempotency_key=p_idempotency_key;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        IF v_existing.request_hash <> v_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_CONFLICT';
        END IF;
        IF v_existing.status <> 'committed' OR v_existing.result IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        RETURN v_existing.result || jsonb_build_object(
            'created',false,'replayed',true,'should_notify_staff',false,'notification',NULL
        );
    END IF;

    IF v_redemption.status = 'delivered' THEN
        v_applied := false;
    ELSIF v_redemption.status = 'ready' THEN
        IF v_redemption.fulfillment_type IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_LEGACY_FULFILLMENT_REQUIRES_ADMIN';
        END IF;

        IF v_redemption.fulfillment_type IN ('store_product','custom_physical') THEN
            SELECT id,status INTO v_order
            FROM public.store_orders
            WHERE related_redemption_id=p_redemption_id
              AND order_type='reward_redemption'
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_REQUIRED';
            END IF;
            IF v_order.status <> 'ready' THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_STATE_CONFLICT';
            END IF;

            UPDATE public.store_orders
            SET status='delivered',
                delivered_at=coalesce(delivered_at,now()),
                updated_at=now()
            WHERE id=v_order.id;
        END IF;

        UPDATE public.reward_redemptions
        SET status='delivered',
            delivered_at=coalesce(delivered_at,now()),
            handled_by=p_actor_id
        WHERE id=p_redemption_id;
        v_applied := true;
    ELSE
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_REDEMPTION_TRANSITION';
    END IF;

    v_stored_result := jsonb_build_object(
        'ok',true,
        'data',jsonb_build_object(
            'id',p_redemption_id,
            'status','delivered',
            'fulfillment_type',v_redemption.fulfillment_type,
            'qr_deliverable',false,
            'applied',v_applied
        )
    );

    UPDATE public.business_operation_idempotency
    SET status='committed',result=v_stored_result,completed_at=now()
    WHERE id=v_idempotency_id AND status='processing' AND request_hash=v_request_hash;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
    END IF;

    RETURN v_stored_result || jsonb_build_object(
        'created',true,'replayed',false,'should_notify_staff',false,'notification',NULL
    );
END;
$function$;

ALTER FUNCTION public.process_moviback_redemption(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.ready_moviback_redemption(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.deliver_moviback_redemption(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.cancel_moviback_redemption(uuid,uuid,uuid,text) OWNER TO postgres;
ALTER FUNCTION public.reject_moviback_redemption(uuid,uuid,uuid,text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.process_moviback_redemption(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ready_moviback_redemption(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deliver_moviback_redemption(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_moviback_redemption(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_moviback_redemption(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_moviback_redemption(uuid,uuid,uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.ready_moviback_redemption(uuid,uuid,uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.deliver_moviback_redemption(uuid,uuid,uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_moviback_redemption(uuid,uuid,uuid,text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.reject_moviback_redemption(uuid,uuid,uuid,text) TO postgres, service_role;
