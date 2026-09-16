-- PF-08B0 shared idempotency infrastructure for future server-controlled
-- Store checkout and MoviBack redemption transactions.

CREATE TABLE public.business_operation_idempotency (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation text NOT NULL,
    user_id uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT business_operation_idempotency_operation_check
        CHECK (operation = ANY (ARRAY['store_checkout'::text, 'moviback_redemption'::text])),
    CONSTRAINT business_operation_idempotency_request_hash_check
        CHECK (request_hash ~ '^[0-9a-f]{64}$'::text),
    CONSTRAINT business_operation_idempotency_status_check
        CHECK (status = ANY (ARRAY['processing'::text, 'committed'::text])),
    CONSTRAINT business_operation_idempotency_state_check
        CHECK (
            (
                status = 'processing'::text
                AND result IS NULL
                AND completed_at IS NULL
            )
            OR
            (
                status = 'committed'::text
                AND result IS NOT NULL
                AND jsonb_typeof(result) = 'object'::text
                AND completed_at IS NOT NULL
                AND completed_at >= created_at
            )
        )
);

ALTER TABLE ONLY public.business_operation_idempotency
    ADD CONSTRAINT business_operation_idempotency_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.business_operation_idempotency
    ADD CONSTRAINT business_operation_idempotency_scope_key
    UNIQUE (operation, user_id, idempotency_key);

ALTER TABLE ONLY public.business_operation_idempotency
    ADD CONSTRAINT business_operation_idempotency_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.business_operation_idempotency ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_operation_idempotency FROM PUBLIC;
REVOKE ALL ON TABLE public.business_operation_idempotency FROM anon;
REVOKE ALL ON TABLE public.business_operation_idempotency FROM authenticated;
REVOKE ALL ON TABLE public.business_operation_idempotency FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_operation_idempotency TO service_role;
