-- PF-08B2R2: atomic redemption-first MoviBack request contract.
-- Route, Telegram transport, and lifecycle/cancellation RPCs are intentionally deferred.

ALTER TABLE public.rewards_catalog
    ADD COLUMN fulfillment_type text,
    ADD CONSTRAINT rewards_catalog_fulfillment_type_check
        CHECK (
            fulfillment_type IS NULL
            OR fulfillment_type = ANY (
                ARRAY['service'::text, 'store_product'::text, 'custom_physical'::text, 'partner'::text]
            )
        );

ALTER TABLE public.reward_redemptions
    DROP CONSTRAINT redemption_status_check,
    ADD COLUMN fulfillment_type text,
    ADD COLUMN processing_at timestamp with time zone,
    ADD COLUMN ready_at timestamp with time zone,
    ADD COLUMN rejected_at timestamp with time zone,
    ADD COLUMN reward_stock_reserved_qty integer DEFAULT 0 NOT NULL,
    ADD COLUMN reserved_store_stock_id uuid,
    ADD COLUMN store_stock_reserved_qty integer DEFAULT 0 NOT NULL,
    ADD COLUMN reservations_released_at timestamp with time zone,
    ADD COLUMN points_refunded_at timestamp with time zone,
    ADD CONSTRAINT redemption_status_check
        CHECK (
            status = ANY (
                ARRAY[
                    'requested'::text,
                    'approved'::text,
                    'processing'::text,
                    'ready'::text,
                    'delivered'::text,
                    'cancelled'::text,
                    'rejected'::text
                ]
            )
        ),
    ADD CONSTRAINT reward_redemptions_fulfillment_type_check
        CHECK (
            fulfillment_type IS NULL
            OR fulfillment_type = ANY (
                ARRAY['service'::text, 'store_product'::text, 'custom_physical'::text, 'partner'::text]
            )
        ),
    ADD CONSTRAINT reward_redemptions_reward_reservation_check
        CHECK (reward_stock_reserved_qty = ANY (ARRAY[0, 1])),
    ADD CONSTRAINT reward_redemptions_store_reservation_check
        CHECK (
            (store_stock_reserved_qty = 0 AND reserved_store_stock_id IS NULL)
            OR (store_stock_reserved_qty = 1 AND reserved_store_stock_id IS NOT NULL)
        ),
    ADD CONSTRAINT reward_redemptions_reserved_store_stock_fkey
        FOREIGN KEY (reserved_store_stock_id)
        REFERENCES public.store_product_stock(id);

-- Historical null snapshots and historical redemptions without orders remain valid.
-- New smart-flow physical orders are protected from duplication by this relationship.
CREATE UNIQUE INDEX store_orders_reward_redemption_unique
    ON public.store_orders (related_redemption_id)
    WHERE order_type = 'reward_redemption'
      AND related_redemption_id IS NOT NULL;

