import type { ImageProfile } from './padelleriaImageVariants';

export const PARTNER_VARIANT_BUCKET = 'movi-partners-media';
const ORIGINAL = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:jpg|png|webp)$/i;

export type PartnerVariant = { width: number; height: number; bytes: number; format: 'webp'; encoding: 'lossy' | 'lossless'; path: string };
export type PartnerManifest = { original_path: string; source_width: number; variants: PartnerVariant[] };

export function partnerImageProfile(role: 'logo' | 'cover', coverProfile: 'photo' | 'poster' = 'poster'): ImageProfile {
  return role === 'logo' ? 'logo' : coverProfile;
}

export function partnerVariantPath(partnerId: string, imageId: string, width: number): string {
  return `${partnerId}/variants/${imageId}/w${width}.webp`;
}

export function validPartnerVariants(partnerId: string, originalPath: string, manifest: PartnerManifest | null | undefined): PartnerVariant[] {
  const match = ORIGINAL.exec(originalPath);
  if (!match || match[1] !== partnerId || manifest?.original_path !== originalPath || !Array.isArray(manifest.variants)) return [];
  const imageId = match[2];
  const seen = new Set<number>();
  return manifest.variants.filter(v => {
    if (!Number.isInteger(v.width) || v.width < 1 || v.width > 1600 || seen.has(v.width) ||
        !Number.isInteger(v.height) || v.height < 1 || !Number.isInteger(v.bytes) || v.bytes < 1 ||
        v.format !== 'webp' || !['lossy', 'lossless'].includes(v.encoding) ||
        v.path !== partnerVariantPath(partnerId, imageId, v.width)) return false;
    seen.add(v.width);
    return true;
  }).sort((a, b) => a.width - b.width);
}

export function partnerImageSrcSet(originalUrl: string | null, variants: PartnerVariant[], signed: Map<string, string>, sourceWidth: number | null): string | null {
  const candidates = variants.flatMap(v => signed.get(v.path) ? [`${signed.get(v.path)} ${v.width}w`] : []);
  if (!candidates.length) return null;
  const widest = variants[variants.length - 1]?.width ?? 0;
  if (originalUrl && Number.isInteger(sourceWidth) && sourceWidth! > widest && sourceWidth! <= 10_000)
    candidates.push(`${originalUrl} ${sourceWidth}w`);
  return candidates.join(', ');
}
