import { createHash } from "node:crypto";

export const MONDAY_LEAGUE_GENERATOR_VERSION = "circle-ha-v1" as const;

export type GeneratedMatch = {
  homeTeamId: string;
  awayTeamId: string;
};

export type GeneratedRound = {
  roundNumber: number;
  byeTeamId: string | null;
  matches: GeneratedMatch[];
};

export type TeamHomeAwayQuality = {
  teamId: string;
  homeCount: number;
  awayCount: number;
  difference: number;
  maxSameSideStreak: number;
  doubleStreakCount: number;
  triplePlusStreakCount: number;
  alternationPercentage: number;
};

export type HomeAwayQualityReport = {
  teams: TeamHomeAwayQuality[];
  totalDoubleStreaks: number;
  totalTriplePlusStreaks: number;
  maxStreak: number;
  alternationPercentage: number;
  invariantViolations: string[];
};

export type MondayLeagueGeneration = {
  phaseId: string;
  algorithmVersion: typeof MONDAY_LEAGUE_GENERATOR_VERSION;
  orderedTeamIds: string[];
  tieBreakOrder: string[];
  rounds: GeneratedRound[];
  matchCount: number;
  hasByes: boolean;
  quality: HomeAwayQualityReport;
  fingerprint: string;
  fingerprintPayload: string;
};

type Pair = readonly [number, number];
type Orientation = boolean[][];

function assertInput(phaseId: string, orderedTeamIds: string[]) {
  if (!phaseId.trim()) throw new Error("phaseId obbligatorio");
  if (orderedTeamIds.length < 2 || orderedTeamIds.length > 16) {
    throw new Error("Servono da 2 a 16 squadre");
  }
  if (orderedTeamIds.some((id) => !id.trim())) {
    throw new Error("ID squadra non valido");
  }
  if (new Set(orderedTeamIds).size !== orderedTeamIds.length) {
    throw new Error("La lista squadre contiene duplicati");
  }
}

function circlePairings(teamCount: number) {
  const positions: Array<number | null> = Array.from(
    { length: teamCount },
    (_, index) => index
  );
  if (teamCount % 2 === 1) positions.push(null);

  const rounds: Array<{ pairs: Pair[]; byeIndex: number | null }> = [];
  let rotating = [...positions];

  for (let roundIndex = 0; roundIndex < positions.length - 1; roundIndex += 1) {
    const pairs: Pair[] = [];
    let byeIndex: number | null = null;

    for (let index = 0; index < positions.length / 2; index += 1) {
      const left = rotating[index];
      const right = rotating[positions.length - 1 - index];
      if (left === null || right === null) {
        byeIndex = left ?? right;
      } else {
        pairs.push([left, right]);
      }
    }

    rounds.push({ pairs, byeIndex });
    rotating = [rotating[0], rotating[rotating.length - 1], ...rotating.slice(1, -1)];
  }

  return rounds;
}

function emptyOrientation(teamCount: number): Orientation {
  return Array.from({ length: teamCount }, () => Array(teamCount).fill(false));
}

function setHome(orientation: Orientation, home: number, away: number) {
  orientation[home][away] = true;
  orientation[away][home] = false;
}

function evenOrientation(rounds: ReturnType<typeof circlePairings>, teamCount: number) {
  const orientation = emptyOrientation(teamCount);
  rounds.forEach((round, roundIndex) => {
    round.pairs.forEach(([left, right], pairIndex) => {
      const flip = pairIndex === 0 ? roundIndex % 2 === 1 : pairIndex % 2 === 1;
      setHome(orientation, flip ? right : left, flip ? left : right);
    });
  });
  return orientation;
}

function oddBalancedOrientation(teamCount: number) {
  const orientation = emptyOrientation(teamCount);
  const half = (teamCount - 1) / 2;
  for (let left = 0; left < teamCount; left += 1) {
    for (let right = left + 1; right < teamCount; right += 1) {
      const clockwise = (right - left + teamCount) % teamCount;
      if (clockwise <= half) setHome(orientation, left, right);
      else setHome(orientation, right, left);
    }
  }
  return orientation;
}

