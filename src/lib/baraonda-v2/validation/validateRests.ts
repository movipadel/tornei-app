import type {
  BaraondaContext,
  Participant,
  Turn,
  ValidationIssue,
  ValidationReport,
} from "../domain/types";

type RestMap = Record<string, number>;

export function validateRests(
  context: BaraondaContext,
  turns: Turn[],
  participants: Participant[]
): ValidationReport {
  const issues: ValidationIssue[] = [];

  const restMap = buildRestMap(participants);

  for (const turn of turns) {
    for (const player of turn.resting) {
      restMap[player.id] = (restMap[player.id] ?? 0) + 1;
    }
  }

  validateRestUniformity(restMap, issues);
  validateRestSpread(restMap, issues);

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    summary: buildSummary(issues),
    issues,
  };
}

function buildRestMap(participants: Participant[]): RestMap {
  const map: RestMap = {};

  for (const p of participants) {
    map[p.id] = 0;
  }

  return map;
}

function validateRestUniformity(
  restMap: RestMap,
  issues: ValidationIssue[]
): void {
  const values = Object.values(restMap);

  if (values.length === 0) return;

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max - min > 1) {
    issues.push({
      code: "REST_NOT_UNIFORM",
      severity: "warning",
      message: `Distribuzione riposi non uniforme (min=${min}, max=${max})`,
    });
  }
}

function validateRestSpread(
  restMap: RestMap,
  issues: ValidationIssue[]
): void {
  const values = Object.values(restMap);

  if (values.length === 0) return;

  const avg =
    values.reduce((sum, v) => sum + v, 0) / values.length;

  for (const value of values) {
    if (Math.abs(value - avg) > 2) {
      issues.push({
        code: "REST_SPREAD_TOO_HIGH",
        severity: "warning",
        message:
          "Alcuni giocatori hanno troppi o troppo pochi riposi rispetto alla media.",
      });
      return;
    }
  }
}

function buildSummary(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return "Riposi validi";
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  return `Riposi non perfetti: ${errors} errori, ${warnings} warning`;
}