import type {
  BuildMatchPlanResult,
  PairPlanTeam,
  PlannedMatch,
  Participant,
} from "../../domain/types";

export function buildNonMixedMatchPlan(
  teams: PairPlanTeam[]
): BuildMatchPlanResult {
  if (teams.length % 2 !== 0) {
    return {
      ok: false,
      issues: [
        {
          code: "ODD_TEAMS_COUNT",
          message:
            "Il numero di team non-misto deve essere pari per costruire i match.",
        },
      ],
    };
  }

  const opponentCounts: Record<string, Record<string, number>> = {};
  const teamVsTeamCounts: Record<string, Record<string, number>> = {};

  initializeOpponentCounts(teams, opponentCounts);
  initializeTeamVsTeamCounts(teams, teamVsTeamCounts);

  const orderedTeams = [...teams].sort((a, b) =>
    a.id.localeCompare(b.id, "it")
  );

  const result = searchMatchPlan(
    orderedTeams,
    opponentCounts,
    teamVsTeamCounts,
    [],
    { steps: 0, maxSteps: 200000 }
  );

  if (!result.ok) {
    return {
      ok: false,
      issues: [
        {
          code: "NO_MATCH_FOUND",
          message:
            result.reason ??
            "Impossibile costruire un match plan non-misto valido con il backtracking.",
        },
      ],
    };
  }

  return {
    ok: true,
    matches: result.matches,
    issues: [],
  };
}

type SearchResult =
  | {
      ok: true;
      matches: PlannedMatch[];
    }
  | {
      ok: false;
      reason?: string;
    };

function searchMatchPlan(
  remaining: PairPlanTeam[],
  opponentCounts: Record<string, Record<string, number>>,
  teamVsTeamCounts: Record<string, Record<string, number>>,
  built: PlannedMatch[],
  budget: { steps: number; maxSteps: number }
): SearchResult {
  budget.steps += 1;

  if (budget.steps > budget.maxSteps) {
    return {
      ok: false,
      reason: "Raggiunto il limite di ricerca del match plan non-misto.",
    };
  }

  if (remaining.length === 0) {
    return {
      ok: true,
      matches: built,
    };
  }

  const teamA = pickMostConstrainedTeam(
    remaining,
    opponentCounts,
    teamVsTeamCounts
  );

  const compatibleOpponents = remaining
    .filter((team) => team.id !== teamA.id && areTeamsCompatible(teamA, team))
    .map((teamB) => ({
      teamB,
      score: scoreMatch(teamA, teamB, opponentCounts, teamVsTeamCounts),
    }))
    .sort((x, y) => {
      if (x.score !== y.score) return y.score - x.score;
      return x.teamB.id.localeCompare(y.teamB.id, "it");
    });

  if (compatibleOpponents.length === 0) {
    return {
      ok: false,
      reason: `Nessun avversario compatibile trovato per ${teamA.id}.`,
    };
  }

  for (const { teamB } of compatibleOpponents) {
    const nextRemaining = remaining.filter(
      (team) => team.id !== teamA.id && team.id !== teamB.id
    );

    applyMatch(teamA, teamB, opponentCounts, teamVsTeamCounts);

    const nextBuilt: PlannedMatch[] = [
      ...built,
      {
        team1: { a: teamA.a, b: teamA.b },
        team2: { a: teamB.a, b: teamB.b },
      },
    ];

    const impossible = hasImpossibleTeam(nextRemaining);

    if (!impossible) {
      const recursive = searchMatchPlan(
        nextRemaining,
        opponentCounts,
        teamVsTeamCounts,
        nextBuilt,
        budget
      );

      if (recursive.ok) {
        return recursive;
      }
    }

    rollbackMatch(teamA, teamB, opponentCounts, teamVsTeamCounts);
  }

  return {
    ok: false,
    reason: `Tutte le scelte per ${teamA.id} portano a un dead-end.`,
  };
}

function pickMostConstrainedTeam(
  teams: PairPlanTeam[],
  opponentCounts: Record<string, Record<string, number>>,
  teamVsTeamCounts: Record<string, Record<string, number>>
): PairPlanTeam {
  const scored = teams.map((team) => {
    const compatibilityCount = teams.filter(
      (other) =>
        other.id !== team.id && areTeamsCompatible(team, other)
    ).length;

    return {
      team,
      compatibilityCount,
      pressure: criticalityScore(team, opponentCounts, teamVsTeamCounts),
    };
  });

  scored.sort((a, b) => {
    if (a.compatibilityCount !== b.compatibilityCount) {
      return a.compatibilityCount - b.compatibilityCount;
    }
    if (a.pressure !== b.pressure) {
      return b.pressure - a.pressure;
    }
    return a.team.id.localeCompare(b.team.id, "it");
  });

  return scored[0].team;
}