function orientedRounds(
  rawRounds: ReturnType<typeof circlePairings>,
  orientation: Orientation,
  orderedTeamIds: string[]
): GeneratedRound[] {
  return rawRounds.map((round, index) => ({
    roundNumber: index + 1,
    byeTeamId: round.byeIndex === null ? null : orderedTeamIds[round.byeIndex],
    matches: round.pairs.map(([left, right]) =>
      orientation[left][right]
        ? { homeTeamId: orderedTeamIds[left], awayTeamId: orderedTeamIds[right] }
        : { homeTeamId: orderedTeamIds[right], awayTeamId: orderedTeamIds[left] }
    ),
  }));
}

function qualityForRounds(rounds: GeneratedRound[], orderedTeamIds: string[]): HomeAwayQualityReport {
  const sides = new Map<string, Array<"H" | "A">>(
    orderedTeamIds.map((teamId) => [teamId, []])
  );
  const violations: string[] = [];
  const pairKeys = new Set<string>();

  for (const round of rounds) {
    const seen = new Set<string>();
    for (const match of round.matches) {
      if (match.homeTeamId === match.awayTeamId) violations.push(`round_${round.roundNumber}:same_team`);
      if (seen.has(match.homeTeamId) || seen.has(match.awayTeamId)) {
        violations.push(`round_${round.roundNumber}:team_repeated`);
      }
      seen.add(match.homeTeamId);
      seen.add(match.awayTeamId);
      sides.get(match.homeTeamId)?.push("H");
      sides.get(match.awayTeamId)?.push("A");
      const pairKey = [match.homeTeamId, match.awayTeamId].sort().join(":");
      if (pairKeys.has(pairKey)) violations.push(`duplicate_pair:${pairKey}`);
      pairKeys.add(pairKey);
    }
  }

  let totalDoubleStreaks = 0;
  let totalTriplePlusStreaks = 0;
  let globalMaxStreak = 1;
  let totalAlternations = 0;
  let totalOpportunities = 0;

  const teams = orderedTeamIds.map((teamId) => {
    const sequence = sides.get(teamId) ?? [];
    const homeCount = sequence.filter((side) => side === "H").length;
    const awayCount = sequence.length - homeCount;
    let maxSameSideStreak = sequence.length ? 1 : 0;
    let streak = sequence.length ? 1 : 0;
    let doubleStreakCount = 0;
    let triplePlusStreakCount = 0;
    let alternations = 0;

    for (let index = 1; index < sequence.length; index += 1) {
      totalOpportunities += 1;
      if (sequence[index] === sequence[index - 1]) {
        streak += 1;
        doubleStreakCount += 1;
        if (streak >= 3) triplePlusStreakCount += 1;
      } else {
        streak = 1;
        alternations += 1;
        totalAlternations += 1;
      }
      maxSameSideStreak = Math.max(maxSameSideStreak, streak);
    }

    totalDoubleStreaks += doubleStreakCount;
    totalTriplePlusStreaks += triplePlusStreakCount;
    globalMaxStreak = Math.max(globalMaxStreak, maxSameSideStreak);

    const expectedDifference = orderedTeamIds.length % 2 === 0 ? 1 : 0;
    if (Math.abs(homeCount - awayCount) !== expectedDifference) {
      violations.push(`home_away_balance:${teamId}`);
    }

    return {
      teamId,
      homeCount,
      awayCount,
      difference: homeCount - awayCount,
      maxSameSideStreak,
      doubleStreakCount,
      triplePlusStreakCount,
      alternationPercentage:
        sequence.length <= 1 ? 100 : Number(((alternations / (sequence.length - 1)) * 100).toFixed(1)),
    };
  });

  return {
    teams,
    totalDoubleStreaks,
    totalTriplePlusStreaks,
    maxStreak: globalMaxStreak,
    alternationPercentage:
      totalOpportunities === 0
        ? 100
        : Number(((totalAlternations / totalOpportunities) * 100).toFixed(1)),
    invariantViolations: violations,
  };
}

function qualityTuple(report: HomeAwayQualityReport) {
  return [
    report.totalTriplePlusStreaks,
    report.maxStreak,
    report.totalDoubleStreaks,
    -report.alternationPercentage,
  ];
}

function compareTuple(left: number[], right: number[]) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function flipEdges(orientation: Orientation, edges: Pair[]) {
  for (const [left, right] of edges) {
    orientation[left][right] = !orientation[left][right];
    orientation[right][left] = !orientation[right][left];
  }
}

