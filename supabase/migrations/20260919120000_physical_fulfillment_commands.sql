-- Phase 1: guarded physical-fulfillment commands and recipient-scoped
-- in-app events. This migration is additive except for replacing the two
-- existing lifecycle functions with compatible, stricter implementations.

ALTER TABLE public.communications
    ADD COLUMN recipient_user_id uuid,
    ADD COLUMN event_type text,
    ADD COLUMN event_key text;

ALTER TABLE public.communications
    DROP CONSTRAINT communications_target_check,
    ADD CONSTRAINT communications_target_check
        CHECK (target = ANY (ARRAY[
            'all'::text,
            'moviback'::text,
            'moviback_approved'::text,
            'moviback_pending'::text,
            'moviback_suspended'::text,
            'staff'::text,
            'tournament'::text,
            'user'::text
        ])),
    ADD CONSTRAINT communications_recipient_scope_check
        CHECK (
            (target = 'user' AND recipient_user_id IS NOT NULL)
            OR
            (target <> 'user' AND recipient_user_id IS NULL)
        ),
    ADD CONSTRAINT communications_recipient_user_id_fkey
        FOREIGN KEY (recipient_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX communications_event_key_unique
    ON public.communications (event_key)
    WHERE event_key IS NOT NULL;

CREATE INDEX communications_recipient_active_created_idx
    ON public.communications (recipient_user_id, is_active, created_at DESC)
    WHERE target = 'user';

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
            'store_order_delivery'::text
        ]));

