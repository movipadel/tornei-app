import type {
  BaraondaCategory,
  BaraondaFormula,
} from "../domain/types";
import {
  BARAONDA_CARD_PREVIEW_DATA,
  type BaraondaCardPreviewDataEntry,
} from "./card-preview-data";

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

function normalizeCategory(raw: string): BaraondaCategory {
  const value = String(raw ?? "libero").toLowerCase();

  if (value === "misto") return "misto";
  if (value === "maschile") return "libero";
  if (value === "femminile") return "libero";
  return "libero";
}

export function getBaraondaCardPreview(params: {
  players: number;
  category: string;
  formula: BaraondaFormula | "";
  maxCourts: number;
}): BaraondaCardPreview | null {
  const players = Number(params.players || 0);
  const category = normalizeCategory(params.category);
  const formula = (params.formula || null) as BaraondaFormula | null;
  const maxCourts = Math.max(1, Math.min(3, Math.floor(params.maxCourts || 1)));

  if (players < 4 || !formula) return null;

  const entry: BaraondaCardPreviewDataEntry | undefined =
    BARAONDA_CARD_PREVIEW_DATA.find(
      (item) =>
        item.category === category &&
        item.players === players &&
        item.formula === formula &&
        item.courts === maxCourts
    );

  if (!entry) {
    return {
      ok: false,
      formula,
      formulaLabel: toFormulaLabel(formula),
      matchesPerPlayer: 0,
      totalMatches: 0,
      totalTurns: 0,
      maxCourts,
      validationSummary: "Preview non disponibile per questa configurazione.",
    };
  }

  return {
    ok: entry.valid,
    formula,
    formulaLabel: toFormulaLabel(formula),
    matchesPerPlayer: entry.matchesPerPlayer,
    totalMatches: entry.totalMatches,
    totalTurns: entry.totalTurns,
    maxCourts: entry.courts,
    validationSummary: entry.summary,
  };
}