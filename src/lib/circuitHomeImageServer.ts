import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CIRCUIT_HOME_BUCKET, circuitHomePathFromUrl, circuitHomeSrcSet, type CircuitImageManifest } from '@/lib/circuitHomeImageVariants';

export async function circuitHomeSrcSets(
  sb: SupabaseClient,
  circuits: Array<{ home_image_url: string | null }>,
): Promise<Map<string, string>> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const result = new Map<string, string>();
  if (!baseUrl) return result;
  const paths = [...new Set(circuits.flatMap(circuit => {
    const path = circuitHomePathFromUrl(circuit.home_image_url, baseUrl);
    return path ? [path] : [];
  }))];
  if (!paths.length) return result;
  const { data, error } = await sb.from('movi_image_variants')
    .select('original_path,source_width,variants')
    .eq('bucket_id', CIRCUIT_HOME_BUCKET).in('original_path', paths);
  // Historical circuits remain readable even if the optional manifest lookup fails.
  if (error) return result;
  const manifests = new Map((data ?? []).map(row => [row.original_path, row as CircuitImageManifest]));
  for (const circuit of circuits) {
    if (!circuit.home_image_url) continue;
    const path = circuitHomePathFromUrl(circuit.home_image_url, baseUrl);
    if (!path) continue;
    const srcSet = circuitHomeSrcSet(circuit.home_image_url, manifests.get(path), baseUrl);
    if (srcSet) result.set(circuit.home_image_url, srcSet);
  }
  return result;
}