function optimizeOddOrientation(
  rawRounds: ReturnType<typeof circlePairings>,
  orderedTeamIds: string[],
  orientation: Orientation
) {
  const teamCount = orderedTeamIds.length;
  let current = qualityForRounds(orientedRounds(rawRounds, orientation, orderedTeamIds), orderedTeamIds);

  for (let iteration = 0; iteration < 128; iteration += 1) {
    let bestEdges: Pair[] | null = null;
    let best = current;

    const consider = (edges: Pair[]) => {
      flipEdges(orientation, edges);
      const candidate = qualityForRounds(
        orientedRounds(rawRounds, orientation, orderedTeamIds),
        orderedTeamIds
      );
      flipEdges(orientation, edges);
      if (compareTuple(qualityTuple(candidate), qualityTuple(best)) < 0) {
        best = candidate;
        bestEdges = edges.map(([left, right]) => [left, right] as Pair);
      }
    };

    for (let a = 0; a < teamCount; a += 1) {
      for (let b = a + 1; b < teamCount; b += 1) {
        for (let c = b + 1; c < teamCount; c += 1) {
          const clockwise = orientation[a][b] && orientation[b][c] && orientation[c][a];
          const counter = orientation[b][a] && orientation[c][b] && orientation[a][c];
          if (clockwise || counter) consider([[a, b], [b, c], [c, a]]);
        }
      }
    }

    for (let a = 0; a < teamCount; a += 1) {
      for (let b = 0; b < teamCount; b += 1) {
        for (let c = 0; c < teamCount; c += 1) {
          for (let d = 0; d < teamCount; d += 1) {
            if (a === b || a === c || a === d || b === c || b === d || c === d) continue;
            if (a !== Math.min(a, b, c, d)) continue;
            if (orientation[a][b] && orientation[b][c] && orientation[c][d] && orientation[d][a]) {
              consider([[a, b], [b, c], [c, d], [d, a]]);
            }
          }
        }
      }
    }

    if (!bestEdges) break;
    flipEdges(orientation, bestEdges);
    current = best;
  }
}

function stableTieBreakOrder(phaseId: string, orderedTeamIds: string[]) {
  return [...orderedTeamIds].sort((left, right) => {
    const leftHash = createHash("sha256").update(`tie-break|${phaseId}|${left}`).digest("hex");
    const rightHash = createHash("sha256").update(`tie-break|${phaseId}|${right}`).digest("hex");
    return leftHash.localeCompare(rightHash) || left.localeCompare(right);
  });
}

export function generateMondayLeaguePhase1(
  phaseId: string,
  orderedTeamIds: string[]
): MondayLeagueGeneration {
  assertInput(phaseId, orderedTeamIds);
  const rawRounds = circlePairings(orderedTeamIds.length);
  const orientation =
    orderedTeamIds.length % 2 === 0
      ? evenOrientation(rawRounds, orderedTeamIds.length)
      : oddBalancedOrientation(orderedTeamIds.length);

  if (orderedTeamIds.length % 2 === 1) {
    optimizeOddOrientation(rawRounds, orderedTeamIds, orientation);
  }

  const rounds = orientedRounds(rawRounds, orientation, orderedTeamIds);
  const quality = qualityForRounds(rounds, orderedTeamIds);
  const tieBreakOrder = stableTieBreakOrder(phaseId, orderedTeamIds);
  const fingerprintPayload = {
    phaseId,
    algorithmVersion: MONDAY_LEAGUE_GENERATOR_VERSION,
    orderedTeamIds,
    tieBreakOrder,
    rounds,
  };
  const canonicalFingerprintPayload = JSON.stringify(fingerprintPayload);
  const fingerprint = createHash("sha256")
    .update(canonicalFingerprintPayload)
    .digest("hex");

  return {
    phaseId,
    algorithmVersion: MONDAY_LEAGUE_GENERATOR_VERSION,
    orderedTeamIds: [...orderedTeamIds],
    tieBreakOrder,
    rounds,
    matchCount: rounds.reduce((sum, round) => sum + round.matches.length, 0),
    hasByes: orderedTeamIds.length % 2 === 1,
    quality,
    fingerprint,
    fingerprintPayload: canonicalFingerprintPayload,
  };
}
