-- PF-08B2C10: short manual reward-delivery credential.
-- Canonical database representation: eight uppercase characters, no dash.

ALTER TABLE public.reward_redemptions
    ADD COLUMN manual_code text;

CREATE UNIQUE INDEX reward_redemptions_manual_code_unique
    ON public.reward_redemptions (manual_code)
    WHERE manual_code IS NOT NULL;

ALTER TABLE public.reward_redemptions
    ADD CONSTRAINT reward_redemptions_manual_code_format_check
        CHECK (
            manual_code IS NULL
            OR manual_code ~ '^[2-9A-HJKMNP-Z]{8}$'
        ) NOT VALID;

CREATE FUNCTION public.generate_pf08_reward_manual_code()
RETURNS text
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY DEFINER
    SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
    v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    v_code text;
    v_byte integer;
    v_attempt integer;
    v_position integer;
BEGIN
    FOR v_attempt IN 1..10 LOOP
        v_code := '';

        FOR v_position IN 1..8 LOOP
            LOOP
                v_byte := get_byte(extensions.gen_random_bytes(1), 0);
                EXIT WHEN v_byte < 248;
            END LOOP;

            v_code := v_code || substr(
                v_alphabet,
                (v_byte % length(v_alphabet)) + 1,
                1
            );
        END LOOP;

        -- Serialize only the vanishingly rare same-code candidate race. The
        -- unique index remains the final database invariant.
        PERFORM pg_advisory_xact_lock(
            hashtextextended('pf08_reward_manual_code:' || v_code, 0)
        );

        IF NOT EXISTS (
            SELECT 1
            FROM public.reward_redemptions
            WHERE manual_code = v_code
        ) THEN
            RETURN v_code;
        END IF;
    END LOOP;

    RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PF08_MANUAL_CODE_GENERATION_FAILED';
END;
$function$;

ALTER FUNCTION public.generate_pf08_reward_manual_code() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.generate_pf08_reward_manual_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_pf08_reward_manual_code() TO postgres, service_role;

-- Existing rows are backfilled without touching lifecycle, points, stock or
-- fulfillment. Rows without a QR token remain historical and nullable.
UPDATE public.reward_redemptions
SET manual_code = public.generate_pf08_reward_manual_code()
WHERE qr_token IS NOT NULL
  AND manual_code IS NULL;

ALTER TABLE public.reward_redemptions
    ALTER COLUMN manual_code
        SET DEFAULT public.generate_pf08_reward_manual_code();

ALTER TABLE public.reward_redemptions
    ADD CONSTRAINT reward_redemptions_manual_code_with_qr_check
        CHECK (qr_token IS NULL OR manual_code IS NOT NULL) NOT VALID;

ALTER TABLE public.reward_redemptions
    VALIDATE CONSTRAINT reward_redemptions_manual_code_format_check;

ALTER TABLE public.reward_redemptions
    VALIDATE CONSTRAINT reward_redemptions_manual_code_with_qr_check;

CREATE FUNCTION public.prevent_pf08_reward_manual_code_change()
RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO pg_catalog, public
AS $function$
BEGIN
    IF OLD.manual_code IS DISTINCT FROM NEW.manual_code THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'PF08_MANUAL_CODE_IMMUTABLE';
    END IF;

    RETURN NEW;
END;
$function$;

ALTER FUNCTION public.prevent_pf08_reward_manual_code_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_pf08_reward_manual_code_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER reward_redemptions_manual_code_immutable
    BEFORE UPDATE OF manual_code ON public.reward_redemptions
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_pf08_reward_manual_code_change();

-- Keep the reviewed B2R3 transaction intact and expose the new credential via
-- a small replacement wrapper. The inner function still owns all points,
-- stock, fulfillment, QR and idempotency behavior.
ALTER FUNCTION public.redeem_moviback_reward(uuid, uuid, uuid, uuid, uuid)
    RENAME TO redeem_moviback_reward_pf08b2r3;

REVOKE ALL ON FUNCTION public.redeem_moviback_reward_pf08b2r3(uuid, uuid, uuid, uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_moviback_reward_pf08b2r3(uuid, uuid, uuid, uuid, uuid)
    TO postgres, service_role;

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
    v_result jsonb;
    v_redemption_id uuid;
    v_manual_code text;
    v_status text;
BEGIN
    v_result := public.redeem_moviback_reward_pf08b2r3(
        p_user_id,
        p_idempotency_key,
        p_reward_id,
        p_store_color_id,
        p_store_size_id
    );

    BEGIN
        v_redemption_id := nullif(v_result #>> '{data,id}', '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'PF08_INVALID_REDEMPTION';
    END;

    SELECT manual_code, status
    INTO v_manual_code, v_status
    FROM public.reward_redemptions
    WHERE id = v_redemption_id;

    IF NOT FOUND OR v_manual_code IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'PF08_MANUAL_CODE_GENERATION_FAILED';
    END IF;

    v_result := jsonb_set(
        v_result,
        '{data,manual_code}',
        to_jsonb(v_manual_code),
        true
    );

    v_result := jsonb_set(
        v_result,
        '{data,manual_code_deliverable}',
        to_jsonb(v_status = 'ready'),
        true
    );

    RETURN v_result;
END;
$function$;

ALTER FUNCTION public.redeem_moviback_reward(uuid, uuid, uuid, uuid, uuid)
    OWNER TO postgres;

REVOKE ALL ON FUNCTION public.redeem_moviback_reward(uuid, uuid, uuid, uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_moviback_reward(uuid, uuid, uuid, uuid, uuid)
    TO postgres, service_role;
