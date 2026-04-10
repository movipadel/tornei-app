// src/lib/baraonda/options.ts

export type BaraondaFormulaLabel =
  | "snella"
  | "bilanciata"
  | "estesa"
  | "maratona";

export type BaraondaOption = {
  matchesPerPlayer: number;
  totalMatches: number;
  label: BaraondaFormulaLabel;
  recommended?: boolean;
};

type BaraondaOptionsMap = Record<number, BaraondaOption[]>;

export const BARAONDA_NON_MISTO: BaraondaOptionsMap = {
  6: [
    { matchesPerPlayer: 4, totalMatches: 6, label: "snella", recommended: true },
    { matchesPerPlayer: 6, totalMatches: 9, label: "estesa" },
  ],
  7: [
    { matchesPerPlayer: 4, totalMatches: 7, label: "snella", recommended: true },
    { matchesPerPlayer: 8, totalMatches: 14, label: "estesa" },
  ],
  11: [
    { matchesPerPlayer: 4, totalMatches: 11, label: "snella" },
    { matchesPerPlayer: 8, totalMatches: 22, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 12, totalMatches: 33, label: "estesa" },
  ],
  12: [
    { matchesPerPlayer: 6, totalMatches: 18, label: "snella" },
    { matchesPerPlayer: 8, totalMatches: 24, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 10, totalMatches: 30, label: "estesa" },
  ],
  13: [
    { matchesPerPlayer: 8, totalMatches: 26, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 12, totalMatches: 39, label: "estesa" },
    { matchesPerPlayer: 16, totalMatches: 52, label: "maratona" },
  ],
  14: [
    { matchesPerPlayer: 6, totalMatches: 21, label: "snella" },
    { matchesPerPlayer: 8, totalMatches: 28, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 10, totalMatches: 35, label: "estesa" },
  ],
  15: [
    { matchesPerPlayer: 4, totalMatches: 15, label: "snella" },
    { matchesPerPlayer: 8, totalMatches: 30, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 12, totalMatches: 45, label: "estesa" },
  ],
  16: [
    { matchesPerPlayer: 6, totalMatches: 24, label: "snella" },
    { matchesPerPlayer: 8, totalMatches: 32, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 10, totalMatches: 40, label: "estesa" },
  ],
  17: [
    { matchesPerPlayer: 8, totalMatches: 34, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 12, totalMatches: 51, label: "estesa" },
    { matchesPerPlayer: 16, totalMatches: 68, label: "maratona" },
  ],
  18: [
    { matchesPerPlayer: 8, totalMatches: 36, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 10, totalMatches: 45, label: "estesa" },
    { matchesPerPlayer: 12, totalMatches: 54, label: "maratona" },
  ],
  19: [
    { matchesPerPlayer: 8, totalMatches: 38, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 12, totalMatches: 57, label: "estesa" },
    { matchesPerPlayer: 16, totalMatches: 76, label: "maratona" },
  ],
  20: [
    { matchesPerPlayer: 8, totalMatches: 40, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 10, totalMatches: 50, label: "estesa" },
    { matchesPerPlayer: 12, totalMatches: 60, label: "maratona" },
  ],
  21: [
    { matchesPerPlayer: 8, totalMatches: 42, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 12, totalMatches: 63, label: "estesa" },
    { matchesPerPlayer: 16, totalMatches: 84, label: "maratona" },
  ],
  22: [
    { matchesPerPlayer: 8, totalMatches: 44, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 10, totalMatches: 55, label: "estesa" },
    { matchesPerPlayer: 12, totalMatches: 66, label: "maratona" },
  ],
  23: [
    { matchesPerPlayer: 8, totalMatches: 46, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 12, totalMatches: 69, label: "estesa" },
    { matchesPerPlayer: 16, totalMatches: 92, label: "maratona" },
  ],
  24: [
    { matchesPerPlayer: 8, totalMatches: 48, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 10, totalMatches: 60, label: "estesa" },
    { matchesPerPlayer: 12, totalMatches: 72, label: "maratona" },
  ],
};

export const BARAONDA_MISTO: BaraondaOptionsMap = {
  14: [
    { matchesPerPlayer: 4, totalMatches: 14, label: "snella" },
    { matchesPerPlayer: 6, totalMatches: 21, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 8, totalMatches: 28, label: "estesa" },
  ],
  16: [
    { matchesPerPlayer: 4, totalMatches: 16, label: "snella" },
    { matchesPerPlayer: 6, totalMatches: 24, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 8, totalMatches: 32, label: "estesa" },
  ],
  18: [
    { matchesPerPlayer: 6, totalMatches: 27, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 8, totalMatches: 36, label: "estesa" },
    { matchesPerPlayer: 10, totalMatches: 45, label: "maratona" },
  ],
  20: [
    { matchesPerPlayer: 6, totalMatches: 30, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 8, totalMatches: 40, label: "estesa" },
    { matchesPerPlayer: 10, totalMatches: 50, label: "maratona" },
  ],
  22: [
    { matchesPerPlayer: 6, totalMatches: 33, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 8, totalMatches: 44, label: "estesa" },
    { matchesPerPlayer: 10, totalMatches: 55, label: "maratona" },
  ],
  24: [
    { matchesPerPlayer: 6, totalMatches: 36, label: "bilanciata", recommended: true },
    { matchesPerPlayer: 8, totalMatches: 48, label: "estesa" },
    { matchesPerPlayer: 12, totalMatches: 72, label: "maratona" },
  ],
};

export function getBaraondaOptions(players: number, category: string): BaraondaOption[] {
  if (category === "misto") return BARAONDA_MISTO[players] ?? [];
  return BARAONDA_NON_MISTO[players] ?? [];
}

export function getRecommendedBaraondaOption(players: number, category: string): BaraondaOption | null {
  const options = getBaraondaOptions(players, category);
  return options.find((o) => o.recommended) ?? options[0] ?? null;
}