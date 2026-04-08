import type { BaraondaFormula } from "./types";

export const MIXED_FORMULA_MATCHES_PER_PLAYER: Record<
  number,
  Partial<Record<BaraondaFormula, number>>
> = {
  4: { snella: 4 },
  5: { bilanciata: 6 },
  6: { bilanciata: 6 },
  7: { snella: 4, bilanciata: 6, estesa: 8 },
  8: { snella: 4, bilanciata: 6, estesa: 8 },
  9: { bilanciata: 6, estesa: 8, maratona: 10 },
  10: { bilanciata: 6, estesa: 8, maratona: 10 },
};

export const NON_MIXED_FORMULA_MATCHES_PER_PLAYER: Record<
  number,
  Partial<Record<BaraondaFormula, number>>
> = {
  4: { maratona: 3 },
  5: { maratona: 4 },
  6: { bilanciata: 6 },
  7: { estesa: 8 },
  8: { maratona: 7 },
  9: { bilanciata: 8 },
  10: { bilanciata: 8 },

  11: { snella: 4, bilanciata: 8, estesa: 12 },
  12: { snella: 6, bilanciata: 8, estesa: 10 },
  13: { bilanciata: 8, estesa: 12, maratona: 16 },
  14: { snella: 6, bilanciata: 8, estesa: 10 },
  15: { snella: 4, bilanciata: 8, estesa: 12 },
  16: { snella: 6, bilanciata: 8, estesa: 10 },
  17: { bilanciata: 8, estesa: 12, maratona: 16 },
  18: { bilanciata: 8, estesa: 10, maratona: 12 },
  19: { bilanciata: 8, estesa: 12, maratona: 16 },
  20: { bilanciata: 8, estesa: 10, maratona: 12 },
};

export function getMixedAvailableFormulas(perSexPlayers: number): BaraondaFormula[] {
  return Object.keys(MIXED_FORMULA_MATCHES_PER_PLAYER[perSexPlayers] ?? {}) as BaraondaFormula[];
}

export function getNonMixedAvailableFormulas(players: number): BaraondaFormula[] {
  return Object.keys(NON_MIXED_FORMULA_MATCHES_PER_PLAYER[players] ?? {}) as BaraondaFormula[];
}