-- Padelleria lifecycle: opt-in permanent cleanup for expired ephemeral content.
BEGIN;

ALTER TABLE public.padelleria_contents
  ADD COLUMN delete_on_expiry boolean NOT NULL DEFAULT false;

ALTER TABLE public.padelleria_contents
  ADD CONSTRAINT padelleria_delete_on_expiry_requires_end
  CHECK (
    NOT delete_on_expiry
    OR (kind = 'succede' AND visible_until IS NOT NULL)
  );

-- Claiming is deliberately separate from public visibility reads. A claimed row
-- becomes an ordinary soft-deleted draft first, so storage cleanup can be
-- retried without exposing a half-purged content item.
CREATE FUNCTION public.padelleria_claim_expired_contents(p_limit integer DEFAULT 25)
RETURNS TABLE(content_id uuid)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  batch_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT c.id
    FROM public.padelleria_contents c
    WHERE c.kind = 'succede'
      AND c.delete_on_expiry
      AND c.visible_until IS NOT NULL
      AND c.visible_until < statement_timestamp()
      -- deleted_at doubles as a short processing lease. Failed jobs become
      -- eligible again after the lease, while overlapping workers cannot
      -- claim the same content immediately.
      AND (c.deleted_at IS NULL OR c.deleted_at < statement_timestamp() - interval '15 minutes')
    ORDER BY c.visible_until, c.id
    FOR UPDATE SKIP LOCKED
    LIMIT batch_limit
  )
  UPDATE public.padelleria_contents c
  SET status = 'draft', deleted_at = clock_timestamp()
  FROM candidates
  WHERE c.id = candidates.id
  RETURNING c.id;
END $$;

-- Called only after owned Storage objects have been removed. Media rows and the
-- content row are deleted in one database transaction. Repeating the call after
-- a successful purge returns false instead of failing.
CREATE FUNCTION public.padelleria_purge_expired_content(p_content_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM public.padelleria_contents c
  WHERE c.id = p_content_id
    AND c.kind = 'succede'
    AND c.delete_on_expiry
    AND c.visible_until IS NOT NULL
    AND c.visible_until < statement_timestamp()
    AND c.deleted_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM public.padelleria_content_media WHERE content_id = p_content_id;
  DELETE FROM public.padelleria_contents WHERE id = p_content_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.padelleria_claim_expired_contents(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.padelleria_purge_expired_content(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.padelleria_claim_expired_contents(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.padelleria_purge_expired_content(uuid) TO service_role;

COMMIT;
