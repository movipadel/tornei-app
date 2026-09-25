-- Additive editorial foundation. No fixtures and no changes to existing domains.
BEGIN;
CREATE TABLE public.padelleria_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('succede','e_successo')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  excerpt text NOT NULL DEFAULT '' CHECK (char_length(excerpt) <= 500),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 30000),
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN -100000 AND 100000),
  cta_label text CHECK (char_length(cta_label) BETWEEN 1 AND 100),
  cta_url text CHECK (char_length(cta_url) <= 2000 AND (cta_url ~ '^https://' OR cta_url ~ '^/[^/]')),
  occurred_at timestamptz,
  visible_from timestamptz,
  visible_until timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK ((cta_label IS NULL) = (cta_url IS NULL)),
  CHECK (visible_from IS NULL OR visible_until IS NULL OR visible_until >= visible_from),
  CHECK (kind = 'succede' OR (visible_from IS NULL AND visible_until IS NULL)),
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);
CREATE TABLE public.padelleria_content_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES public.padelleria_contents(id),
  media_type text NOT NULL CHECK (media_type IN ('image','video')),
  role text NOT NULL CHECK (role IN ('cover','gallery','video')),
  storage_path text UNIQUE,
  external_url text,
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 300),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK ((media_type = 'image' AND role IN ('cover','gallery') AND storage_path IS NOT NULL AND external_url IS NULL)
    OR (media_type = 'video' AND role = 'video' AND storage_path IS NULL AND external_url IS NOT NULL)),
  CHECK (storage_path IS NULL OR storage_path ~ ('^' || content_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')),
  CHECK (external_url IS NULL OR external_url ~ '^https://(www.youtube.com/watch\?v=[A-Za-z0-9_-]{11}|vimeo.com/[0-9]{1,12})$')
);
CREATE UNIQUE INDEX padelleria_one_cover ON public.padelleria_content_media(content_id) WHERE role='cover' AND deleted_at IS NULL;
CREATE INDEX padelleria_listing ON public.padelleria_contents(kind,status,featured DESC,sort_order,published_at DESC,id) WHERE deleted_at IS NULL;
CREATE INDEX padelleria_window ON public.padelleria_contents(visible_from,visible_until) WHERE status='published' AND kind='succede' AND deleted_at IS NULL;
CREATE INDEX padelleria_media_order ON public.padelleria_content_media(content_id,sort_order,id) WHERE deleted_at IS NULL;

CREATE FUNCTION public.padelleria_media_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.content_id<>OLD.content_id OR NEW.storage_path IS DISTINCT FROM OLD.storage_path) THEN
    RAISE EXCEPTION 'Proprietà media immutabile';
  END IF;
  PERFORM 1 FROM public.padelleria_contents WHERE id=NEW.content_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contenuto non disponibile'; END IF;
  IF TG_OP='INSERT' AND (SELECT count(*) FROM public.padelleria_content_media WHERE content_id=NEW.content_id AND deleted_at IS NULL)>=30 THEN
    RAISE EXCEPTION 'Massimo 30 media';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER padelleria_media_guard BEFORE INSERT OR UPDATE ON public.padelleria_content_media FOR EACH ROW EXECUTE FUNCTION public.padelleria_media_guard();

CREATE FUNCTION public.padelleria_touch() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  IF NEW.status='published' AND (TG_OP='INSERT' OR OLD.status='draft') THEN
    NEW.published_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER padelleria_touch BEFORE INSERT OR UPDATE ON public.padelleria_contents FOR EACH ROW EXECUTE FUNCTION public.padelleria_touch();

CREATE FUNCTION public.padelleria_is_visible(c public.padelleria_contents) RETURNS boolean
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT c.deleted_at IS NULL AND c.status='published' AND
    (c.kind='e_successo' OR ((c.visible_from IS NULL OR statement_timestamp() >= c.visible_from)
      AND (c.visible_until IS NULL OR statement_timestamp() <= c.visible_until)))
$$;
ALTER TABLE public.padelleria_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.padelleria_content_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.padelleria_contents, public.padelleria_content_media FROM anon,authenticated;
GRANT SELECT ON public.padelleria_contents, public.padelleria_content_media TO anon,authenticated;
GRANT ALL ON public.padelleria_contents, public.padelleria_content_media TO service_role;
CREATE POLICY padelleria_public_read ON public.padelleria_contents FOR SELECT TO anon,authenticated USING (public.padelleria_is_visible(padelleria_contents));
CREATE POLICY padelleria_media_public_read ON public.padelleria_content_media FOR SELECT TO anon,authenticated USING (
  deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.padelleria_contents c WHERE c.id=content_id AND public.padelleria_is_visible(c))
);
-- Service-only read model, using database clock, never a client-supplied time.
CREATE FUNCTION public.padelleria_public_list(p_kind text, p_limit integer DEFAULT 12, p_offset integer DEFAULT 0)
RETURNS SETOF public.padelleria_contents LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT c.* FROM public.padelleria_contents c WHERE public.padelleria_is_visible(c) AND (p_kind IS NULL OR c.kind=p_kind)
  ORDER BY c.featured DESC,c.sort_order,c.published_at DESC,c.id
  LIMIT greatest(1,least(coalesce(p_limit,12),50)) OFFSET greatest(0,least(coalesce(p_offset,0),10000))
$$;
REVOKE ALL ON FUNCTION public.padelleria_public_list(text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.padelleria_public_list(text,integer,integer) TO service_role;

CREATE FUNCTION public.padelleria_reorder_media(p_content_id uuid,p_ids uuid[]) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE expected integer;
BEGIN
  PERFORM 1 FROM public.padelleria_contents WHERE id=p_content_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contenuto non disponibile'; END IF;
  SELECT count(*) INTO expected FROM public.padelleria_content_media WHERE content_id=p_content_id AND deleted_at IS NULL;
  IF cardinality(p_ids) IS DISTINCT FROM expected OR (SELECT count(DISTINCT v) FROM unnest(p_ids) v) <> expected
    OR EXISTS (SELECT 1 FROM unnest(p_ids) v WHERE NOT EXISTS (SELECT 1 FROM public.padelleria_content_media m WHERE m.id=v AND m.content_id=p_content_id AND m.deleted_at IS NULL))
  THEN RAISE EXCEPTION 'Elenco media non valido: ricarica il contenuto'; END IF;
  UPDATE public.padelleria_content_media m SET sort_order=x.ordinality-1 FROM unnest(p_ids) WITH ORDINALITY x(id,ordinality) WHERE m.id=x.id;
END $$;
REVOKE ALL ON FUNCTION public.padelleria_reorder_media(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.padelleria_reorder_media(uuid,uuid[]) TO service_role;

-- Private bucket: drafts cannot be read via a guessed public URL. API signs eligible media.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('padelleria-content-media','padelleria-content-media',false,5242880,ARRAY['image/jpeg','image/png','image/webp']);
-- No browser upload/delete/read policies. Existing admin guard + service role only.
COMMIT;
