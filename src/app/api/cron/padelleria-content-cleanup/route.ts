import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { CONTENT_BUCKET, PRIVATE_VARIANT_BUCKET, ownedPath, ownedVariantPath } from "@/lib/padelleria";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClaimedContent = { content_id: string };
type StoredMedia = { id: string; content_id: string; storage_path: string | null; variants: unknown };

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const value = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !value) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(value);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: claimed, error: claimError } = await sb.rpc("padelleria_claim_expired_contents", { p_limit: 25 });
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });

  const ids = [...new Set(((claimed ?? []) as ClaimedContent[]).map((item) => item.content_id))];
  if (!ids.length) return NextResponse.json({ ok: true, claimed: 0, purged: 0, skipped: 0, failed: 0 });

  const { data: media, error: mediaError } = await sb
    .from("padelleria_content_media")
    .select("id,content_id,storage_path,variants")
    .in("content_id", ids);
  if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 });

  const pathsByContent = new Map<string, StoredMedia[]>();
  for (const item of (media ?? []) as StoredMedia[]) {
    const paths = pathsByContent.get(item.content_id) ?? [];
    paths.push(item);
    pathsByContent.set(item.content_id, paths);
  }

  let purged = 0;
  let skipped = 0;
  const failures: Array<{ content_id: string; error: string }> = [];

  for (const contentId of ids) {
    const storedMedia = pathsByContent.get(contentId) ?? [];
    const unsafePath = storedMedia.find((item) =>
      (item.storage_path !== null && !ownedPath(contentId, item.storage_path)) ||
      !Array.isArray(item.variants) || item.variants.some((variant) =>
        !variant || typeof variant !== "object" ||
        typeof variant.path !== "string" || !ownedVariantPath(contentId, item.id, variant.path)),
    );
    if (unsafePath) {
      failures.push({ content_id: contentId, error: "Percorso media non appartenente al contenuto" });
      continue;
    }

    const variantPaths = [...new Set(storedMedia.flatMap((item) =>
      (item.variants as Array<{ path: string }>).map((variant) => variant.path),
    ))];
    if (variantPaths.length) {
      const cleanup = await sb.storage.from(PRIVATE_VARIANT_BUCKET).remove(variantPaths);
      if (cleanup.error) {
        failures.push({ content_id: contentId, error: cleanup.error.message });
        continue;
      }
    }
    const ownedPaths = [...new Set(storedMedia.flatMap((item) => item.storage_path ? [item.storage_path] : []))];
    if (ownedPaths.length) {
      const cleanup = await sb.storage.from(CONTENT_BUCKET).remove(ownedPaths);
      if (cleanup.error) {
        failures.push({ content_id: contentId, error: cleanup.error.message });
        continue;
      }
    }

    const { data: removed, error: purgeError } = await sb.rpc("padelleria_purge_expired_content", { p_content_id: contentId });
    if (purgeError) {
      failures.push({ content_id: contentId, error: purgeError.message });
    } else if (removed === true) {
      purged += 1;
    } else {
      skipped += 1;
    }
  }

  return NextResponse.json({ ok: failures.length === 0, claimed: ids.length, purged, skipped, failed: failures.length, failures });
}
