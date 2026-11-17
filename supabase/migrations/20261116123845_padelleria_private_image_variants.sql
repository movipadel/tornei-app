-- Additive private variant metadata. Existing originals and public responses remain unchanged.
BEGIN;

ALTER TABLE public.padelleria_content_media
  ADD COLUMN upload_request_id uuid,
  ADD COLUMN source_sha256 text,
  ADD COLUMN source_width integer,
  ADD COLUMN source_height integer,
  ADD COLUMN source_bytes integer,
  ADD COLUMN variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT padelleria_variant_manifest_array CHECK (jsonb_typeof(variants) = 'array'),
  ADD CONSTRAINT padelleria_source_metadata_valid CHECK (
    (source_sha256 IS NULL AND source_width IS NULL AND source_height IS NULL AND source_bytes IS NULL)
    OR (source_sha256 ~ '^[0-9a-f]{64}$' AND source_width > 0 AND source_height > 0 AND source_bytes > 0)
  );

CREATE UNIQUE INDEX padelleria_media_upload_request_unique
  ON public.padelleria_content_media(upload_request_id) WHERE upload_request_id IS NOT NULL;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('padelleria-media-variants','padelleria-media-variants',false,5242880,ARRAY['image/webp']);

-- One transaction switches a cover only after all private Storage objects exist.
CREATE FUNCTION public.padelleria_register_processed_image(
  p_content_id uuid, p_media_id uuid, p_request_id uuid, p_role text,
  p_original_path text, p_caption text, p_sort_order integer,
  p_source_sha256 text, p_source_width integer, p_source_height integer,
  p_source_bytes integer, p_variants jsonb, p_replace_media_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  existing public.padelleria_content_media%ROWTYPE;
  old_media public.padelleria_content_media%ROWTYPE;
  actual_order integer := p_sort_order;
BEGIN
  PERFORM 1 FROM public.padelleria_contents
  WHERE id = p_content_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contenuto non disponibile'; END IF;

  SELECT * INTO existing FROM public.padelleria_content_media
  WHERE upload_request_id = p_request_id;
  IF FOUND THEN
    IF existing.content_id <> p_content_id OR existing.role <> p_role
      OR existing.source_sha256 <> p_source_sha256 THEN
      RAISE EXCEPTION 'Richiesta upload già usata per un altro file';
    END IF;
    RETURN existing.id;
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('cover','gallery') OR p_media_id IS NULL OR p_request_id IS NULL
    OR coalesce(p_original_path,'') !~ ('^' || p_content_id::text || '/' || p_media_id::text || '\.(jpg|png|webp)$')
    OR p_source_sha256 !~ '^[0-9a-f]{64}$'
    OR p_source_width NOT BETWEEN 1 AND 10000 OR p_source_height NOT BETWEEN 1 AND 10000
    OR p_source_width::bigint * p_source_height::bigint > 20000000
    OR p_source_bytes NOT BETWEEN 1 AND 5242880
    OR p_caption IS NULL OR char_length(p_caption) > 300
    OR jsonb_typeof(p_variants) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Metadati immagine non validi';
  END IF;
  IF jsonb_array_length(p_variants) NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Numero varianti non valido';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_variants) v
    WHERE v->>'width' IS NULL OR (v->>'width') !~ '^[1-9][0-9]{0,4}$'
      OR v->>'height' IS NULL OR (v->>'height') !~ '^[1-9][0-9]{0,4}$'
      OR v->>'bytes' IS NULL OR (v->>'bytes') !~ '^[1-9][0-9]{0,6}$'
      OR v->>'format' IS DISTINCT FROM 'webp'
      OR v->>'encoding' IS NULL OR v->>'encoding' NOT IN ('lossy','lossless')
      OR v->>'path' IS DISTINCT FROM p_content_id::text || '/' || p_media_id::text || '/w' || (v->>'width') || '.webp'
  ) OR (SELECT count(DISTINCT v->>'width') FROM jsonb_array_elements(p_variants) v) <> jsonb_array_length(p_variants)
  THEN RAISE EXCEPTION 'Percorsi varianti non validi'; END IF;

  IF p_replace_media_id IS NOT NULL THEN
    SELECT * INTO old_media FROM public.padelleria_content_media
    WHERE id = p_replace_media_id AND content_id = p_content_id AND role = p_role
      AND media_type = 'image' AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Immagine da sostituire non disponibile'; END IF;
    actual_order := old_media.sort_order;
    UPDATE public.padelleria_content_media SET deleted_at = clock_timestamp()
      WHERE id = old_media.id;
  ELSIF (SELECT count(*) FROM public.padelleria_content_media
         WHERE content_id = p_content_id AND deleted_at IS NULL) >= 30 THEN
    RAISE EXCEPTION 'Massimo 30 media per contenuto';
  END IF;

  INSERT INTO public.padelleria_content_media(
    id,content_id,media_type,role,storage_path,caption,sort_order,
    upload_request_id,source_sha256,source_width,source_height,source_bytes,variants
  ) VALUES (
    p_media_id,p_content_id,'image',p_role,p_original_path,p_caption,actual_order,
    p_request_id,p_source_sha256,p_source_width,p_source_height,p_source_bytes,p_variants
  );
  RETURN p_media_id;
END $$;

REVOKE ALL ON FUNCTION public.padelleria_register_processed_image(
  uuid,uuid,uuid,text,text,text,integer,text,integer,integer,integer,jsonb,uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.padelleria_register_processed_image(
  uuid,uuid,uuid,text,text,text,integer,text,integer,integer,integer,jsonb,uuid
) TO service_role;

COMMIT;
