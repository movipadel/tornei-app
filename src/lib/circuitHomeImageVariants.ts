export const CIRCUIT_HOME_BUCKET = 'circuit-home-images';

const HOME_PATH = /^home\/([0-9a-f-]{36})\.(?:jpg|png|webp)$/i;

export type CircuitImageVariant = {
  width: number;
  height: number;
  bytes: number;
  format: 'webp';
  encoding: 'lossy' | 'lossless';
  path: string;
};

export type CircuitImageManifest = {
  original_path: string;
  source_width: number;
  variants: CircuitImageVariant[];
};

export function circuitHomePathFromUrl(value: unknown, supabaseUrl: string): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    const base = new URL(supabaseUrl);
    const prefix = `/storage/v1/object/public/${CIRCUIT_HOME_BUCKET}/`;
    if (url.origin !== base.origin || url.search || url.hash || !url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    return HOME_PATH.test(path) ? path : null;
  } catch {
    return null;
  }
}

export function circuitHomeSrcSet(
  originalUrl: string,
  manifest: CircuitImageManifest | null | undefined,
  supabaseUrl: string,
): string | null {
  const originalPath = circuitHomePathFromUrl(originalUrl, supabaseUrl);
  if (!originalPath || !manifest || manifest.original_path !== originalPath || !Array.isArray(manifest.variants)) return null;
  const imageId = HOME_PATH.exec(originalPath)?.[1];
  if (!imageId) return null;
  const used = new Set<number>();
  const candidates = manifest.variants.flatMap(variant => {
    if (!Number.isInteger(variant.width) || variant.width < 1 || variant.width > 1600 ||
        !Number.isInteger(variant.height) || variant.height < 1 ||
        !Number.isInteger(variant.bytes) || variant.bytes < 1 ||
        variant.format !== 'webp' ||
        variant.path !== `home/variants/${imageId}/w${variant.width}.webp` || used.has(variant.width)) return [];
    used.add(variant.width);
    return [{ width: variant.width, url: `${new URL(supabaseUrl).origin}/storage/v1/object/public/${CIRCUIT_HOME_BUCKET}/${variant.path}` }];
  }).sort((a, b) => a.width - b.width);
  if (!candidates.length) return null;
  const widest = candidates[candidates.length - 1].width;
  if (Number.isInteger(manifest.source_width) && manifest.source_width > widest && manifest.source_width <= 10_000) {
    candidates.push({ width: manifest.source_width, url: originalUrl });
  }
  return candidates.map(({ width, url }) => `${url} ${width}w`).join(', ');
}
