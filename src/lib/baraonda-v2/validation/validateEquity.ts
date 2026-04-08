import type {
  BaraondaContext,
  Participant,
  Turn,
  ValidationIssue,
  ValidationReport,
} from "../domain/types";

type MatchesPerPlayerMap = Record<string, number>;

export function validateEquity(
  context: BaraondaContext,
  turns: Turn[],
  participants: Participant[]
): ValidationReport {
  const issues: ValidationIssue[] = [];

  const matchesPerPlayer = buildMatchesPerPlayerMap(participants);

  let totalMatches = 0;

  for (const turn of turns) {
    for (const match of turn.matches) {
      totalMatches += 1;

      for (const player of match.players) {
        matchesPerPlayer[player.id] = (matchesPerPlayer[player.id] ?? 0) + 1;
      }
    }
  }

  validateUniformMatchesPerPlayer(matchesPerPlayer, issues);
  validateExpectedMatchesPerPlayer(
    context,
    matchesPerPlayer,
    participants,
    issues
  );
  validateExpectedTotalMatches(context, totalMatches, issues);

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    summary: buildSummary(issues),
    issues,
  };
}

function buildMatchesPerPlayerMap(
  participants: Participant[]
): MatchesPerPlayerMap {
  const map: MatchesPerPlayerMap = {};

  for (const participant of participants) {
    map[participant.id] = 0;
  }

  return map;
}

function validateUniformMatchesPerPlayer(
  matchesPerPlayer: MatchesPerPlayerMap,
  issues: ValidationIssue[]
): void {
  const values = Object.values(matchesPerPlayer);

  if (values.length === 0) {
    issues.push({
      code: "EQUITY_EMPTY_PLAYERS",
      severity: "error",
      message: "Nessun giocatore disponibile per la validazione di equità.",
    });
    return;
  }

  const first = values[0];

  if (values.some((value) => value !== first)) {
    issues.push({
      code: "EQUITY_MATCHES_NOT_UNIFORM",
      severity: "error",
      message: "I giocatori non hanno tutti lo stesso numero di partite.",
    });
  }
}

function validateExpectedMatchesPerPlayer(
  context: BaraondaContext,
  matchesPerPlayer: MatchesPerPlayerMap,
  participants: Participant[],
  issues: ValidationIssue[]
): void {
  for (const participant of participants) {
    const actual = matchesPerPlayer[participant.id] ?? 0;

    if (actual !== context.matchesPerPlayer) {
      issues.push({
        code: "EQUITY_MATCHES_NOT_EXPECTED",
        severity: "error",
        message:
          `Il giocatore ${participant.name} ha ${actual} partite ` +
          `invece di ${context.matchesPerPlayer}.`,
      });
    }
  }
}

function validateExpectedTotalMatches(
  context: BaraondaContext,
  actualTotalMatches: number,
  issues: ValidationIssue[]
): void {
  if (actualTotalMatches !== context.totalMatches) {
    issues.push({
      code: "EQUITY_TOTAL_MATCHES_NOT_EXPECTED",
      severity: "error",
      message:
        `Il totale match generato è ${actualTotalMatches} ` +
        `invece di ${context.totalMatches}.`,
    });
  }
}

function buildSummary(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return "Equità valida";
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;

  return `Equità non valida: ${errors} errori, ${warnings} warning`;
}