import type {
  BaraondaContext,
  BaraondaInput,
  GenerateBaraondaV2Result,
  Participant,
  TournamentAudit,
  ValidationReport,
} from "../domain/types";

import { buildBaraondaContext } from "./context";
import { buildMixedPairPlan } from "./pair-plan/buildMixedPairPlan";
import { buildNonMixedPairPlan } from "./pair-plan/buildNonMixedPairPlan";
import { buildMixedMatchPlan } from "./match-plan/buildMixedMatchPlan";
import { buildNonMixedMatchPlan } from "./match-plan/buildNonMixedMatchPlan";
import { packTurns } from "./packing/packTurns";
import { validateSchedule } from "../validation/validateSchedule";
import { buildTournamentAudit } from "../audit/buildTournamentAudit";
import { buildNonMixed8MaratonaTurns } from "./presets/buildNonMixed8Maratona";
import { buildNonMixed10EstesaTurns } from "./presets/buildNonMixed10Estesa";
import { buildNonMixed12EstesaTurns } from "./presets/buildNonMixed12EstesaTurns";

export function runBaraondaV2Engine(
  input: BaraondaInput
): GenerateBaraondaV2Result {
  const contextResult = buildBaraondaContext(input);

  if (!contextResult.ok) {
    const context = buildFallbackContext(input, contextResult.errors);
    const validation = buildValidationFromErrors(
      contextResult.errors,
      "Context non valido"
    );

    return {
      context,
      turns: [],
      validation,
      audit: buildEmptyAudit(validation),
    };
  }

  const context = contextResult.context;
  const participants = context.participants;

  if (context.isMixed) {
    return runMixed(context, participants);
  }

  return runNonMixed(context, participants);
}

function runNonMixed(
  context: BaraondaContext,
  participants: Participant[]
): GenerateBaraondaV2Result {
   if (
    participants.length === 8 &&
    context.formula === "maratona" &&
    context.matchesPerPlayer === 7 &&
    context.totalMatches === 14
  ) {
    const turns = buildNonMixed8MaratonaTurns(context, participants);
    const validation = validateSchedule(context, turns, participants);
    const audit = buildTournamentAudit(context, turns, validation);

    return {
      context,
      turns,
      validation,
      audit,
    };
  }

  if (
    participants.length === 10 &&
    context.formula === "estesa" &&
    context.matchesPerPlayer === 8 &&
    context.totalMatches === 20
  ) {
    const turns = buildNonMixed10EstesaTurns(context, participants);
    const validation = validateSchedule(context, turns, participants);
    const audit = buildTournamentAudit(context, turns, validation);

    return {
      context,
      turns,
      validation,
      audit,
    };
  }

    if (
    participants.length === 12 &&
    context.formula === "estesa" &&
    context.matchesPerPlayer === 10 &&
    context.totalMatches === 30
  ) {
    const turns = buildNonMixed12EstesaTurns(context, participants);
    const validation = validateSchedule(context, turns, participants);
    const audit = buildTournamentAudit(context, turns, validation);

    return {
      context,
      turns,
      validation,
      audit,
    };
  }
  
  const pairPlanResult = buildNonMixedPairPlan(context, participants);

  if (!pairPlanResult.ok || !pairPlanResult.pairPlan) {
    const validation = buildValidationFromIssues(
      pairPlanResult.issues,
      "Pair plan non-misto non valido"
    );

    return {
      context,
      turns: [],
      validation,
      audit: buildEmptyAudit(validation),
    };
  }

  const matchPlanResult = buildNonMixedMatchPlan(pairPlanResult.pairPlan.teams);

  if (!matchPlanResult.ok || !matchPlanResult.matches) {
    const validation = buildValidationFromIssues(
      matchPlanResult.issues,
      "Match plan non-misto non valido"
    );

    return {
      context,
      turns: [],
      validation,
      audit: buildEmptyAudit(validation),
    };
  }

  const packResult = packTurns(
    matchPlanResult.matches,
    participants,
    context.maxCourts,
    "non_mixed"
  );

  if (!packResult.ok || !packResult.turns) {
    const validation = buildValidationFromIssues(
      packResult.issues,
      "Packing turni non valido"
    );

    return {
      context,
      turns: [],
      validation,
      audit: buildEmptyAudit(validation),
    };
  }

  const validation = validateSchedule(context, packResult.turns, participants);
  const audit = buildTournamentAudit(context, packResult.turns, validation);

  return {
    context,
    turns: packResult.turns,
    validation,
    audit,
  };
}

