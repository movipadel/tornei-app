import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";

import { guardOperatorPermission } from "@/lib/operatorAuthorization";
import { isUuid } from "@/lib/padelleria";
import { processPadelleriaImage } from "@/lib/padelleriaImageVariants";
import { storeAndRegisterPrivateImage } from "@/lib/padelleriaPrivateImageUpload";
import { CIRCUIT_HOME_BUCKET, circuitHomePathFromUrl } from "@/lib/circuitHomeImageVariants";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guardOperatorPermission("circuits.manage");
  if (denied) return denied;

  try {
    if (Number(req.headers.get("content-length") ?? 0) > 6 * 1024 * 1024) {
      return NextResponse.json({ error: "Richiesta troppo grande" }, { status: 413 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Immagine obbligatoria" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Immagine: massimo 5 MiB" }, { status: 413 });
    }
    const requestValue = form.get("request_id");
    const requestId = requestValue === null ? randomUUID() : String(requestValue);
    if (!isUuid(requestId)) return NextResponse.json({ error: "ID upload non valido" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const processed = await processPadelleriaImage(bytes, file.type, { profile: 'poster', signal: req.signal });
    const orientation = (await sharp(bytes).metadata()).orientation ?? 1;
    const rotated = [5, 6, 7, 8].includes(orientation);
    const displayWidth = rotated ? processed.sourceHeight : processed.sourceWidth;
    const displayHeight = rotated ? processed.sourceWidth : processed.sourceHeight;
    const sb = supabaseAdmin();
    const existing = await sb.from('movi_image_variants').select('original_path,source_sha256,profile')
      .eq('bucket_id', CIRCUIT_HOME_BUCKET).eq('request_id', requestId).maybeSingle();
    if (existing.error) throw new Error('Verifica upload non riuscita');
    if (existing.data) {
      if (existing.data.source_sha256 !== processed.sha256 || existing.data.profile !== 'poster')
        return NextResponse.json({ error: 'ID upload già utilizzato per un altro file' }, { status: 409 });
      const { data } = sb.storage.from(CIRCUIT_HOME_BUCKET).getPublicUrl(existing.data.original_path);
      return NextResponse.json({ path: existing.data.original_path, url: data.publicUrl }, { status: 200 });
    }
    const imageId = randomUUID();
    const path = `home/${imageId}.${processed.extension}`;
    const variants = processed.variants.map(variant => ({
      width: variant.width, height: variant.height, bytes: variant.bytes,
      format: variant.format, encoding: variant.encoding,
      path: `home/variants/${imageId}/w${variant.width}.webp`,
    }));
    const result = await storeAndRegisterPrivateImage({
      storage: {
        uploadOriginal: (objectPath, content, mime) => sb.storage.from(CIRCUIT_HOME_BUCKET).upload(objectPath, content, { contentType: mime, cacheControl: '31536000', upsert: false }),
        uploadVariant: (objectPath, content) => sb.storage.from(CIRCUIT_HOME_BUCKET).upload(objectPath, content, { contentType: 'image/webp', cacheControl: '31536000', upsert: false }),
        removeOriginal: paths => sb.storage.from(CIRCUIT_HOME_BUCKET).remove(paths),
        removeVariants: paths => sb.storage.from(CIRCUIT_HOME_BUCKET).remove(paths),
      },
      originalPath: path, originalBytes: bytes, originalMime: file.type,
      variants: variants.map((variant, index) => ({ path: variant.path, bytes: processed.variants[index].buffer })),
      mediaId: path, signal: req.signal,
      register: async () => {
        const inserted = await sb.from('movi_image_variants').insert({
          bucket_id: CIRCUIT_HOME_BUCKET, original_path: path, request_id: requestId,
          profile: 'poster', source_sha256: processed.sha256,
          source_bytes: processed.sourceBytes, source_width: displayWidth,
          source_height: displayHeight, variants,
        });
        if (!inserted.error) return path;
        if (inserted.error.code === '23505') {
          const winner = await sb.from('movi_image_variants').select('original_path,source_sha256,profile')
            .eq('bucket_id', CIRCUIT_HOME_BUCKET).eq('request_id', requestId).maybeSingle();
          if (!winner.error && winner.data?.source_sha256 === processed.sha256 && winner.data.profile === 'poster')
            return winner.data.original_path;
        }
        throw new Error('Registrazione immagine non riuscita');
      },
    });
    if (!result.cleanupComplete) throw new Error('Pulizia upload concorrente incompleta');
    const { data } = sb.storage.from(CIRCUIT_HOME_BUCKET).getPublicUrl(result.id);
    return NextResponse.json({ path: result.id, url: data.publicUrl }, { status: result.created ? 201 : 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Errore upload immagine";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = await guardOperatorPermission("circuits.manage");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const path = circuitHomePathFromUrl(body?.url, process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  if (!path) {
    return NextResponse.json({ error: "Immagine circuito non valida" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: managed, error: manifestError } = await sb.from('movi_image_variants')
    .select('original_path').eq('bucket_id', CIRCUIT_HOME_BUCKET).eq('original_path', path).maybeSingle();
  if (manifestError) return NextResponse.json({ error: 'Verifica immagine non riuscita' }, { status: 500 });
  // Processed originals are retained: an upload may be saved by another Admin session.
  if (managed) return NextResponse.json({ ok: true, retained: true });
  const { error } = await sb.storage.from(CIRCUIT_HOME_BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
