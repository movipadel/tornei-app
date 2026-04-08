export function buildSortedPairKey(a: string, b: string): string {
  return [a, b].sort().join("__");
}