function hasImpossibleTeam(teams: PairPlanTeam[]): boolean {
  for (const team of teams) {
    const compatibleCount = teams.filter(
      (other) =>
        other.id !== team.id && areTeamsCompatible(team, other)
    ).length;

    if (compatibleCount === 0 && teams.length > 1) {
      return true;
    }
  }

  return false;
}

function applyMatch(
  a: PairPlanTeam,
  b: PairPlanTeam,
  opponentCounts: Record<string, Record<string, number>>,
  teamVsTeamCounts: Record<string, Record<string, number>>
): void {
  const teamAPlayers = [a.a, a.b];
  const teamBPlayers = [b.a, b.b];

  for (const pa of teamAPlayers) {
    for (const pb of teamBPlayers) {
      opponentCounts[pa.id][pb.id] += 1;
      opponentCounts[pb.id][pa.id] += 1;
    }
  }

  teamVsTeamCounts[a.id][b.id] += 1;
  teamVsTeamCounts[b.id][a.id] += 1;
}

function rollbackMatch(
  a: PairPlanTeam,
  b: PairPlanTeam,
  opponentCounts: Record<string, Record<string, number>>,
  teamVsTeamCounts: Record<string, Record<string, number>>
): void {
  const teamAPlayers = [a.a, a.b];
  const teamBPlayers = [b.a, b.b];

  for (const pa of teamAPlayers) {
    for (const pb of teamBPlayers) {
      opponentCounts[pa.id][pb.id] -= 1;
      opponentCounts[pb.id][pa.id] -= 1;
    }
  }

  teamVsTeamCounts[a.id][b.id] -= 1;
  teamVsTeamCounts[b.id][a.id] -= 1;
}

function initializeOpponentCounts(
  teams: PairPlanTeam[],
  opponentCounts: Record<string, Record<string, number>>
): void {
  const playersById: Record<string, Participant> = {};

  for (const team of teams) {
    playersById[team.a.id] = team.a;
    playersById[team.b.id] = team.b;
  }

  const players = Object.values(playersById);

  for (const p of players) {
    opponentCounts[p.id] = {};
  }

  for (const a of players) {
    for (const b of players) {
      if (a.id === b.id) continue;
      opponentCounts[a.id][b.id] = 0;
    }
  }
}

function initializeTeamVsTeamCounts(
  teams: PairPlanTeam[],
  teamVsTeamCounts: Record<string, Record<string, number>>
): void {
  for (const team of teams) {
    teamVsTeamCounts[team.id] = {};
  }

  for (const a of teams) {
    for (const b of teams) {
      if (a.id === b.id) continue;
      teamVsTeamCounts[a.id][b.id] = 0;
    }
  }
}

function areTeamsCompatible(a: PairPlanTeam, b: PairPlanTeam): boolean {
  const idsA = [a.a.id, a.b.id];
  const idsB = [b.a.id, b.b.id];
  return !idsA.some((id) => idsB.includes(id));
}

function criticalityScore(
  team: PairPlanTeam,
  opponentCounts: Record<string, Record<string, number>>,
  teamVsTeamCounts: Record<string, Record<string, number>>
): number {
  const players = [team.a, team.b];

  let repeatedOpponentPressure = 0;
  let seenTeamPressure = 0;

  for (const p of players) {
    const counts = Object.values(opponentCounts[p.id] ?? {});
    repeatedOpponentPressure += counts.reduce((sum, value) => sum + value, 0);
  }

  const teamCounts = Object.values(teamVsTeamCounts[team.id] ?? {});
  seenTeamPressure += teamCounts.reduce((sum, value) => sum + value, 0);

  return repeatedOpponentPressure * 10 + seenTeamPressure;
}

function scoreMatch(
  a: PairPlanTeam,
  b: PairPlanTeam,
  opponentCounts: Record<string, Record<string, number>>,
  teamVsTeamCounts: Record<string, Record<string, number>>
): number {
  let score = 0;

  const teamRematchCount = teamVsTeamCounts[a.id]?.[b.id] ?? 0;

  if (teamRematchCount === 0) score += 8000;
  else score -= 12000 * teamRematchCount;

  const teamAPlayers = [a.a, a.b];
  const teamBPlayers = [b.a, b.b];

  for (const pa of teamAPlayers) {
    for (const pb of teamBPlayers) {
      const count = opponentCounts[pa.id]?.[pb.id] ?? 0;

      if (count === 0) score += 2500;
      else score -= 3000 * count;
    }
  }

  const seed = `${a.id}|${b.id}`;
  score += deterministicTieBreak(seed);

  return score;
}

function deterministicTieBreak(seed: string): number {
  let acc = 0;
  for (let i = 0; i < seed.length; i++) {
    acc += seed.charCodeAt(i);
  }
  return -(acc / 100000);
}