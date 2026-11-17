import 'server-only';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { processPadelleriaImage } from './padelleriaImageVariants';
import { storeAndRegisterPrivateImage } from './padelleriaPrivateImageUpload';
import { PARTNER_VARIANT_BUCKET, partnerImageProfile, partnerVariantPath } from './partnerImageVariants';
import { supabaseAdmin } from './supabaseAdmin';

export async function uploadPartnerImage(input: {
  partnerId: string;
  expectedUpdatedAt: string;
  role: 'logo' | 'cover';
  coverProfile: 'photo' | 'poster';
  requestId: string;
  file: File;
  signal?: AbortSignal;
}): Promise<{ created: boolean }> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const profile = partnerImageProfile(input.role, input.coverProfile);
  const processed = await processPadelleriaImage(bytes, input.file.type, { profile, signal: input.signal });
  const orientation = (await sharp(bytes).metadata()).orientation ?? 1;
  const rotated = [5, 6, 7, 8].includes(orientation);
  const sourceWidth = rotated ? processed.sourceHeight : processed.sourceWidth;
  const sourceHeight = rotated ? processed.sourceWidth : processed.sourceHeight;
  const sb = supabaseAdmin();
  const field: 'logo_path' | 'cover_path' = `${input.role}_path`;
  const previous = await sb.from('movi_image_variants').select('original_path,source_sha256,profile')
    .eq('bucket_id', PARTNER_VARIANT_BUCKET).eq('request_id', input.requestId).maybeSingle();
  if (previous.error) throw new Error('Verifica upload non riuscita');
  if (previous.data) {
    if (previous.data.source_sha256 !== processed.sha256 || previous.data.profile !== profile ||
        !previous.data.original_path.startsWith(`${input.partnerId}/`)) throw new Error('ID upload già utilizzato');
    const current = await sb.from('movi_partners').select('logo_path,cover_path').eq('id', input.partnerId).maybeSingle();
    if (current.error || current.data?.[field] !== previous.data.original_path) throw new Error('Partner modificato altrove: ricarica e riprova');
    return { created: false };
  }

  const imageId = randomUUID();
  const path = `${input.partnerId}/${imageId}.${processed.extension}`;
  const variants = processed.variants.map(v => ({
    width: v.width, height: v.height, bytes: v.bytes, format: v.format, encoding: v.encoding,
    path: partnerVariantPath(input.partnerId, imageId, v.width),
  }));
  const result = await storeAndRegisterPrivateImage({
    storage: {
      uploadOriginal: (objectPath, content, mime) => sb.storage.from(PARTNER_VARIANT_BUCKET).upload(objectPath, content, { contentType: mime, cacheControl: '300', upsert: false }),
      uploadVariant: (objectPath, content) => sb.storage.from(PARTNER_VARIANT_BUCKET).upload(objectPath, content, { contentType: 'image/webp', cacheControl: '300', upsert: false }),
      removeOriginal: paths => sb.storage.from(PARTNER_VARIANT_BUCKET).remove(paths),
      removeVariants: paths => sb.storage.from(PARTNER_VARIANT_BUCKET).remove(paths),
    },
    originalPath: path, originalBytes: bytes, originalMime: input.file.type,
    variants: variants.map((v, i) => ({ path: v.path, bytes: processed.variants[i].buffer })),
    mediaId: path, signal: input.signal,
    register: async () => {
      const inserted = await sb.from('movi_image_variants').insert({
        bucket_id: PARTNER_VARIANT_BUCKET, original_path: path, request_id: input.requestId,
        profile, source_sha256: processed.sha256, source_bytes: processed.sourceBytes,
        source_width: sourceWidth, source_height: sourceHeight, variants,
      });
      if (inserted.error) {
        if (inserted.error.code === '23505') throw new Error('Upload concorrente: riprova');
        throw new Error('Registrazione varianti non riuscita');
      }
      const updated = await sb.from('movi_partners').update({ [field]: path })
        .eq('id', input.partnerId).eq('updated_at', input.expectedUpdatedAt).is('deleted_at', null).select('id').maybeSingle();
      if (updated.error || !updated.data) {
        const removed = await sb.from('movi_image_variants').delete()
          .eq('bucket_id', PARTNER_VARIANT_BUCKET).eq('original_path', path);
        if (removed.error) throw new Error('Partner modificato altrove e pulizia manifest incompleta');
        throw new Error('Partner modificato altrove: ricarica e riprova');
      }
      return path;
    },
  });
  if (!result.cleanupComplete) throw new Error('Pulizia upload incompleta');
  return { created: result.created };
}
