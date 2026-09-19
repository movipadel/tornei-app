-- Phase 2B: immutable supplier Excel batches at order-item granularity.

CREATE TABLE public.supplier_export_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key uuid NOT NULL,
    filename text NOT NULL,
    created_by text,
    is_legacy boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_export_batches_pkey PRIMARY KEY (id),
    CONSTRAINT supplier_export_batches_idempotency_key_key UNIQUE (idempotency_key),
    CONSTRAINT supplier_export_batches_filename_check CHECK (btrim(filename) <> '')
);

ALTER TABLE public.store_order_items
    ADD COLUMN supplier_export_batch_id uuid;

ALTER TABLE ONLY public.store_order_items
    ADD CONSTRAINT store_order_items_supplier_export_batch_id_fkey
    FOREIGN KEY (supplier_export_batch_id)
    REFERENCES public.supplier_export_batches(id)
    ON DELETE RESTRICT;

CREATE INDEX store_order_items_supplier_export_batch_id_idx
    ON public.store_order_items (supplier_export_batch_id)
    WHERE supplier_export_batch_id IS NOT NULL;

CREATE INDEX store_order_items_supplier_export_unclaimed_idx
    ON public.store_order_items (order_id, id)
    WHERE supplier_export_batch_id IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_supplier_export_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public
AS $function$
BEGIN
    IF OLD.supplier_export_batch_id IS NOT NULL
       AND NEW.supplier_export_batch_id IS DISTINCT FROM OLD.supplier_export_batch_id THEN
        RAISE EXCEPTION 'SUPPLIER_EXPORT_MEMBERSHIP_IMMUTABLE';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER store_order_items_supplier_export_immutable
BEFORE UPDATE OF supplier_export_batch_id ON public.store_order_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_supplier_export_reassignment();

CREATE OR REPLACE FUNCTION public.supplier_export_eligible_unit_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
    SELECT coalesce(sum(i.quantity), 0)::bigint
    FROM public.store_order_items AS i
    JOIN public.store_orders AS o ON o.id = i.order_id
    LEFT JOIN public.reward_redemptions AS r ON r.id = o.related_redemption_id
    WHERE i.supplier_export_batch_id IS NULL
      AND (
          i.product_id IS NOT NULL
          OR nullif(btrim(i.custom_product_name), '') IS NOT NULL
      )
      AND (
          (
              o.order_type = 'catalog'
              AND o.related_redemption_id IS NULL
              AND o.status IN ('pending', 'confirmed', 'ordered_to_supplier')
          )
          OR
          (
              o.order_type = 'reward_redemption'
              AND o.related_redemption_id IS NOT NULL
              AND r.id = o.related_redemption_id
              AND r.fulfillment_type IN ('store_product', 'custom_physical')
              AND o.status IN ('pending', 'confirmed', 'ordered_to_supplier')
              AND r.status IN ('requested', 'processing')
          )
      );
$function$;

