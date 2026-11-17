import 'server-only';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { processPadelleriaImage, type ImageProfile } from '@/lib/padelleriaImageVariants';
import { storeAndRegisterPrivateImage } from '@/lib/padelleriaPrivateImageUpload';
import { catalogImageUrl, type CatalogImageBucket } from '@/lib/publicCatalogImageVariants';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function uploadPublicCatalogImage(input: {
  file: File;
  requestId: string;
  bucket: CatalogImageBucket;
  profile: ImageProfile;
  signal?: AbortSignal;
}): Promise<{ path: string; url: string; created: boolean }> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const processed = await processPadelleriaImage(bytes, input.file.type, { profile: input.profile, signal: input.signal });
  const orientation = (await sharp(bytes).metadata()).orientation ?? 1;
  const rotated = [5, 6, 7, 8].includes(orientation);
  const sourceWidth = rotated ? processed.sourceHeight : processed.sourceWidth;
  const sourceHeight = rotated ? processed.sourceWidth : processed.sourceHeight;
  const sb = supabaseAdmin();
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!baseUrl) throw new Error('Storage non configurato');

  const existing = await sb.from('movi_image_variants').select('original_path,source_sha256,profile')
    .eq('bucket_id', input.bucket).eq('request_id', input.requestId).maybeSingle();
  if (existing.error) throw new Error('Verifica upload non riuscita');
  if (existing.data) {
    if (existing.data.source_sha256 !== processed.sha256 || existing.data.profile !== input.profile)
      throw new Error('ID upload già utilizzato per un altro file');
    return { path: existing.data.original_path, url: catalogImageUrl(existing.data.original_path, input.bucket, baseUrl), created: false };
  }

  const imageId = randomUUID();
  const path = `images/${imageId}.${processed.extension}`;
  const variants = processed.variants.map(variant => ({
    width: variant.width, height: variant.height, bytes: variant.bytes,
    format: variant.format, encoding: variant.encoding,
    path: `variants/${imageId}/w${variant.width}.webp`,
  }));
  const result = await storeAndRegisterPrivateImage({
    storage: {
      uploadOriginal: (objectPath, content, mime) => sb.storage.from(input.bucket).upload(objectPath, content, { contentType: mime, cacheControl: '31536000', upsert: false }),
      uploadVariant: (objectPath, content) => sb.storage.from(input.bucket).upload(objectPath, content, { contentType: 'image/webp', cacheControl: '31536000', upsert: false }),
      removeOriginal: paths => sb.storage.from(input.bucket).remove(paths),
      removeVariants: paths => sb.storage.from(input.bucket).remove(paths),
    },
    originalPath: path, originalBytes: bytes, originalMime: input.file.type,
    variants: variants.map((variant, index) => ({ path: variant.path, bytes: processed.variants[index].buffer })),
    mediaId: path, signal: input.signal,
    register: async () => {
      const inserted = await sb.from('movi_image_variants').insert({
        bucket_id: input.bucket, original_path: path, request_id: input.requestId,
        profile: input.profile, source_sha256: processed.sha256,
        source_bytes: processed.sourceBytes, source_width: sourceWidth,
        source_height: sourceHeight, variants,
      });
      if (!inserted.error) return path;
      if (inserted.error.code === '23505') {
        const winner = await sb.from('movi_image_variants').select('original_path,source_sha256,profile')
          .eq('bucket_id', input.bucket).eq('request_id', input.requestId).maybeSingle();
        if (!winner.error && winner.data?.source_sha256 === processed.sha256 && winner.data.profile === input.profile)
          return winner.data.original_path;
      }
      throw new Error('Registrazione immagine non riuscita');
    },
  });
  if (!result.cleanupComplete) throw new Error('Pulizia upload concorrente incompleta');
  return { path: result.id, url: catalogImageUrl(result.id, input.bucket, baseUrl), created: result.created };
}