CREATE OR REPLACE FUNCTION public.ready_moviback_redemption(
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
    v_notification_created boolean := false;
    v_stored_result jsonb;
    v_affected integer;
BEGIN
    IF p_actor_id IS NULL OR p_idempotency_key IS NULL OR p_redemption_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_MALFORMED_REQUEST';
    END IF;

    SELECT r.*, m.user_id AS owner_user_id, c.name AS reward_name
    INTO v_redemption
    FROM public.reward_redemptions r
    JOIN public.loyalty_memberships m ON m.id = r.membership_id
    JOIN public.rewards_catalog c ON c.id = r.reward_id
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
    END IF;

    IF v_redemption.status = 'ready' THEN
        IF v_redemption.fulfillment_type IN ('store_product','custom_physical') THEN
            IF v_order.status <> 'ready' THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_STATE_CONFLICT';
            END IF;
        END IF;
    ELSIF v_redemption.status IN ('requested','processing') THEN
        IF v_redemption.fulfillment_type IN ('store_product','custom_physical') THEN
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

        IF v_redemption.fulfillment_type IN ('store_product','custom_physical') THEN
            INSERT INTO public.communications(
                target,title,body,cta_label,cta_url,is_active,starts_at,
                created_by,recipient_user_id,event_type,event_key
            ) VALUES (
                'user',
                'Il tuo premio è pronto',
                'Il tuo premio ' || v_redemption.reward_name || ' è pronto per il ritiro. Apri MoviBack per mostrare il QR o il codice premio.',
                'Apri MoviBack',
                '/moviback',
                true,
                now(),
                p_actor_id,
                v_redemption.owner_user_id,
                'moviback_reward_ready',
                'moviback_reward_ready:' || p_redemption_id::text
            )
            ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
            GET DIAGNOSTICS v_affected = ROW_COUNT;
            v_notification_created := v_affected = 1;
        END IF;
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
            'applied',v_applied,
            'customer_notification_created',v_notification_created
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

CREATE OR REPLACE FUNCTION public.deliver_moviback_redemption(
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

    IF v_redemption.status <> 'delivered' AND v_redemption.fulfillment_type IS NULL THEN
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
    END IF;

    IF v_redemption.status = 'delivered' THEN
        IF v_redemption.fulfillment_type IN ('store_product','custom_physical') THEN
            IF v_order.status <> 'delivered' THEN
                RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_STATE_CONFLICT';
            END IF;
        END IF;
    ELSIF v_redemption.status = 'ready' THEN
        IF v_redemption.fulfillment_type IN ('store_product','custom_physical') THEN
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

CREATE FUNCTION public.mark_physical_store_order_ready(
    p_actor_id uuid,
    p_idempotency_key uuid,
    p_order_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY INVOKER
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_operation constant text := 'store_order_ready';
    v_order record;
    v_request_hash text;
    v_idempotency_id uuid;
    v_existing record;
    v_result jsonb;
    v_stored_result jsonb;
    v_applied boolean := false;
    v_affected integer;
BEGIN
    IF p_actor_id IS NULL OR p_idempotency_key IS NULL OR p_order_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_MALFORMED_REQUEST';
    END IF;

    SELECT id,user_id,status,order_type,related_redemption_id
    INTO v_order
    FROM public.store_orders
    WHERE id=p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_STORE_ORDER';
    END IF;

    IF v_order.order_type = 'reward_redemption' THEN
        IF v_order.related_redemption_id IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_LINK_CONFLICT';
        END IF;
        v_result := public.ready_moviback_redemption(
            p_actor_id,p_idempotency_key,v_order.related_redemption_id
        );
        RETURN jsonb_set(
            v_result,
            '{data}',
            (v_result->'data') || jsonb_build_object(
                'order_id',p_order_id,
                'source','MOVIBACK',
                'operational_status','ready',
                'next_allowed_action','deliver',
                'message','Premio pronto per il ritiro'
            )
        );
    END IF;

    IF v_order.order_type <> 'catalog' OR v_order.related_redemption_id IS NOT NULL OR v_order.user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_STORE_ORDER_ORIGIN_CONFLICT';
    END IF;

    SELECT id,user_id,status,order_type,related_redemption_id
    INTO v_order
    FROM public.store_orders
    WHERE id=p_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_STORE_ORDER';
    END IF;
    IF v_order.order_type <> 'catalog' OR v_order.related_redemption_id IS NOT NULL OR v_order.user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_STORE_ORDER_ORIGIN_CONFLICT';
    END IF;

    v_request_hash := encode(
        extensions.digest(
            convert_to(jsonb_build_object('v',1,'operation',v_operation,'order_id',p_order_id)::text,'UTF8'),
            'sha256'
        ),
        'hex'
    );

    INSERT INTO public.business_operation_idempotency(operation,user_id,idempotency_key,request_hash)
    VALUES (v_operation,v_order.user_id,p_idempotency_key,v_request_hash)
    ON CONFLICT (operation,user_id,idempotency_key) DO NOTHING
    RETURNING id INTO v_idempotency_id;

    IF v_idempotency_id IS NULL THEN
        SELECT request_hash,status,result INTO v_existing
        FROM public.business_operation_idempotency
        WHERE operation=v_operation AND user_id=v_order.user_id AND idempotency_key=p_idempotency_key;
        IF NOT FOUND OR v_existing.status <> 'committed' OR v_existing.result IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        IF v_existing.request_hash <> v_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_CONFLICT';
        END IF;
        RETURN v_existing.result || jsonb_build_object('created',false,'replayed',true);
    END IF;

    IF v_order.status = 'ready' THEN
        v_applied := false;
    ELSIF v_order.status IN ('pending','confirmed','ordered_to_supplier') THEN
        UPDATE public.store_orders
        SET status='ready',ready_at=coalesce(ready_at,now()),updated_at=now()
        WHERE id=p_order_id;
        v_applied := true;
    ELSE
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_STORE_ORDER_TRANSITION';
    END IF;

    v_stored_result := jsonb_build_object(
        'ok',true,
        'data',jsonb_build_object(
            'order_id',p_order_id,'source','STORE','operational_status','ready',
            'next_allowed_action','deliver','message','Ordine pronto per il ritiro','applied',v_applied
        )
    );
    UPDATE public.business_operation_idempotency
    SET status='committed',result=v_stored_result,completed_at=now()
    WHERE id=v_idempotency_id AND status='processing' AND request_hash=v_request_hash;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
    END IF;
    RETURN v_stored_result || jsonb_build_object('created',true,'replayed',false);
END;
$function$;

CREATE FUNCTION public.deliver_physical_store_order(
    p_actor_id uuid,
    p_idempotency_key uuid,
    p_order_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY INVOKER
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_operation constant text := 'store_order_delivery';
    v_order record;
    v_request_hash text;
    v_idempotency_id uuid;
    v_existing record;
    v_result jsonb;
    v_stored_result jsonb;
    v_applied boolean := false;
    v_affected integer;
BEGIN
    IF p_actor_id IS NULL OR p_idempotency_key IS NULL OR p_order_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_MALFORMED_REQUEST';
    END IF;

    SELECT id,user_id,status,order_type,related_redemption_id
    INTO v_order FROM public.store_orders WHERE id=p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_STORE_ORDER';
    END IF;

    IF v_order.order_type = 'reward_redemption' THEN
        IF v_order.related_redemption_id IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_LINK_CONFLICT';
        END IF;
        v_result := public.deliver_moviback_redemption(
            p_actor_id,p_idempotency_key,v_order.related_redemption_id
        );
        RETURN jsonb_set(
            v_result,
            '{data}',
            (v_result->'data') || jsonb_build_object(
                'order_id',p_order_id,'source','MOVIBACK','operational_status','delivered',
                'next_allowed_action',NULL,'message','Premio consegnato'
            )
        );
    END IF;

    IF v_order.order_type <> 'catalog' OR v_order.related_redemption_id IS NOT NULL OR v_order.user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_STORE_ORDER_ORIGIN_CONFLICT';
    END IF;

    SELECT id,user_id,status,order_type,related_redemption_id
    INTO v_order FROM public.store_orders WHERE id=p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_STORE_ORDER';
    END IF;
    IF v_order.order_type <> 'catalog' OR v_order.related_redemption_id IS NOT NULL OR v_order.user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_STORE_ORDER_ORIGIN_CONFLICT';
    END IF;

    v_request_hash := encode(
        extensions.digest(
            convert_to(jsonb_build_object('v',1,'operation',v_operation,'order_id',p_order_id)::text,'UTF8'),
            'sha256'
        ),'hex'
    );
    INSERT INTO public.business_operation_idempotency(operation,user_id,idempotency_key,request_hash)
    VALUES (v_operation,v_order.user_id,p_idempotency_key,v_request_hash)
    ON CONFLICT (operation,user_id,idempotency_key) DO NOTHING
    RETURNING id INTO v_idempotency_id;

    IF v_idempotency_id IS NULL THEN
        SELECT request_hash,status,result INTO v_existing
        FROM public.business_operation_idempotency
        WHERE operation=v_operation AND user_id=v_order.user_id AND idempotency_key=p_idempotency_key;
        IF NOT FOUND OR v_existing.status <> 'committed' OR v_existing.result IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
        END IF;
        IF v_existing.request_hash <> v_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_CONFLICT';
        END IF;
        RETURN v_existing.result || jsonb_build_object('created',false,'replayed',true);
    END IF;

    IF v_order.status = 'delivered' THEN
        v_applied := false;
    ELSIF v_order.status = 'ready' THEN
        UPDATE public.store_orders
        SET status='delivered',delivered_at=coalesce(delivered_at,now()),updated_at=now()
        WHERE id=p_order_id;
        v_applied := true;
    ELSE
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_STORE_ORDER_TRANSITION';
    END IF;

    v_stored_result := jsonb_build_object(
        'ok',true,
        'data',jsonb_build_object(
            'order_id',p_order_id,'source','STORE','operational_status','delivered',
            'next_allowed_action',NULL,'message','Ordine consegnato','applied',v_applied
        )
    );
    UPDATE public.business_operation_idempotency
    SET status='committed',result=v_stored_result,completed_at=now()
    WHERE id=v_idempotency_id AND status='processing' AND request_hash=v_request_hash;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_IDEMPOTENCY_INCOMPLETE';
    END IF;
    RETURN v_stored_result || jsonb_build_object('created',true,'replayed',false);
END;
$function$;

CREATE FUNCTION public.cancel_physical_store_order(
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
DECLARE
    v_order record;
    v_result jsonb;
BEGIN
    IF p_actor_id IS NULL OR p_idempotency_key IS NULL OR p_order_id IS NULL OR nullif(btrim(p_reason),'') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_MALFORMED_REQUEST';
    END IF;

    SELECT id,order_type,related_redemption_id
    INTO v_order FROM public.store_orders WHERE id=p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_INVALID_STORE_ORDER';
    END IF;

    IF v_order.order_type = 'reward_redemption' THEN
        IF v_order.related_redemption_id IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_FULFILLMENT_LINK_CONFLICT';
        END IF;
        v_result := public.cancel_moviback_redemption(
            p_actor_id,p_idempotency_key,v_order.related_redemption_id,btrim(p_reason)
        );
        RETURN jsonb_set(
            v_result,
            '{data}',
            (v_result->'data') || jsonb_build_object(
                'order_id',p_order_id,'source','MOVIBACK','operational_status','cancelled',
                'next_allowed_action',NULL,'message','Richiesta premio annullata'
            )
        );
    END IF;

    IF v_order.order_type = 'catalog' AND v_order.related_redemption_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_STORE_CANCELLATION_DEFERRED';
    END IF;

    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PF08_STORE_ORDER_ORIGIN_CONFLICT';
END;
$function$;

ALTER FUNCTION public.ready_moviback_redemption(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.deliver_moviback_redemption(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.mark_physical_store_order_ready(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.deliver_physical_store_order(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.cancel_physical_store_order(uuid,uuid,uuid,text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.mark_physical_store_order_ready(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deliver_physical_store_order(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_physical_store_order(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mark_physical_store_order_ready(uuid,uuid,uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.deliver_physical_store_order(uuid,uuid,uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_physical_store_order(uuid,uuid,uuid,text) TO postgres, service_role;
