import {
  MIXED_FORMULA_MATCHES_PER_PLAYER,
  NON_MIXED_FORMULA_MATCHES_PER_PLAYER,
} from "../domain/formats";
import type { BaraondaFormula } from "../domain/types";

export type BaraondaUiFormulaOption = {
  value: BaraondaFormula;
  label: string;
  matchesPerPlayer: number;
  totalMatches: number;
};

function toFormulaLabel(value: BaraondaFormula): string {
  if (value === "snella") return "Snella";
  if (value === "bilanciata") return "Bilanciata";
  if (value === "estesa") return "Estesa";
  return "Maratona";
}

export function getBaraondaFormulaOptionsV2(params: {
  players: number;
  category: string;
}): BaraondaUiFormulaOption[] {
  const players = Number(params.players || 0);
  const category = String(params.category ?? "libero").toLowerCase();

  const rawMap =
    category === "misto"
      ? MIXED_FORMULA_MATCHES_PER_PLAYER[Math.floor(players / 2)] ?? {}
      : NON_MIXED_FORMULA_MATCHES_PER_PLAYER[players] ?? {};

  return Object.entries(rawMap).map(([formula, matchesPerPlayer]) => ({
    value: formula as BaraondaFormula,
    label: toFormulaLabel(formula as BaraondaFormula),
    matchesPerPlayer: Number(matchesPerPlayer),
    totalMatches: (players * Number(matchesPerPlayer)) / 4,
  }));
}

export function getDefaultBaraondaFormulaV2(params: {
  players: number;
  category: string;
}): BaraondaFormula | "" {
  const options = getBaraondaFormulaOptionsV2(params);
  if (!options.length) return "";
  if (options.some((o) => o.value === "bilanciata")) return "bilanciata";
  return options[0]?.value ?? "";
}