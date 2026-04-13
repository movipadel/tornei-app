import { generateBaraondaV2 } from "./generateBaraondaV2";
import type {
  BaraondaCategory,
  BaraondaFormula,
  Participant,
  Turn,
} from "../domain/types";

type RunParticipant = {
  id: string;
  name: string;
  sex: "m" | "f";
};

type RunRules = {
  category: string;
  formula?: string | null;
  maxCourtsAvailable?: number;
};

function normalizeCategory(value: string): BaraondaCategory {
  if (value === "misto") return "misto";
  if (value === "maschile") return "maschile";
  if (value === "femminile") return "femminile";
  return "libero";
}

function normalizeFormula(value: string | null | undefined): BaraondaFormula | null {
  if (value === "snella") return "snella";
  if (value === "bilanciata") return "bilanciata";
  if (value === "estesa") return "estesa";
  if (value === "maratona") return "maratona";
  return null;
}

export function generateScheduleForAdminRun(
  participants: RunParticipant[],
  rules: RunRules
): Turn[] {
  const input = {
    category: normalizeCategory(String(rules.category ?? "libero")),
    formula: normalizeFormula(rules.formula ?? null),
    participants: participants.map(
      (p): Participant => ({
        id: p.id,
        name: p.name,
        sex: p.sex,
      })
    ),
    maxCourts: Math.max(1, Number(rules.maxCourtsAvailable ?? 1)),
  };

  const result = generateBaraondaV2(input);

  if (!result.validation.valid) {
    throw new Error(result.validation.summary || "Generazione Baraonda V2 non valida");
  }

  if (!result.audit.valid) {
    throw new Error(result.audit.errors?.[0] || "Audit Baraonda V2 non valido");
  }

  return result.turns;
}