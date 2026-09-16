-- PF-08B1 atomic Store checkout. Application route integration is intentionally
-- deferred; only postgres and service_role may execute this function.

CREATE FUNCTION public.checkout_store_order(
    p_user_id uuid,
    p_idempotency_key uuid,
    p_pickup_club text,
    p_payment_mode text,
    p_points_to_use integer,
    p_notes text,
    p_items jsonb
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY INVOKER
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_pickup_club text;
    v_payment_mode text;
    v_notes text;
    v_requested_points integer;
    v_normalized_items jsonb;
    v_hash_payload jsonb;
    v_request_hash text;
    v_idempotency_id uuid;
    v_existing_hash text;
    v_existing_status text;
    v_existing_result jsonb;
    v_user record;
    v_membership record;
    v_membership_count integer;
    v_points_balance bigint := 0;
    v_item record;
    v_product record;
    v_color record;
    v_size record;
    v_size_label text;
    v_stock record;
    v_stock_item record;
    v_stock_ids uuid[];
    v_stock_count integer;
    v_invalid_count integer;
    v_unit_euro numeric;
    v_unit_points integer;
    v_total_euro numeric := 0;
    v_total_points bigint := 0;
    v_points_to_redeem integer := 0;
    v_final_euro numeric := 0;
    v_order_items jsonb := '[]'::jsonb;
    v_finite_stock jsonb := '[]'::jsonb;
    v_notification_items jsonb;
    v_order_id uuid;
    v_order_status text;
    v_stored_result jsonb;
    v_notification jsonb;
    v_affected integer;
BEGIN
    IF p_user_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MALFORMED_REQUEST';
    END IF;

    v_pickup_club := upper(btrim(coalesce(p_pickup_club, '')));
    v_payment_mode := btrim(coalesce(p_payment_mode, ''));
    v_notes := nullif(btrim(coalesce(p_notes, '')), '');
    v_requested_points := CASE
        WHEN v_payment_mode = 'mixed' THEN greatest(coalesce(p_points_to_use, 0), 0)
        ELSE 0
    END;

    IF v_pickup_club <> ALL (ARRAY['CENTALLO', 'COSTIGLIOLE', 'MANTA', 'SALUZZO', 'REVELLO']) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_PICKUP_CLUB';
    END IF;

    IF v_payment_mode <> ALL (ARRAY['euro', 'points', 'mixed']) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_PAYMENT_MODE';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MALFORMED_REQUEST';
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_EMPTY_CART';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_items) AS entry(value)
        WHERE jsonb_typeof(entry.value) <> 'object'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MALFORMED_REQUEST';
    END IF;

    BEGIN
        WITH parsed AS (
            SELECT
                nullif(btrim(entry.value->>'product_id'), '')::uuid AS product_id,
                nullif(btrim(entry.value->>'color_id'), '')::uuid AS color_id,
                nullif(btrim(entry.value->>'size_id'), '')::uuid AS size_id,
                nullif(btrim(entry.value->>'quantity'), '')::numeric AS quantity
            FROM jsonb_array_elements(p_items) AS entry(value)
        )
        SELECT count(*)
        INTO v_invalid_count
        FROM parsed
        WHERE product_id IS NULL
           OR color_id IS NULL
           OR quantity IS NULL
           OR quantity <= 0
           OR quantity <> trunc(quantity)
           OR quantity > 2147483647;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MALFORMED_REQUEST';
    END;

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MALFORMED_REQUEST';
    END IF;

    BEGIN
        WITH parsed AS (
            SELECT
                nullif(btrim(entry.value->>'product_id'), '')::uuid AS product_id,
                nullif(btrim(entry.value->>'color_id'), '')::uuid AS color_id,
                nullif(btrim(entry.value->>'size_id'), '')::uuid AS size_id,
                nullif(btrim(entry.value->>'quantity'), '')::numeric AS quantity
            FROM jsonb_array_elements(p_items) AS entry(value)
        ), aggregated AS (
            SELECT product_id, color_id, size_id, sum(quantity) AS quantity
            FROM parsed
            GROUP BY product_id, color_id, size_id
        )
        SELECT count(*) FILTER (WHERE quantity > 2147483647)
        INTO v_invalid_count
        FROM aggregated;

        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MALFORMED_REQUEST';
        END IF;

        WITH parsed AS (
            SELECT
                nullif(btrim(entry.value->>'product_id'), '')::uuid AS product_id,
                nullif(btrim(entry.value->>'color_id'), '')::uuid AS color_id,
                nullif(btrim(entry.value->>'size_id'), '')::uuid AS size_id,
                nullif(btrim(entry.value->>'quantity'), '')::numeric AS quantity
            FROM jsonb_array_elements(p_items) AS entry(value)
        ), aggregated AS (
            SELECT product_id, color_id, size_id, sum(quantity)::integer AS quantity
            FROM parsed
            GROUP BY product_id, color_id, size_id
        )
        SELECT jsonb_agg(
            jsonb_build_object(
                'product_id', product_id,
                'color_id', color_id,
                'size_id', size_id,
                'quantity', quantity
            )
            ORDER BY product_id::text, color_id::text, size_id::text NULLS FIRST
        )
        INTO v_normalized_items
        FROM aggregated;
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            RAISE;
        WHEN OTHERS THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MALFORMED_REQUEST';
    END;

    SELECT id, full_name, phone, email
    INTO v_user
    FROM public.users
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_USER';
    END IF;

    v_hash_payload := jsonb_build_object(
        'v', 1,
        'operation', 'store_checkout',
        'pickup_club', v_pickup_club,
        'payment_mode', v_payment_mode,
        'points_to_use', v_requested_points,
        'notes', v_notes,
        'items', v_normalized_items
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
        'store_checkout',
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
        WHERE operation = 'store_checkout'
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
            'notification', NULL
        );
    END IF;

    IF v_payment_mode IN ('points', 'mixed') THEN
        SELECT count(*)
        INTO v_membership_count
        FROM public.loyalty_memberships
        WHERE user_id = p_user_id;

        IF v_membership_count = 0 THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MEMBERSHIP_REQUIRED';
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

        SELECT coalesce(sum(points_delta), 0)
        INTO v_points_balance
        FROM public.loyalty_transactions
        WHERE membership_id = v_membership.id;
    END IF;

    FOR v_item IN
        SELECT *
        FROM jsonb_to_recordset(v_normalized_items) AS item(
            product_id uuid,
            color_id uuid,
            size_id uuid,
            quantity integer
        )
        ORDER BY product_id::text, color_id::text, size_id::text NULLS FIRST
    LOOP
        SELECT
            id,
            name,
            base_price_euro,
            base_price_points,
            is_active,
            allow_euro,
            allow_points,
            allow_mixed
        INTO v_product
        FROM public.store_products
        WHERE id = v_item.product_id
        FOR SHARE;

        IF NOT FOUND OR NOT v_product.is_active THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_PRODUCT';
        END IF;

        IF (v_payment_mode = 'euro' AND NOT v_product.allow_euro)
           OR (v_payment_mode = 'points' AND NOT v_product.allow_points)
           OR (v_payment_mode = 'mixed' AND NOT v_product.allow_mixed) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_PAYMENT_NOT_ALLOWED';
        END IF;

        SELECT id, color_name, is_active
        INTO v_color
        FROM public.store_product_colors
        WHERE id = v_item.color_id
          AND product_id = v_product.id
        FOR SHARE;

        IF NOT FOUND OR NOT v_color.is_active THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_COLOR';
        END IF;

        v_size_label := NULL;
        IF v_item.size_id IS NOT NULL THEN
            SELECT id, size_label, is_active
            INTO v_size
            FROM public.store_product_sizes
            WHERE id = v_item.size_id
              AND product_id = v_product.id
            FOR SHARE;

            IF NOT FOUND OR NOT v_size.is_active THEN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_SIZE';
            END IF;

            v_size_label := v_size.size_label;
        END IF;

        v_stock_ids := NULL;
        SELECT array_agg(stock.id ORDER BY stock.id)
        INTO v_stock_ids
        FROM public.store_product_stock AS stock
        WHERE stock.product_id = v_product.id
          AND stock.color_id = v_color.id
          AND stock.size_id IS NOT DISTINCT FROM v_item.size_id
          AND stock.is_active = true;

        v_stock_count := coalesce(array_length(v_stock_ids, 1), 0);
        IF v_stock_count > 1 THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_STOCK_AMBIGUOUS';
        END IF;

        v_unit_euro := coalesce(v_product.base_price_euro, 0);
        v_unit_points := coalesce(
            v_product.base_price_points,
            round(v_unit_euro * 10)::integer
        );

        v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
            'product_id', v_product.id,
            'color_id', v_color.id,
            'size_id', v_item.size_id,
            'product_name', v_product.name,
            'color_name', v_color.color_name,
            'size_label', v_size_label,
            'quantity', v_item.quantity,
            'unit_price_euro', v_unit_euro,
            'unit_price_points', v_unit_points,
            'total_euro', v_unit_euro * v_item.quantity,
            'total_points', v_unit_points * v_item.quantity,
            'stock_id', CASE WHEN v_stock_count = 1 THEN v_stock_ids[1] ELSE NULL END
        ));

        v_total_euro := v_total_euro + (v_unit_euro * v_item.quantity);
        v_total_points := v_total_points + (v_unit_points::bigint * v_item.quantity::bigint);
    END LOOP;

    IF v_total_points > 2147483647 OR v_total_points < -2147483648 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_MALFORMED_REQUEST';
    END IF;

    FOR v_stock_item IN
        SELECT *
        FROM jsonb_to_recordset(v_order_items) AS item(
            product_id uuid,
            color_id uuid,
            size_id uuid,
            quantity integer,
            stock_id uuid
        )
        WHERE stock_id IS NOT NULL
        ORDER BY stock_id
    LOOP
        SELECT id, product_id, color_id, size_id, stock_qty, is_active
        INTO v_stock
        FROM public.store_product_stock
        WHERE id = v_stock_item.stock_id
        FOR UPDATE;

        IF NOT FOUND
           OR NOT v_stock.is_active
           OR v_stock.product_id <> v_stock_item.product_id
           OR v_stock.color_id <> v_stock_item.color_id
           OR v_stock.size_id IS DISTINCT FROM v_stock_item.size_id THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INVALID_VARIANT';
        END IF;

        IF v_stock.stock_qty IS NOT NULL THEN
            IF v_stock.stock_qty < v_stock_item.quantity THEN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INSUFFICIENT_STOCK';
            END IF;

            v_finite_stock := v_finite_stock || jsonb_build_array(jsonb_build_object(
                'stock_id', v_stock.id,
                'quantity', v_stock_item.quantity
            ));
        END IF;
    END LOOP;

    IF v_payment_mode = 'points' THEN
        v_points_to_redeem := v_total_points::integer;
        v_final_euro := 0;
    ELSIF v_payment_mode = 'mixed' THEN
        v_points_to_redeem := greatest(0, least(v_requested_points, v_total_points::integer));
        v_final_euro := greatest(0, v_total_euro - (v_points_to_redeem::numeric / 10));
    ELSE
        v_points_to_redeem := 0;
        v_final_euro := v_total_euro;
    END IF;

    IF v_points_to_redeem > 0 AND v_points_balance < v_points_to_redeem THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INSUFFICIENT_POINTS';
    END IF;

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
        order_type
    ) VALUES (
        p_user_id,
        'pending',
        v_pickup_club,
        v_payment_mode,
        v_final_euro,
        v_points_to_redeem,
        v_user.full_name,
        v_user.phone,
        v_user.email,
        v_notes,
        'catalog'
    )
    RETURNING id, status INTO v_order_id, v_order_status;

    INSERT INTO public.store_order_items (
        order_id,
        product_id,
        color_id,
        size_id,
        product_name,
        color_name,
        size_label,
        quantity,
        unit_price_euro,
        unit_price_points,
        total_euro,
        total_points
    )
    SELECT
        v_order_id,
        item.product_id,
        item.color_id,
        item.size_id,
        item.product_name,
        item.color_name,
        item.size_label,
        item.quantity,
        item.unit_price_euro,
        item.unit_price_points,
        item.total_euro,
        item.total_points
    FROM jsonb_to_recordset(v_order_items) AS item(
        product_id uuid,
        color_id uuid,
        size_id uuid,
        product_name text,
        color_name text,
        size_label text,
        quantity integer,
        unit_price_euro numeric,
        unit_price_points integer,
        total_euro numeric,
        total_points integer
    );

    IF v_payment_mode IN ('points', 'mixed') AND v_points_to_redeem > 0 THEN
        INSERT INTO public.loyalty_transactions (
            membership_id,
            type,
            source,
            euro_amount,
            points_delta,
            notes
        ) VALUES (
            v_membership.id,
            'redeem',
            'manual_adjustment',
            NULL,
            -v_points_to_redeem,
            'Ordine Store MOVI: ' || v_order_id::text
        );
    END IF;

    FOR v_stock_item IN
        SELECT *
        FROM jsonb_to_recordset(v_finite_stock) AS item(
            stock_id uuid,
            quantity integer
        )
        ORDER BY stock_id
    LOOP
        UPDATE public.store_product_stock
        SET stock_qty = stock_qty - v_stock_item.quantity,
            updated_at = now()
        WHERE id = v_stock_item.stock_id
          AND stock_qty IS NOT NULL
          AND stock_qty >= v_stock_item.quantity;

        GET DIAGNOSTICS v_affected = ROW_COUNT;
        IF v_affected <> 1 THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PF08_INSUFFICIENT_STOCK';
        END IF;
    END LOOP;

    v_stored_result := jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object(
            'order_id', v_order_id,
            'status', v_order_status,
            'total_euro', v_final_euro,
            'total_points', v_points_to_redeem
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

    SELECT jsonb_agg(value - 'stock_id')
    INTO v_notification_items
    FROM jsonb_array_elements(v_order_items);

    v_notification := jsonb_build_object(
        'customer_name', v_user.full_name,
        'customer_phone', v_user.phone,
        'customer_email', v_user.email,
        'pickup_club', v_pickup_club,
        'payment_mode', v_payment_mode,
        'notes', v_notes,
        'items', v_notification_items
    );

    RETURN v_stored_result || jsonb_build_object(
        'created', true,
        'replayed', false,
        'notification', v_notification
    );
END;
$function$;

ALTER FUNCTION public.checkout_store_order(uuid, uuid, text, text, integer, text, jsonb)
    OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checkout_store_order(uuid, uuid, text, text, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.checkout_store_order(uuid, uuid, text, text, integer, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.checkout_store_order(uuid, uuid, text, text, integer, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_store_order(uuid, uuid, text, text, integer, text, jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.checkout_store_order(uuid, uuid, text, text, integer, text, jsonb) TO service_role;
