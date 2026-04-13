import { generateBaraondaV2 } from "./generateBaraondaV2";
import type {
  BaraondaCategory,
  BaraondaFormula,
  Participant,
} from "../domain/types";

export type BaraondaCardPreview = {
  ok: boolean;
  formula: BaraondaFormula | null;
  formulaLabel: string;
  matchesPerPlayer: number;
  totalMatches: number;
  totalTurns: number;
  maxCourts: number;
  validationSummary: string;
};

function toFormulaLabel(value: BaraondaFormula | null): string {
  if (value === "snella") return "Snella";
  if (value === "bilanciata") return "Bilanciata";
  if (value === "estesa") return "Estesa";
  if (value === "maratona") return "Maratona";
  return "-";
}

function buildSyntheticParticipants(
  players: number,
  category: BaraondaCategory
): Participant[] {
  if (category === "misto") {
    const perSex = players / 2;
    const males: Participant[] = Array.from({ length: perSex }, (_, i) => ({
      id: `m-${i + 1}`,
      name: `M ${i + 1}`,
      sex: "m",
    }));
    const females: Participant[] = Array.from({ length: perSex }, (_, i) => ({
      id: `f-${i + 1}`,
      name: `F ${i + 1}`,
      sex: "f",
    }));
    return [...males, ...females];
  }

  return Array.from({ length: players }, (_, i) => ({
    id: `p-${i + 1}`,
    name: `P ${i + 1}`,
    sex: "m",
  }));
}

export function getBaraondaCardPreview(params: {
  players: number;
  category: string;
  formula: BaraondaFormula | "";
  maxCourts: number;
}): BaraondaCardPreview | null {
  const players = Number(params.players || 0);
  const rawCategory = String(params.category ?? "libero").toLowerCase();
  const category: BaraondaCategory =
    rawCategory === "misto"
      ? "misto"
      : rawCategory === "maschile"
      ? "maschile"
      : rawCategory === "femminile"
      ? "femminile"
      : "libero";

  const formula = (params.formula || null) as BaraondaFormula | null;
  const maxCourts = Math.max(1, Math.min(3, Math.floor(params.maxCourts || 1)));

  if (players < 4 || !formula) return null;

  const participants = buildSyntheticParticipants(players, category);
  const result = generateBaraondaV2({
    category,
    formula,
    participants,
    maxCourts,
  });

  return {
    ok: result.validation.valid && result.audit.valid,
    formula: result.context.formula,
    formulaLabel: toFormulaLabel(result.context.formula),
    matchesPerPlayer: result.context.matchesPerPlayer,
    totalMatches: result.context.totalMatches,
    totalTurns: result.turns.length,
    maxCourts,
    validationSummary: result.validation.summary,
  };
}