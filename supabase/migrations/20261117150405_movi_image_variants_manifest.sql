-- Additive, server-only manifest for versioned image variants.
-- Circuit Home is the first consumer; other buckets require their own access rules.
CREATE TABLE public.movi_image_variants (
  bucket_id text NOT NULL,
  original_path text NOT NULL,
  request_id uuid NOT NULL,
  profile text NOT NULL CHECK (profile IN ('photo', 'poster', 'logo')),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_bytes integer NOT NULL CHECK (source_bytes > 0),
  source_width integer NOT NULL CHECK (source_width > 0),
  source_height integer NOT NULL CHECK (source_height > 0),
  variants jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(variants) = 'array' AND jsonb_array_length(variants) <= 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_id, original_path),
  UNIQUE (bucket_id, request_id)
);

CREATE INDEX movi_image_variants_source_lookup
  ON public.movi_image_variants(bucket_id, source_sha256, profile);

ALTER TABLE public.movi_image_variants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.movi_image_variants FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.movi_image_variants TO service_role;
