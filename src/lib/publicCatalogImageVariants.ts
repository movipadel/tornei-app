import type { SupabaseClient } from '@supabase/supabase-js';

export type CatalogImageBucket = 'reward-images' | 'store-images';

export type CatalogImageManifest = {
  original_path: string;
  source_width: number;
  variants: Array<{ width: number; height: number; bytes: number; format: string; path: string }>;
};

const MANAGED_PATH = /^images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:jpg|png|webp)$/i;

export function catalogImagePath(value: unknown, bucket: CatalogImageBucket, baseUrl: string): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (MANAGED_PATH.test(value)) return value;
  try {
    const url = new URL(value);
    const base = new URL(baseUrl);
    const prefix = `/storage/v1/object/public/${bucket}/`;
    if (url.origin !== base.origin || url.search || url.hash || !url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    return MANAGED_PATH.test(path) ? path : null;
  } catch {
    return null;
  }
}

export function catalogImageUrl(path: string, bucket: CatalogImageBucket, baseUrl: string): string {
  return `${new URL(baseUrl).origin}/storage/v1/object/public/${bucket}/${path}`;
}

export function catalogImageSrcSet(
  value: string,
  manifest: CatalogImageManifest | null | undefined,
  bucket: CatalogImageBucket,
  baseUrl: string,
): string | null {
  const path = catalogImagePath(value, bucket, baseUrl);
  if (!path || !manifest || manifest.original_path !== path || !Array.isArray(manifest.variants)) return null;
  const id = MANAGED_PATH.exec(path)?.[1];
  if (!id) return null;
  const used = new Set<number>();
  const candidates = manifest.variants.flatMap(variant => {
    if (!Number.isInteger(variant.width) || variant.width < 1 || variant.width > 1600 ||
        !Number.isInteger(variant.height) || variant.height < 1 ||
        !Number.isInteger(variant.bytes) || variant.bytes < 1 ||
        variant.format !== 'webp' || variant.path !== `variants/${id}/w${variant.width}.webp` ||
        used.has(variant.width)) return [];
    used.add(variant.width);
    return [{ width: variant.width, url: catalogImageUrl(variant.path, bucket, baseUrl) }];
  }).sort((a, b) => a.width - b.width);
  if (!candidates.length) return null;
  const widest = candidates[candidates.length - 1].width;
  if (Number.isInteger(manifest.source_width) && manifest.source_width > widest && manifest.source_width <= 10_000) {
    candidates.push({ width: manifest.source_width, url: catalogImageUrl(path, bucket, baseUrl) });
  }
  return candidates.map(candidate => `${candidate.url} ${candidate.width}w`).join(', ');
}

export async function catalogImageSrcSets(
  sb: SupabaseClient,
  bucket: CatalogImageBucket,
  values: Array<string | null | undefined>,
  baseUrl: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!baseUrl) return result;
  const paths = [...new Set(values.flatMap(value => {
    const path = catalogImagePath(value, bucket, baseUrl);
    return path ? [path] : [];
  }))];
  if (!paths.length) return result;
  const { data, error } = await sb.from('movi_image_variants')
    .select('original_path,source_width,variants').eq('bucket_id', bucket).in('original_path', paths);
  if (error) return result; // Historical media and a missing manifest keep their original URL.
  const manifests = new Map((data ?? []).map(row => [row.original_path, row as CatalogImageManifest]));
  for (const value of values) {
    if (!value) continue;
    const path = catalogImagePath(value, bucket, baseUrl);
    if (!path) continue;
    const srcSet = catalogImageSrcSet(value, manifests.get(path), bucket, baseUrl);
    if (srcSet) result.set(value, srcSet);
  }
  return result;
}
