const APPROVED_BACKGROUND_BY_TYPE = {
  baraonda: "/posters/backgrounds/poster-baraonda-maschile.png",
  "coppie fisse": "/posters/backgrounds/poster-coppie-maschile.png",
} as const;

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function getPosterProductionBackground(
  type: string | null | undefined,
  category: string | null | undefined
) {
  // Category-specific production backgrounds are intentionally deferred.
  void category;
  const key = normalize(type) as keyof typeof APPROVED_BACKGROUND_BY_TYPE;
  return APPROVED_BACKGROUND_BY_TYPE[key] ?? null;
}
