-- Phase 2C: one guarded whole-order cancellation contract for Store and
-- physical MoviBack fulfillment, with an explicit stock decision.

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
            'store_order_cancel'::text
        ]));

ALTER TABLE public.store_orders
    ADD COLUMN cancellation_reintegrate_stock boolean,
    ADD COLUMN cancellation_stock_restored_at timestamp with time zone,
    ADD COLUMN cancellation_decided_at timestamp with time zone,
    ADD COLUMN cancellation_reason text,
    ADD COLUMN cancelled_by uuid,
    ADD CONSTRAINT store_orders_cancellation_stock_state_check CHECK (
        cancellation_stock_restored_at IS NULL
        OR cancellation_reintegrate_stock IS TRUE
    );

CREATE OR REPLACE FUNCTION public.cancel_physical_store_order(
    p_actor_id uuid,
    p_idempotency_key uuid,
    p_order_id uuid,
    p_reason text,
    p_reintegrate_stock boolean
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_operation constant text := 'store_order_cancel';
    v_reason text;
    v_order record;
    v_redemption record;
    v_membership record;
    v_item record;
    v_stock record;
    v_item_count integer;
    v_linked_order_count integer;
    v_stock_match_count integer;
    v_product_stock_count integer;
    v_stock_id uuid;
    v_stock_qty integer;
    v_debit_count integer;
    v_reward_stock_qty integer;
    v_request_hash text;
    v_idempotency_id uuid;
    v_existing record;
    v_source text;
    v_result_redemption_id uuid;
    v_refunded_points integer := 0;
    v_store_units_restored integer := 0;
    v_reward_units_restored integer := 0;
    v_applied boolean := false;
    v_stored_result jsonb;
    v_affected integer;
BEGIN
    v_reason := nullif(btrim(coalesce(p_reason,'')), '');
    IF p_actor_id IS NULL
       OR p_idempotency_key IS NULL
       OR p_order_id IS NULL
       OR v_reason IS NULL
       OR p_reintegrate_stock IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_MALFORMED_REQUEST';
    END IF;

    SELECT * INTO v_order
    FROM public.store_orders
    WHERE id=p_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_STORE_ORDER';
    END IF;

    IF v_order.order_type='catalog'
       AND v_order.related_redemption_id IS NULL
       AND v_order.user_id IS NOT NULL THEN
        v_source := 'STORE';
    ELSIF v_order.order_type='reward_redemption'
          AND v_order.related_redemption_id IS NOT NULL
          AND v_order.user_id IS NOT NULL THEN
        v_source := 'MOVIBACK';
    ELSE
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_STORE_ORDER_ORIGIN_CONFLICT';
    END IF;

    IF v_source='MOVIBACK' THEN
        SELECT r.*, m.user_id AS owner_user_id
        INTO v_redemption
        FROM public.reward_redemptions r
        JOIN public.loyalty_memberships m ON m.id=r.membership_id
        WHERE r.id=v_order.related_redemption_id
        FOR UPDATE OF r;
        IF NOT FOUND OR v_redemption.owner_user_id IS DISTINCT FROM v_order.user_id THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_LINK_CONFLICT';
        END IF;
        v_result_redemption_id := v_redemption.id;
        IF v_redemption.fulfillment_type NOT IN ('store_product','custom_physical') THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_PHYSICAL_FULFILLMENT_REQUIRED';
        END IF;
        SELECT count(*) INTO v_linked_order_count
        FROM public.store_orders
        WHERE related_redemption_id=v_redemption.id
          AND order_type='reward_redemption';
        IF v_linked_order_count <> 1 THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_LINK_CONFLICT';
        END IF;
    END IF;

    v_request_hash := encode(
        extensions.digest(
            convert_to(jsonb_build_object(
                'v',1,
                'operation',v_operation,
                'order_id',p_order_id,
                'reason',v_reason,
                'reintegrate_stock',p_reintegrate_stock
            )::text,'UTF8'),
            'sha256'
        ),
        'hex'
    );

    INSERT INTO public.business_operation_idempotency(
        operation,user_id,idempotency_key,request_hash
    ) VALUES (
        v_operation,v_order.user_id,p_idempotency_key,v_request_hash
    )
    ON CONFLICT (operation,user_id,idempotency_key) DO NOTHING
    RETURNING id INTO v_idempotency_id;

    IF v_idempotency_id IS NULL THEN
        SELECT request_hash,status,result INTO v_existing
        FROM public.business_operation_idempotency
        WHERE operation=v_operation
          AND user_id=v_order.user_id
          AND idempotency_key=p_idempotency_key;
        IF NOT FOUND OR v_existing.status <> 'committed' OR v_existing.result IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        IF v_existing.request_hash <> v_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_CONFLICT';
        END IF;
        RETURN v_existing.result || jsonb_build_object(
            'created',false,'replayed',true,'should_notify_staff',false,'notification',NULL
        );
    END IF;

    IF v_order.status='delivered' THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_DELIVERED_CANCELLATION_FORBIDDEN';
    END IF;
    IF v_source='MOVIBACK' THEN
        IF v_redemption.status='delivered' THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_DELIVERED_CANCELLATION_FORBIDDEN';
        END IF;
    END IF;

    IF v_order.status='cancelled' THEN
        IF v_order.cancellation_reintegrate_stock IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_LEGACY_REVERSAL_REQUIRES_ADMIN';
        END IF;
        IF v_source='MOVIBACK' THEN
            IF v_redemption.status NOT IN ('cancelled','rejected') THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_STATE_CONFLICT';
            END IF;
        END IF;
        v_stored_result := jsonb_build_object(
            'ok',true,
            'data',jsonb_build_object(
                'order_id',p_order_id,
                'source',v_source,
                'operational_status','cancelled',
                'next_allowed_action',NULL,
                'message',CASE WHEN v_source='MOVIBACK' THEN 'Richiesta premio annullata' ELSE 'Ordine annullato' END,
                'reintegrate_stock',v_order.cancellation_reintegrate_stock,
                'store_units_restored',0,
                'refunded_points',0,
                'applied',false
            )
        );
    ELSE
        IF v_source='STORE' THEN
            IF v_order.status NOT IN ('pending','confirmed','ordered_to_supplier','ready') THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_STORE_ORDER_TRANSITION';
            END IF;
        ELSE
            IF NOT (
                (v_order.status IN ('pending','confirmed','ordered_to_supplier') AND v_redemption.status IN ('requested','processing'))
                OR (v_order.status='ready' AND v_redemption.status='ready')
            ) THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_STATE_CONFLICT';
            END IF;
        END IF;

        SELECT count(*) INTO v_item_count
        FROM public.store_order_items
        WHERE order_id=p_order_id;
        IF v_item_count = 0 THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_ITEM_REQUIRED';
        END IF;

        IF v_source='STORE' THEN
            FOR v_item IN
                SELECT *
                FROM public.store_order_items
                WHERE order_id=p_order_id
                ORDER BY id
            LOOP
                IF v_item.product_id IS NULL THEN
                    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVENTORY_IDENTITY_CONFLICT';
                END IF;

                SELECT count(*)
                INTO v_stock_match_count
                FROM public.store_product_stock
                WHERE product_id=v_item.product_id
                  AND color_id IS NOT DISTINCT FROM v_item.color_id
                  AND size_id IS NOT DISTINCT FROM v_item.size_id
                  AND is_active=true;

                SELECT count(*)
                INTO v_product_stock_count
                FROM public.store_product_stock
                WHERE product_id=v_item.product_id
                  AND is_active=true;

                IF v_stock_match_count > 1
                   OR (v_stock_match_count = 0 AND v_product_stock_count > 0) THEN
                    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVENTORY_IDENTITY_CONFLICT';
                END IF;

                IF v_stock_match_count = 1 THEN
                    SELECT id,stock_qty
                    INTO v_stock_id,v_stock_qty
                    FROM public.store_product_stock
                    WHERE product_id=v_item.product_id
                      AND color_id IS NOT DISTINCT FROM v_item.color_id
                      AND size_id IS NOT DISTINCT FROM v_item.size_id
                      AND is_active=true;
                END IF;

                IF v_stock_match_count = 1 AND p_reintegrate_stock THEN
                    PERFORM 1 FROM public.store_product_stock WHERE id=v_stock_id FOR UPDATE;
                    UPDATE public.store_product_stock
                    SET stock_qty=stock_qty+v_item.quantity,updated_at=now()
                    WHERE id=v_stock_id AND stock_qty IS NOT NULL;
                    GET DIAGNOSTICS v_affected = ROW_COUNT;
                    IF v_affected <> 1 THEN
                        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVENTORY_IDENTITY_CONFLICT';
                    END IF;
                    v_store_units_restored := v_store_units_restored+v_item.quantity;
                END IF;
            END LOOP;
        ELSE
            SELECT id INTO v_membership
            FROM public.loyalty_memberships
            WHERE id=v_redemption.membership_id
            FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_MEMBERSHIP';
            END IF;

            SELECT count(*) INTO v_debit_count
            FROM public.loyalty_transactions
            WHERE related_redemption_id=v_redemption.id
              AND membership_id=v_redemption.membership_id
              AND type='redeem'
              AND source='reward_redemption'
              AND points_delta=-v_redemption.points_cost;
            IF v_debit_count <> 1 THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_LEDGER_INVARIANT';
            END IF;
            IF v_redemption.points_refunded_at IS NOT NULL
               OR v_redemption.reservations_released_at IS NOT NULL THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_REVERSAL_STATE_CONFLICT';
            END IF;

            IF p_reintegrate_stock AND v_redemption.reward_stock_reserved_qty > 0 THEN
                SELECT stock_qty INTO v_reward_stock_qty
                FROM public.rewards_catalog
                WHERE id=v_redemption.reward_id
                FOR UPDATE;
                IF NOT FOUND OR v_reward_stock_qty IS NULL THEN
                    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
                END IF;
            END IF;

            IF p_reintegrate_stock AND v_redemption.store_stock_reserved_qty > 0 THEN
                SELECT id,stock_qty INTO v_stock
                FROM public.store_product_stock
                WHERE id=v_redemption.reserved_store_stock_id
                FOR UPDATE;
                IF NOT FOUND OR v_stock.stock_qty IS NULL THEN
                    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
                END IF;
            END IF;

            INSERT INTO public.loyalty_transactions(
                membership_id,type,source,euro_amount,points_delta,created_by,notes,related_redemption_id
            ) VALUES (
                v_redemption.membership_id,'refund','reward_redemption',NULL,v_redemption.points_cost,
                p_actor_id,'Rimborso annullamento premio: ' || v_reason,v_redemption.id
            );
            v_refunded_points := v_redemption.points_cost;

            IF p_reintegrate_stock AND v_redemption.reward_stock_reserved_qty > 0 THEN
                UPDATE public.rewards_catalog
                SET stock_qty=stock_qty+v_redemption.reward_stock_reserved_qty,updated_at=now()
                WHERE id=v_redemption.reward_id AND stock_qty IS NOT NULL;
                GET DIAGNOSTICS v_affected = ROW_COUNT;
                IF v_affected <> 1 THEN
                    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
                END IF;
                v_reward_units_restored := v_redemption.reward_stock_reserved_qty;
            END IF;

            IF p_reintegrate_stock AND v_redemption.store_stock_reserved_qty > 0 THEN
                UPDATE public.store_product_stock
                SET stock_qty=stock_qty+v_redemption.store_stock_reserved_qty,updated_at=now()
                WHERE id=v_redemption.reserved_store_stock_id AND stock_qty IS NOT NULL;
                GET DIAGNOSTICS v_affected = ROW_COUNT;
                IF v_affected <> 1 THEN
                    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_RESERVATION_STATE_CONFLICT';
                END IF;
                v_store_units_restored := v_redemption.store_stock_reserved_qty;
            END IF;

            UPDATE public.reward_redemptions
            SET status='cancelled',
                cancelled_at=coalesce(cancelled_at,now()),
                handled_by=p_actor_id,
                terminal_reason=v_reason,
                points_refunded_at=now(),
                reservations_released_at=now()
            WHERE id=v_redemption.id;

            UPDATE public.communications
            SET is_active=false,updated_at=now()
            WHERE event_key='moviback_reward_ready:' || v_redemption.id::text
              AND is_active=true;
        END IF;

        UPDATE public.store_orders
        SET status='cancelled',
            cancelled_at=coalesce(cancelled_at,now()),
            updated_at=now(),
            cancellation_reintegrate_stock=p_reintegrate_stock,
            cancellation_stock_restored_at=CASE WHEN p_reintegrate_stock THEN now() ELSE NULL END,
            cancellation_decided_at=now(),
            cancellation_reason=v_reason,
            cancelled_by=p_actor_id
        WHERE id=p_order_id;
        v_applied := true;

        v_stored_result := jsonb_build_object(
            'ok',true,
            'data',jsonb_build_object(
                'order_id',p_order_id,
                'redemption_id',v_result_redemption_id,
                'source',v_source,
                'operational_status','cancelled',
                'next_allowed_action',NULL,
                'message',CASE WHEN v_source='MOVIBACK' THEN 'Richiesta premio annullata' ELSE 'Ordine annullato' END,
                'reintegrate_stock',p_reintegrate_stock,
                'store_units_restored',v_store_units_restored,
                'reward_units_restored',v_reward_units_restored,
                'refunded_points',v_refunded_points,
                'qr_deliverable',false,
                'applied',v_applied
            )
        );
    END IF;

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

ALTER FUNCTION public.cancel_physical_store_order(uuid,uuid,uuid,text,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_physical_store_order(uuid,uuid,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_physical_store_order(uuid,uuid,uuid,text,boolean) TO postgres, service_role;

-- The legacy signature cannot express the mandatory physical stock decision.
-- Keep the symbol for a controlled rolling-deploy failure, but do not permit it
-- to execute either the historical automatic restore or a silent default.
CREATE OR REPLACE FUNCTION public.cancel_physical_store_order(
    p_actor_id uuid,
    p_idempotency_key uuid,
    p_order_id uuid,
    p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path TO pg_catalog, public, extensions
AS $function$
BEGIN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_STOCK_DECISION_REQUIRED';
END;
$function$;

ALTER FUNCTION public.cancel_physical_store_order(uuid,uuid,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_physical_store_order(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_physical_store_order(uuid,uuid,uuid,text) TO postgres, service_role;
