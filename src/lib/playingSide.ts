export const playingSides = ["right", "left", "any"] as const;

export type PlayingSide = typeof playingSides[number];

export const playingSideLabels: Record<PlayingSide, string> = {
  right: "Destra",
  left: "Sinistra",
  any: "Indifferente",
};

export function isPlayingSide(value: unknown): value is PlayingSide {
  return typeof value === "string" && playingSides.includes(value as PlayingSide);
}

export function playingSideLabel(value: PlayingSide | null | undefined) {
  return value ? playingSideLabels[value] : "Non indicato";
}