CREATE OR REPLACE FUNCTION public.claim_supplier_export_batch(
    p_idempotency_key uuid,
    p_created_by text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_batch public.supplier_export_batches%ROWTYPE;
    v_item_ids uuid[];
    v_item_count integer;
    v_unit_count bigint;
BEGIN
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'SUPPLIER_EXPORT_IDEMPOTENCY_KEY_REQUIRED';
    END IF;

    SELECT *
    INTO v_batch
    FROM public.supplier_export_batches
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        SELECT count(*), coalesce(sum(quantity), 0)
        INTO v_item_count, v_unit_count
        FROM public.store_order_items
        WHERE supplier_export_batch_id = v_batch.id;

        RETURN jsonb_build_object(
            'ok', true,
            'created', false,
            'replayed', true,
            'batch_id', v_batch.id,
            'filename', v_batch.filename,
            'item_count', v_item_count,
            'unit_count', v_unit_count
        );
    END IF;

    SELECT array_agg(candidate.id ORDER BY candidate.created_at, candidate.id)
    INTO v_item_ids
    FROM (
        SELECT i.id, i.created_at
        FROM public.store_order_items AS i
        JOIN public.store_orders AS o ON o.id = i.order_id
        LEFT JOIN public.reward_redemptions AS r ON r.id = o.related_redemption_id
        WHERE i.supplier_export_batch_id IS NULL
          AND (
              i.product_id IS NOT NULL
              OR nullif(btrim(i.custom_product_name), '') IS NOT NULL
          )
          AND (
              (
                  o.order_type = 'catalog'
                  AND o.related_redemption_id IS NULL
                  AND o.status IN ('pending', 'confirmed', 'ordered_to_supplier')
              )
              OR
              (
                  o.order_type = 'reward_redemption'
                  AND o.related_redemption_id IS NOT NULL
                  AND r.id = o.related_redemption_id
                  AND r.fulfillment_type IN ('store_product', 'custom_physical')
                  AND o.status IN ('pending', 'confirmed', 'ordered_to_supplier')
                  AND r.status IN ('requested', 'processing')
              )
          )
        ORDER BY o.created_at, i.created_at, i.id
        FOR UPDATE OF i SKIP LOCKED
    ) AS candidate;

    IF v_item_ids IS NULL OR cardinality(v_item_ids) = 0 THEN
        RETURN jsonb_build_object(
            'ok', true,
            'created', false,
            'replayed', false,
            'empty', true,
            'message', 'Nessun articolo da ordinare al fornitore.'
        );
    END IF;

    INSERT INTO public.supplier_export_batches (
        idempotency_key,
        filename,
        created_by
    ) VALUES (
        p_idempotency_key,
        'riepilogo-fornitore-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || left(p_idempotency_key::text, 8) || '.xls',
        nullif(btrim(p_created_by), '')
    )
    RETURNING * INTO v_batch;

    UPDATE public.store_order_items
    SET supplier_export_batch_id = v_batch.id
    WHERE id = ANY(v_item_ids)
      AND supplier_export_batch_id IS NULL;

    GET DIAGNOSTICS v_item_count = ROW_COUNT;
    IF v_item_count <> cardinality(v_item_ids) THEN
        RAISE EXCEPTION 'SUPPLIER_EXPORT_CLAIM_CONFLICT';
    END IF;

    SELECT coalesce(sum(quantity), 0)
    INTO v_unit_count
    FROM public.store_order_items
    WHERE supplier_export_batch_id = v_batch.id;

    RETURN jsonb_build_object(
        'ok', true,
        'created', true,
        'replayed', false,
        'batch_id', v_batch.id,
        'filename', v_batch.filename,
        'item_count', v_item_count,
        'unit_count', v_unit_count
    );
EXCEPTION
    WHEN unique_violation THEN
        SELECT *
        INTO v_batch
        FROM public.supplier_export_batches
        WHERE idempotency_key = p_idempotency_key;

        IF NOT FOUND THEN
            RAISE;
        END IF;

        SELECT count(*), coalesce(sum(quantity), 0)
        INTO v_item_count, v_unit_count
        FROM public.store_order_items
        WHERE supplier_export_batch_id = v_batch.id;

        RETURN jsonb_build_object(
            'ok', true,
            'created', false,
            'replayed', true,
            'batch_id', v_batch.id,
            'filename', v_batch.filename,
            'item_count', v_item_count,
            'unit_count', v_unit_count
        );
END;
$function$;

-- The old export mutated catalog orders to confirmed. Preserve those rows as a
-- single legacy batch so a rollout cannot silently export them a second time.
DO $legacy$
DECLARE
    v_legacy_batch_id uuid;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.store_order_items AS i
        JOIN public.store_orders AS o ON o.id = i.order_id
        LEFT JOIN public.reward_redemptions AS r ON r.id = o.related_redemption_id
        WHERE i.supplier_export_batch_id IS NULL
          AND o.status IN ('confirmed', 'ordered_to_supplier')
          AND (
              (o.order_type = 'catalog' AND o.related_redemption_id IS NULL)
              OR
              (
                  o.order_type = 'reward_redemption'
                  AND r.id = o.related_redemption_id
                  AND r.fulfillment_type IN ('store_product', 'custom_physical')
              )
          )
    ) THEN
        INSERT INTO public.supplier_export_batches (
            idempotency_key,
            filename,
            created_by,
            is_legacy
        ) VALUES (
            '00000000-0000-4000-8000-202609192200',
            'legacy-pre-phase2b',
            'phase2b-migration',
            true
        )
        RETURNING id INTO v_legacy_batch_id;

        UPDATE public.store_order_items AS i
        SET supplier_export_batch_id = v_legacy_batch_id
        FROM public.store_orders AS o
        LEFT JOIN public.reward_redemptions AS r ON r.id = o.related_redemption_id
        WHERE o.id = i.order_id
          AND i.supplier_export_batch_id IS NULL
          AND o.status IN ('confirmed', 'ordered_to_supplier')
          AND (
              (o.order_type = 'catalog' AND o.related_redemption_id IS NULL)
              OR
              (
                  o.order_type = 'reward_redemption'
                  AND r.id = o.related_redemption_id
                  AND r.fulfillment_type IN ('store_product', 'custom_physical')
              )
          );
    END IF;
END;
$legacy$;

ALTER TABLE public.supplier_export_batches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.supplier_export_batches FROM PUBLIC;
REVOKE ALL ON TABLE public.supplier_export_batches FROM anon;
REVOKE ALL ON TABLE public.supplier_export_batches FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.supplier_export_batches TO service_role;

REVOKE ALL ON FUNCTION public.supplier_export_eligible_unit_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_export_eligible_unit_count() FROM anon;
REVOKE ALL ON FUNCTION public.supplier_export_eligible_unit_count() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_export_eligible_unit_count() TO service_role;

REVOKE ALL ON FUNCTION public.claim_supplier_export_batch(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_supplier_export_batch(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_supplier_export_batch(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_supplier_export_batch(uuid, text) TO service_role;
