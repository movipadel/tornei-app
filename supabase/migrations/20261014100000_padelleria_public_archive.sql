-- Public Padelleria archive: retained expired Succede plus explicit E successo.
BEGIN;

CREATE OR REPLACE FUNCTION public.padelleria_is_public(c public.padelleria_contents)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path=public,pg_temp
AS $$
  SELECT public.padelleria_is_visible(c)
    OR (
      c.deleted_at IS NULL
      AND c.status = 'published'
      AND c.kind = 'succede'
      AND NOT c.delete_on_expiry
      AND c.visible_until IS NOT NULL
      AND c.visible_until < statement_timestamp()
    )
$$;

DROP POLICY padelleria_public_read ON public.padelleria_contents;
CREATE POLICY padelleria_public_read ON public.padelleria_contents
FOR SELECT TO anon,authenticated
USING (public.padelleria_is_public(padelleria_contents));

DROP POLICY padelleria_media_public_read ON public.padelleria_content_media;
CREATE POLICY padelleria_media_public_read ON public.padelleria_content_media
FOR SELECT TO anon,authenticated USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.padelleria_contents c
    WHERE c.id = content_id AND public.padelleria_is_public(c)
  )
);

-- Preserve the current-feed contract while allowing limit + 1 pagination.
CREATE OR REPLACE FUNCTION public.padelleria_public_list(
  p_kind text,
  p_limit integer DEFAULT 12,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.padelleria_contents
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
  SELECT c.* FROM public.padelleria_contents c
  WHERE public.padelleria_is_visible(c) AND (p_kind IS NULL OR c.kind=p_kind)
  ORDER BY c.featured DESC,c.sort_order,c.published_at DESC,c.id
  LIMIT greatest(1,least(coalesce(p_limit,12),51))
  OFFSET greatest(0,least(coalesce(p_offset,0),10000))
$$;

CREATE FUNCTION public.padelleria_public_archive_list(
  p_limit integer DEFAULT 12,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.padelleria_contents
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
  SELECT c.*
  FROM public.padelleria_contents c
  WHERE c.deleted_at IS NULL
    AND c.status = 'published'
    AND (
      c.kind = 'e_successo'
      OR (
        c.kind = 'succede'
        AND NOT c.delete_on_expiry
        AND c.visible_until IS NOT NULL
        AND c.visible_until < statement_timestamp()
      )
    )
  ORDER BY coalesce(c.occurred_at, c.visible_until, c.published_at) DESC NULLS LAST, c.id DESC
  LIMIT greatest(1,least(coalesce(p_limit,12),51))
  OFFSET greatest(0,least(coalesce(p_offset,0),10000))
$$;

REVOKE ALL ON FUNCTION public.padelleria_is_public(public.padelleria_contents) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.padelleria_public_archive_list(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.padelleria_is_public(public.padelleria_contents) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.padelleria_public_archive_list(integer,integer) TO service_role;

COMMIT;
