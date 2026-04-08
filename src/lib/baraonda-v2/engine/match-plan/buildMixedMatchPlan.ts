import type {
  BaraondaContext,
  BuildMatchPlanResult,
  MixedPairPlan,
  PairPlanTeam,
  PlannedMatch,
  Team,
} from "../../domain/types";

type MatchCandidate = {
  match: PlannedMatch;
  teamA: PairPlanTeam;
  teamB: PairPlanTeam;
};

export function buildMixedMatchPlan(
  context: BaraondaContext,
  pairPlan: MixedPairPlan
): BuildMatchPlanResult {
  const issues: BuildMatchPlanResult["issues"] = [];

  if (!context.isMixed) {
    return {
      ok: false,
      issues: [{ code: "NOT_MIXED", message: "Context non misto." }],
    };
  }

  let remainingTeams = [...pairPlan.teams];
  const matches: PlannedMatch[] = [];

  const opponentCounts: Record<string, Record<string, number>> = {};
  const teamVsTeamCounts: Record<string, Record<string, number>> = {};

  initializeOpponentMatrix(pairPlan.teams, opponentCounts);

  while (remainingTeams.length >= 2) {
    const round = pickBestRound(
      remainingTeams,
      opponentCounts,
      teamVsTeamCounts
    );

    if (!round || round.length === 0) {
      return {
        ok: false,
        issues: [
          ...issues,
          {
            code: "NO_VALID_ROUND",
            message: "Impossibile costruire un round valido.",
          },
        ],
      };
    }

    for (const m of round) {
      matches.push(m.match);
      registerMatch(m.teamA, m.teamB, opponentCounts, teamVsTeamCounts);
    }

    const used = new Set<string>();
    for (const m of round) {
      used.add(m.teamA.id);
      used.add(m.teamB.id);
    }

    remainingTeams = remainingTeams.filter((t) => !used.has(t.id));
  }

  return {
    ok: true,
    matches,
    issues,
  };
}

function pickBestRound(
  teams: PairPlanTeam[],
  opponentCounts: Record<string, Record<string, number>>,
  teamVsTeamCounts: Record<string, Record<string, number>>
): MatchCandidate[] | null {
  const allMatches = buildAllMatchCandidates(teams);

  let best: { round: MatchCandidate[]; score: number } | null = null;

  const combos2 = generateCombinations(allMatches, 2);

  for (const combo of combos2) {
    if (!isValidRound(combo)) continue;

    const score = scoreRound(combo, opponentCounts, teamVsTeamCounts);

    if (!best || score > best.score) {
      best = { round: combo, score };
    }
  }

  if (!best) {
    for (const m of allMatches) {
      const score = scoreRound([m], opponentCounts, teamVsTeamCounts);

      if (!best || score > best.score) {
        best = { round: [m], score };
      }
    }
  }

  return best?.round ?? null;
}

function buildAllMatchCandidates(teams: PairPlanTeam[]): MatchCandidate[] {
  const results: MatchCandidate[] = [];

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const t1 = teams[i];
      const t2 = teams[j];

      if (!canTeamsPlay(t1, t2)) continue;

      results.push({
        teamA: t1,
        teamB: t2,
        match: {
          team1: toTeam(t1),
          team2: toTeam(t2),
        },
      });
    }
  }

  return results;
}

function isValidRound(matches: MatchCandidate[]): boolean {
  const used = new Set<string>();

  for (const m of matches) {
    const ids = [
      m.teamA.a.id,
      m.teamA.b.id,
      m.teamB.a.id,
      m.teamB.b.id,
    ];

    for (const id of ids) {
      if (used.has(id)) return false;
      used.add(id);
    }
  }

  return true;
}

function scoreRound(
  matches: MatchCandidate[],
  opponentCounts: Record<string, Record<string, number>>,
  teamVsTeamCounts: Record<string, Record<string, number>>
): number {
  let score = 0;

  score += matches.length * 10000;

  for (const m of matches) {
    const repeat = getTeamVsTeamCount(
      m.teamA.id,
      m.teamB.id,
      teamVsTeamCounts
    );

    if (repeat === 0) score += 500;
    else score -= repeat * 1000;

    const oppPenalty =
      getOpponentCount(m.teamA.a.id, m.teamB.a.id, opponentCounts) +
      getOpponentCount(m.teamA.a.id, m.teamB.b.id, opponentCounts) +
      getOpponentCount(m.teamA.b.id, m.teamB.a.id, opponentCounts) +
      getOpponentCount(m.teamA.b.id, m.teamB.b.id, opponentCounts);

    score -= oppPenalty * 100;
  }

  return score;
}

function generateCombinations<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];

  function backtrack(start: number, current: T[]) {
    if (current.length === size) {
      res.push([...current]);
      return;
    }

    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return res;
}

function canTeamsPlay(t1: PairPlanTeam, t2: PairPlanTeam): boolean {
  const ids = new Set([t1.a.id, t1.b.id, t2.a.id, t2.b.id]);
  return ids.size === 4;
}

function toTeam(t: PairPlanTeam): Team {
  return {
    a: t.a,
    b: t.b,
  };
}

function initializeOpponentMatrix(
  teams: PairPlanTeam[],
  matrix: Record<string, Record<string, number>>
) {
  for (const t of teams) {
    for (const p of [t.a, t.b]) {
      if (!matrix[p.id]) matrix[p.id] = {};
    }
  }
}

function registerMatch(
  t1: PairPlanTeam,
  t2: PairPlanTeam,
  opponentCounts: Record<string, Record<string, number>>,
  teamVsTeamCounts: Record<string, Record<string, number>>
) {
  incrementTeamVsTeam(t1.id, t2.id, teamVsTeamCounts);

  incrementOpp(t1.a.id, t2.a.id, opponentCounts);
  incrementOpp(t1.a.id, t2.b.id, opponentCounts);
  incrementOpp(t1.b.id, t2.a.id, opponentCounts);
  incrementOpp(t1.b.id, t2.b.id, opponentCounts);
}

function incrementOpp(
  a: string,
  b: string,
  m: Record<string, Record<string, number>>
) {
  m[a][b] = (m[a][b] ?? 0) + 1;
  m[b][a] = (m[b][a] ?? 0) + 1;
}

function incrementTeamVsTeam(
  a: string,
  b: string,
  m: Record<string, Record<string, number>>
) {
  if (!m[a]) m[a] = {};
  if (!m[b]) m[b] = {};

  m[a][b] = (m[a][b] ?? 0) + 1;
  m[b][a] = (m[b][a] ?? 0) + 1;
}

function getOpponentCount(
  a: string,
  b: string,
  m: Record<string, Record<string, number>>
): number {
  return m[a]?.[b] ?? 0;
}

function getTeamVsTeamCount(
  a: string,
  b: string,
  m: Record<string, Record<string, number>>
): number {
  return m[a]?.[b] ?? 0;
}