function runMixed(
  context: BaraondaContext,
  participants: Participant[]
): GenerateBaraondaV2Result {
  const pairPlanResult = buildMixedPairPlan(context, participants);

  if (!pairPlanResult.ok || !pairPlanResult.pairPlan) {
    const validation = buildValidationFromIssues(
      pairPlanResult.issues,
      "Pair plan misto non valido"
    );

    return {
      context,
      turns: [],
      validation,
      audit: buildEmptyAudit(validation),
    };
  }

  const matchPlanResult = buildMixedMatchPlan(context, pairPlanResult.pairPlan);

  if (!matchPlanResult.ok || !matchPlanResult.matches) {
    const validation = buildValidationFromIssues(
      matchPlanResult.issues,
      "Match plan misto non valido"
    );

    return {
      context,
      turns: [],
      validation,
      audit: buildEmptyAudit(validation),
    };
  }

  const packResult = packTurns(
    matchPlanResult.matches,
    participants,
    context.maxCourts
  );

  if (!packResult.ok || !packResult.turns) {
    const validation = buildValidationFromIssues(
      packResult.issues,
      "Packing turni non valido"
    );

    return {
      context,
      turns: [],
      validation,
      audit: buildEmptyAudit(validation),
    };
  }

  const validation = validateSchedule(context, packResult.turns, participants);
  const audit = buildTournamentAudit(context, packResult.turns, validation);

  return {
    context,
    turns: packResult.turns,
    validation,
    audit,
  };
}

function buildValidationFromErrors(
  errors: string[],
  base: string
): ValidationReport {
  return buildValidationReport(
    errors.map((message, index) => ({
      code: `ERROR_${index + 1}`,
      severity: "error" as const,
      message,
    })),
    base
  );
}

function buildValidationFromIssues(
  issues: { code: string; message: string }[],
  base: string
): ValidationReport {
  return buildValidationReport(
    issues.map((issue) => ({
      code: issue.code,
      severity: "error" as const,
      message: issue.message,
    })),
    base
  );
}

function buildValidationReport(
  issues: { code: string; severity: "error" | "warning"; message: string }[],
  base: string
): ValidationReport {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;

  return {
    valid: errors === 0,
    summary:
      issues.length === 0
        ? base
        : `${base}: ${errors} errori, ${warnings} warning`,
    issues,
  };
}

function buildEmptyAudit(validation: ValidationReport): TournamentAudit {
  return {
    valid: validation.valid,
    errors: validation.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message),
    warnings: validation.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
    players: [],
    quality: {
      totalPartnerRepeats: 0,
      totalOpponentRepeats: 0,
      consecutiveRestViolations: 0,
    },
  };
}

function buildFallbackContext(
  input: BaraondaInput,
  errors: string[]
): BaraondaContext {
  const participants = input.participants;

  return {
    category: input.category,
    engineMode: input.category === "misto" ? "mixed" : "non_mixed",
    formula: input.formula,

    participants,
    playersCount: participants.length,

    maxCourts: Math.max(1, Math.min(3, input.maxCourts || 1)),
    autoCourts: input.autoCourts ?? false,

    isMixed: input.category === "misto",

    maleCount: participants.filter((participant) => participant.sex === "m").length,
    femaleCount: participants.filter((participant) => participant.sex === "f").length,
    perSexCount: input.category === "misto" ? participants.length / 2 : null,

    matchesPerPlayer: 0,
    totalMatches: 0,

    partnerUniqueMax: 0,
    repeatMin: 0,

    isValidMath: false,
    validationErrors: errors,
  };
}