CREATE FUNCTION public.redeem_moviback_reward(
    p_user_id uuid,
    p_idempotency_key uuid,
    p_reward_id uuid,
    p_store_color_id uuid DEFAULT NULL,
    p_store_size_id uuid DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY INVOKER
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_hash_payload jsonb;
    v_request_hash text;
    v_idempotency_id uuid;
    v_existing_hash text;
    v_existing_status text;
    v_existing_result jsonb;
    v_membership record;
    v_membership_count integer;
    v_points_balance bigint;
    v_reward record;
    v_product record;
    v_color record;
    v_size record;
    v_stock record;
    v_selected_product_id uuid;
    v_selected_product_name text;
    v_selected_color_id uuid;
    v_selected_color_name text;
    v_selected_size_id uuid;
    v_selected_size_label text;
    v_selected_stock_id uuid;
    v_selected_stock_qty integer;
    v_stock_ids uuid[];
    v_stock_count integer;
    v_active_size_count integer;
    v_initial_status text;
    v_ready_at timestamp with time zone;
    v_variant_text text;
    v_user record;
    v_redemption_id uuid;
    v_qr_token text;
    v_qr_attempt integer;
    v_constraint_name text;
    v_order_id uuid;
    v_reward_reserved_qty integer := 0;
    v_store_reserved_qty integer := 0;
    v_stored_result jsonb;
    v_notification jsonb;
    v_action_required text;
    v_affected integer;
BEGIN
    IF p_user_id IS NULL
       OR p_idempotency_key IS NULL
       OR p_reward_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MALFORMED_REQUEST';
    END IF;

    v_hash_payload := jsonb_build_object(
        'v', 2,
        'operation', 'moviback_redemption',
        'reward_id', p_reward_id,
        'store_color_id', p_store_color_id,
        'store_size_id', p_store_size_id
    );
    v_request_hash := encode(
        extensions.digest(convert_to(v_hash_payload::text, 'UTF8'), 'sha256'),
        'hex'
    );

    INSERT INTO public.business_operation_idempotency (
        operation,
        user_id,
        idempotency_key,
        request_hash
    ) VALUES (
        'moviback_redemption',
        p_user_id,
        p_idempotency_key,
        v_request_hash
    )
    ON CONFLICT (operation, user_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_idempotency_id;

    IF v_idempotency_id IS NULL THEN
        SELECT request_hash, status, result
        INTO v_existing_hash, v_existing_status, v_existing_result
        FROM public.business_operation_idempotency
        WHERE operation = 'moviback_redemption'
          AND user_id = p_user_id
          AND idempotency_key = p_idempotency_key;

        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;

        IF v_existing_hash <> v_request_hash THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_IDEMPOTENCY_CONFLICT';
        END IF;

        IF v_existing_status <> 'committed' OR v_existing_result IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;

        RETURN v_existing_result || jsonb_build_object(
            'created', false,
            'replayed', true,
            'should_notify_staff', false,
            'notification', NULL
        );
    END IF;

    SELECT count(*)
    INTO v_membership_count
    FROM public.loyalty_memberships
    WHERE user_id = p_user_id;

    IF v_membership_count = 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_MEMBERSHIP';
    END IF;

    IF v_membership_count > 1 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MEMBERSHIP_AMBIGUOUS';
    END IF;

    SELECT id, status
    INTO v_membership
    FROM public.loyalty_memberships
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_membership.status <> 'approved' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MEMBERSHIP_NOT_APPROVED';
    END IF;

    SELECT
        id,
        name,
        description,
        points_cost,
        is_active,
        stock_qty,
        store_product_id,
        fulfillment_type
    INTO v_reward
    FROM public.rewards_catalog
    WHERE id = p_reward_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_REWARD';
    END IF;

    IF NOT v_reward.is_active THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INACTIVE_REWARD';
    END IF;

    IF v_reward.points_cost < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_REWARD';
    END IF;

    IF v_reward.fulfillment_type IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_FULFILLMENT_UNCLASSIFIED';
    END IF;

    IF v_reward.stock_qty IS NOT NULL AND v_reward.stock_qty <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_REWARD_OUT_OF_STOCK';
    END IF;

    IF v_reward.fulfillment_type <> 'store_product'
       AND (p_store_color_id IS NOT NULL OR p_store_size_id IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_UNEXPECTED_VARIANT';
    END IF;

    IF v_reward.fulfillment_type = 'store_product' THEN
        IF v_reward.store_product_id IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_STORE_PRODUCT';
        END IF;

        IF p_store_color_id IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MISSING_REQUIRED_VARIANT';
        END IF;

        SELECT id, name, description, is_active
        INTO v_product
        FROM public.store_products
        WHERE id = v_reward.store_product_id
        FOR SHARE;

        IF NOT FOUND OR NOT v_product.is_active THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_STORE_PRODUCT';
        END IF;

        v_selected_product_id := v_product.id;
        v_selected_product_name := v_product.name;

        SELECT id, color_name, is_active
        INTO v_color
        FROM public.store_product_colors
        WHERE id = p_store_color_id
          AND product_id = v_product.id
        FOR SHARE;

        IF NOT FOUND OR NOT v_color.is_active THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_STORE_VARIANT';
        END IF;

        v_selected_color_id := v_color.id;
        v_selected_color_name := v_color.color_name;

        SELECT count(*)
        INTO v_active_size_count
        FROM public.store_product_sizes
        WHERE product_id = v_product.id
          AND is_active = true;

        IF v_active_size_count > 0 AND p_store_size_id IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MISSING_REQUIRED_VARIANT';
        END IF;

        IF v_active_size_count = 0 AND p_store_size_id IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_STORE_VARIANT';
        END IF;

        IF p_store_size_id IS NOT NULL THEN
            SELECT id, size_label, is_active
            INTO v_size
            FROM public.store_product_sizes
            WHERE id = p_store_size_id
              AND product_id = v_product.id
            FOR SHARE;

            IF NOT FOUND OR NOT v_size.is_active THEN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_STORE_VARIANT';
            END IF;

            v_selected_size_id := v_size.id;
            v_selected_size_label := v_size.size_label;
        END IF;

        SELECT array_agg(stock.id ORDER BY stock.id)
        INTO v_stock_ids
        FROM public.store_product_stock AS stock
        WHERE stock.product_id = v_product.id
          AND stock.color_id = v_color.id
          AND stock.size_id IS NOT DISTINCT FROM p_store_size_id
          AND stock.is_active = true;

        v_stock_count := coalesce(array_length(v_stock_ids, 1), 0);
        IF v_stock_count = 0 THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_STORE_VARIANT';
        END IF;

        IF v_stock_count > 1 THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_STORE_STOCK_AMBIGUOUS';
        END IF;

        SELECT id, product_id, color_id, size_id, stock_qty, is_active
        INTO v_stock
        FROM public.store_product_stock
        WHERE id = v_stock_ids[1]
        FOR UPDATE;

        IF NOT FOUND
           OR NOT v_stock.is_active
           OR v_stock.product_id <> v_product.id
           OR v_stock.color_id <> v_color.id
           OR v_stock.size_id IS DISTINCT FROM p_store_size_id THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_STORE_VARIANT';
        END IF;

        IF v_stock.stock_qty IS NOT NULL AND v_stock.stock_qty <= 0 THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INSUFFICIENT_STORE_STOCK';
        END IF;

        v_selected_stock_id := v_stock.id;
        v_selected_stock_qty := v_stock.stock_qty;
    END IF;

    SELECT coalesce(sum(points_delta), 0)
    INTO v_points_balance
    FROM public.loyalty_transactions
    WHERE membership_id = v_membership.id;

    IF v_points_balance < v_reward.points_cost THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INSUFFICIENT_POINTS';
    END IF;

    v_initial_status := CASE
        WHEN v_reward.fulfillment_type = 'service' THEN 'ready'
        ELSE 'requested'
    END;
    v_ready_at := CASE WHEN v_initial_status = 'ready' THEN now() ELSE NULL END;
    v_reward_reserved_qty := CASE WHEN v_reward.stock_qty IS NULL THEN 0 ELSE 1 END;
    v_store_reserved_qty := CASE
        WHEN v_reward.fulfillment_type = 'store_product'
         AND v_selected_stock_qty IS NOT NULL THEN 1
        ELSE 0
    END;

    v_redemption_id := gen_random_uuid();
    FOR v_qr_attempt IN 1..5 LOOP
        v_qr_token := encode(extensions.gen_random_bytes(24), 'hex');
        BEGIN
            INSERT INTO public.reward_redemptions (
                id,
                membership_id,
                reward_id,
                points_cost,
                status,
                qr_token,
                fulfillment_type,
                ready_at,
                reward_stock_reserved_qty,
                reserved_store_stock_id,
                store_stock_reserved_qty
            ) VALUES (
                v_redemption_id,
                v_membership.id,
                v_reward.id,
                v_reward.points_cost,
                v_initial_status,
                v_qr_token,
                v_reward.fulfillment_type,
                v_ready_at,
                v_reward_reserved_qty,
                CASE WHEN v_store_reserved_qty = 1 THEN v_selected_stock_id ELSE NULL END,
                v_store_reserved_qty
            );
            EXIT;
        EXCEPTION
            WHEN unique_violation THEN
                GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
                IF v_constraint_name <> 'reward_redemptions_qr_token_unique'
                   OR v_qr_attempt = 5 THEN
                    RAISE;
                END IF;
        END;
    END LOOP;

    INSERT INTO public.loyalty_transactions (
        membership_id,
        type,
        source,
        euro_amount,
        points_delta,
        related_redemption_id,
        notes
    ) VALUES (
        v_membership.id,
        'redeem',
        'reward_redemption',
        NULL,
        -v_reward.points_cost,
        v_redemption_id,
        'Riscatto premio: ' || v_reward.name
    );

    IF v_reward_reserved_qty = 1 THEN
        UPDATE public.rewards_catalog
        SET stock_qty = stock_qty - 1,
            updated_at = now()
        WHERE id = v_reward.id
          AND stock_qty IS NOT NULL
          AND stock_qty > 0;

        GET DIAGNOSTICS v_affected = ROW_COUNT;
        IF v_affected <> 1 THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_REWARD_OUT_OF_STOCK';
        END IF;
    END IF;

    IF v_store_reserved_qty = 1 THEN
        UPDATE public.store_product_stock
        SET stock_qty = stock_qty - 1,
            updated_at = now()
        WHERE id = v_selected_stock_id
          AND stock_qty IS NOT NULL
          AND stock_qty > 0;

        GET DIAGNOSTICS v_affected = ROW_COUNT;
        IF v_affected <> 1 THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INSUFFICIENT_STORE_STOCK';
        END IF;
    END IF;

    IF v_reward.fulfillment_type IN ('store_product', 'custom_physical') THEN
        SELECT id, full_name, phone, email
        INTO v_user
        FROM public.users
        WHERE id = p_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_MEMBERSHIP';
        END IF;

        v_variant_text := CASE
            WHEN v_reward.fulfillment_type = 'store_product' THEN
                concat_ws(' / ', v_selected_color_name, v_selected_size_label)
            ELSE NULL
        END;

        INSERT INTO public.store_orders (
            user_id,
            status,
            pickup_club,
            payment_mode,
            total_euro,
            total_points,
            customer_name,
            customer_phone,
            customer_email,
            notes,
            admin_notes,
            order_type,
            related_redemption_id,
            special_title,
            special_notes
        ) VALUES (
            p_user_id,
            'pending',
            'CENTALLO',
            'points',
            0,
            v_reward.points_cost,
            v_user.full_name,
            v_user.phone,
            v_user.email,
            'Fulfillment interno generato automaticamente dal riscatto MoviBack.',
            'Gestire dalla coda Richieste premio.',
            'reward_redemption',
            v_redemption_id,
            'Premio MoviBack - ' || v_reward.name,
            CASE
                WHEN v_reward.fulfillment_type = 'store_product' THEN
                    'Variante scelta: ' || coalesce(nullif(v_variant_text, ''), '—')
                ELSE
                    coalesce(nullif(v_reward.description, ''), 'Preparazione manuale richiesta.')
            END
        )
        RETURNING id INTO v_order_id;

        INSERT INTO public.store_order_items (
            order_id,
            product_id,
            color_id,
            size_id,
            product_name,
            color_name,
            size_label,
            custom_product_name,
            custom_variant,
            quantity,
            unit_price_euro,
            unit_price_points,
            total_euro,
            total_points,
            supplier_notes
        ) VALUES (
            v_order_id,
            v_selected_product_id,
            v_selected_color_id,
            v_selected_size_id,
            CASE
                WHEN v_reward.fulfillment_type = 'store_product' THEN v_selected_product_name
                ELSE v_reward.name
            END,
            v_selected_color_name,
            v_selected_size_label,
            CASE WHEN v_reward.fulfillment_type = 'custom_physical' THEN v_reward.name ELSE NULL END,
            CASE WHEN v_reward.fulfillment_type = 'store_product' THEN nullif(v_variant_text, '') ELSE NULL END,
            1,
            0,
            v_reward.points_cost,
            0,
            v_reward.points_cost,
            coalesce(nullif(v_reward.description, ''), 'Fulfillment premio MoviBack.')
        );
    END IF;

    v_action_required := CASE v_reward.fulfillment_type
        WHEN 'service' THEN 'EROGARE DALLA CODA RICHIESTE PREMIO; NESSUNA GESTIONE ORDINE STORE'
        WHEN 'store_product' THEN 'PRENDERE IN CARICO E PREPARARE IL PRODOTTO DALLA CODA RICHIESTE PREMIO'
        WHEN 'custom_physical' THEN 'PRENDERE IN CARICO E PREPARARE IL PREMIO DALLA CODA RICHIESTE PREMIO'
        WHEN 'partner' THEN 'PRENDERE IN CARICO E AVVIARE IL FULFILLMENT PARTNER DALLA CODA RICHIESTE PREMIO'
    END;

    v_stored_result := jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object(
            'id', v_redemption_id,
            'qr_token', v_qr_token,
            'qr_deliverable', v_initial_status = 'ready',
            'status', v_initial_status,
            'reward_id', v_reward.id,
            'points_cost', v_reward.points_cost,
            'fulfillment_type', v_reward.fulfillment_type,
            'store_order_id', v_order_id
        )
    );

    UPDATE public.business_operation_idempotency
    SET status = 'committed',
        result = v_stored_result,
        completed_at = now()
    WHERE id = v_idempotency_id
      AND status = 'processing'
      AND request_hash = v_request_hash;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_IDEMPOTENCY_INCOMPLETE';
    END IF;

    v_notification := jsonb_build_object(
        'user_id', p_user_id,
        'reward_id', v_reward.id,
        'reward_name', v_reward.name,
        'points_cost', v_reward.points_cost,
        'fulfillment_type', v_reward.fulfillment_type,
        'product_name', v_selected_product_name,
        'variant_text', nullif(v_variant_text, ''),
        'fulfillment_notes', CASE
            WHEN v_reward.fulfillment_type IN ('custom_physical', 'partner') THEN nullif(v_reward.description, '')
            ELSE NULL
        END,
        'initial_status', v_initial_status,
        'action_required', v_action_required,
        'store_order_handling_required', v_reward.fulfillment_type IN ('store_product', 'custom_physical')
    );

    RETURN v_stored_result || jsonb_build_object(
        'created', true,
        'replayed', false,
        'should_notify_staff', true,
        'notification', v_notification
    );
END;
$function$;

ALTER FUNCTION public.redeem_moviback_reward(uuid, uuid, uuid, uuid, uuid)
    OWNER TO postgres;

REVOKE ALL ON FUNCTION public.redeem_moviback_reward(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_moviback_reward(uuid, uuid, uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.redeem_moviback_reward(uuid, uuid, uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_moviback_reward(uuid, uuid, uuid, uuid, uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.redeem_moviback_reward(uuid, uuid, uuid, uuid, uuid) TO service_role;
