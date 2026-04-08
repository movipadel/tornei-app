import {
  generateBaraondaSchedule as generateLegacyBaraondaSchedule,
  type BaraondaRules as LegacyBaraondaRules,
  type Participant as LegacyParticipant,
  type Turn as LegacyTurn,
  type Sex as LegacySex,
} from "./generateSchedule";

import {
  getBaraondaOptions,
  type BaraondaFormulaLabel,
} from "./options";

import {
  generateBaraondaV2,
} from "../baraonda-v2/public/generateBaraondaV2";

import type {
  BaraondaFormula as V2BaraondaFormula,
  BaraondaInput as V2BaraondaInput,
  Participant as V2Participant,
  Turn as V2Turn,
} from "../baraonda-v2/domain/types";

export type BaraondaScheduleEngine = "legacy" | "v2";

export type GenerateBaraondaScheduleSwitchOptions = {
  engine?: BaraondaScheduleEngine;
};

export function generateBaraondaScheduleSwitch(
  participants: LegacyParticipant[],
  rules: LegacyBaraondaRules,
  options: GenerateBaraondaScheduleSwitchOptions = {}
): LegacyTurn[] {
  const engine = options.engine ?? "legacy";

  if (engine === "legacy") {
    return generateLegacyBaraondaSchedule(participants, rules);
  }

  const v2Input = mapLegacyToV2Input(participants, rules);
  const v2Result = generateBaraondaV2(v2Input);

  if (!v2Result.validation.valid) {
    const details = v2Result.validation.issues
      .map((issue) => `[${issue.severity}] ${issue.code}: ${issue.message}`)
      .join(" | ");

    throw new Error(
      details
        ? `Baraonda V2 non valida: ${details}`
        : "Baraonda V2 non valida."
    );
  }

  return adaptV2TurnsToLegacy(v2Result.turns, participants);
}

function mapLegacyToV2Input(
  participants: LegacyParticipant[],
  rules: LegacyBaraondaRules
): V2BaraondaInput {
  const formula = resolveFormulaFromLegacyRules(rules);

  if (!formula) {
    throw new Error(
      "Impossibile risolvere la formula Baraonda per il motore V2."
    );
  }

  const maxCourts = normalizeMaxCourts(
    rules.maxCourtsAvailable ?? rules.matchesPerTurn ?? 1
  );

  return {
    category: rules.category,
    formula,
    participants: participants.map(mapLegacyParticipantToV2),
    maxCourts,
    autoCourts: false,
  };
}

function mapLegacyParticipantToV2(
  participant: LegacyParticipant
): V2Participant {
  return {
    id: participant.id,
    name: participant.name,
    sex: participant.sex,
  };
}

function resolveFormulaFromLegacyRules(
  rules: LegacyBaraondaRules
): V2BaraondaFormula | null {
  if (isFormulaLabel(rules.formula)) {
    return rules.formula;
  }

  const options = getBaraondaOptions(rules.players, rules.category);

  const matched = options.find(
    (option) =>
      option.matchesPerPlayer === rules.matchesPerPlayer &&
      option.totalMatches ===
        (rules.players * rules.matchesPerPlayer) / 4
  );

  return matched?.label ?? null;
}

function isFormulaLabel(
  value: LegacyBaraondaRules["formula"]
): value is BaraondaFormulaLabel {
  return (
    value === "snella" ||
    value === "bilanciata" ||
    value === "estesa" ||
    value === "maratona"
  );
}

function adaptV2TurnsToLegacy(
  turns: V2Turn[],
  fallbackParticipants: LegacyParticipant[]
): LegacyTurn[] {
  const fallbackMap = buildLegacyParticipantMap(fallbackParticipants);

  return turns.map((turn) => ({
    turnNumber: turn.turnNumber,
    matches: turn.matches.map((match) => ({
      matchNumber: match.matchNumber,
      players: [
        toLegacyParticipant(match.players[0], fallbackMap),
        toLegacyParticipant(match.players[1], fallbackMap),
        toLegacyParticipant(match.players[2], fallbackMap),
        toLegacyParticipant(match.players[3], fallbackMap),
      ],
    })),
    resting: turn.resting.map((participant) =>
      toLegacyParticipant(participant, fallbackMap)
    ),
  }));
}

function buildLegacyParticipantMap(
  participants: LegacyParticipant[]
): Record<string, LegacyParticipant> {
  const map: Record<string, LegacyParticipant> = {};

  for (const participant of participants) {
    map[participant.id] = participant;
  }

  return map;
}

function toLegacyParticipant(
  participant: V2Participant,
  fallbackMap: Record<string, LegacyParticipant>
): LegacyParticipant {
  const fallback = fallbackMap[participant.id];

  return {
    id: participant.id,
    name: participant.name,
    sex: participant.sex ?? fallback?.sex ?? ("m" as LegacySex),
  };
}

function normalizeMaxCourts(maxCourts: number): number {
  if (!Number.isFinite(maxCourts)) return 1;
  return Math.max(1, Math.min(3, Math.floor(maxCourts)));
}