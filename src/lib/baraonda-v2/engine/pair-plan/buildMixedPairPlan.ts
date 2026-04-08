import type {
  BaraondaContext,
  BuildMixedPairPlanResult,
  MixedPairPlan,
  MixedPairPlanPlayerStats,
  PairPlanTeam,
  Participant,
} from "../../domain/types";
import { buildSortedPairKey } from "../../utils/keys";

type MixedSide = {
  men: Participant[];
  women: Participant[];
};

type PairCountMatrix = Record<string, Record<string, number>>;
type AssignmentCountMap = Record<string, number>;
type RepeatCountMap = Record<string, number>;

export function buildMixedPairPlan(
  context: BaraondaContext,
  participants: Participant[]
): BuildMixedPairPlanResult {
  const issues: BuildMixedPairPlanResult["issues"] = [];

  if (!context.isMixed) {
    return {
      ok: false,
      issues: [
        {
          code: "NOT_MIXED",
          message: "Il planner misto richiede un contesto misto.",
        },
      ],
    };
  }

  if (!context.isValidMath) {
    return {
      ok: false,
      issues: [
        {
          code: "INVALID_MATH",
          message: "Configurazione matematica non valida.",
        },
      ],
    };
  }

  const split = splitMixedParticipants(participants);

  if (!split.ok) {
    return {
      ok: false,
      issues: split.issues,
    };
  }

  const { men, women } = split;

  // ✅ ramo deterministico no-repeat
  if (
    context.repeatMin === 0 &&
    context.perSexCount != null &&
    context.matchesPerPlayer <= context.perSexCount
  ) {
    const pairPlan = buildNoRepeatMixedPairPlan({
      men,
      women,
      matchesPerPlayer: context.matchesPerPlayer,
      participants,
    });

    return {
      ok: true,
      pairPlan,
      issues,
    };
  }

  // ✅ fallback greedy solo per i casi con repeat necessari
  const matchesPerPlayer = context.matchesPerPlayer;
  const targetTeamsCount = context.totalMatches * 2;

  const assignmentCounts: AssignmentCountMap = {};
  const partnerCounts: PairCountMatrix = {};
  const repeatCountByPlayer: RepeatCountMap = {};

  for (const player of participants) {
    assignmentCounts[player.id] = 0;
    partnerCounts[player.id] = {};
    repeatCountByPlayer[player.id] = 0;
  }

  const teams: PairPlanTeam[] = [];

  while (teams.length < targetTeamsCount) {
    const candidate = pickBestMixedTeamCandidate({
      men,
      women,
      assignmentCounts,
      partnerCounts,
      repeatCountByPlayer,
      matchesPerPlayer,
      repeatMin: context.repeatMin,
    });

    if (!candidate) {
      issues.push({
        code: "NO_TEAM_CANDIDATE",
        message:
          "Impossibile completare il pair plan misto con i vincoli correnti.",
      });

      return {
        ok: false,
        issues,
      };
    }

    const currentPairCount =
      partnerCounts[candidate.man.id][candidate.woman.id] ?? 0;

    if (currentPairCount >= 1) {
      repeatCountByPlayer[candidate.man.id] += 1;
      repeatCountByPlayer[candidate.woman.id] += 1;
    }

    const team: PairPlanTeam = {
      id: `team_${teams.length + 1}`,
      a: candidate.man,
      b: candidate.woman,
    };

    teams.push(team);

    assignmentCounts[candidate.man.id] += 1;
    assignmentCounts[candidate.woman.id] += 1;

    partnerCounts[candidate.man.id][candidate.woman.id] =
      (partnerCounts[candidate.man.id][candidate.woman.id] ?? 0) + 1;
    partnerCounts[candidate.woman.id][candidate.man.id] =
      (partnerCounts[candidate.woman.id][candidate.man.id] ?? 0) + 1;
  }

  const pairPlan = buildMixedPairPlanResultData(
    teams,
    participants,
    partnerCounts
  );

  const playersBelowTarget = participants.filter(
    (p) => assignmentCounts[p.id] !== matchesPerPlayer
  );

  if (playersBelowTarget.length > 0) {
    return {
      ok: false,
      issues: [
        ...issues,
        {
          code: "ASSIGNMENT_IMBALANCE",
          message:
            "Non tutti i giocatori hanno ricevuto lo stesso numero di team.",
        },
      ],
    };
  }

  return {
    ok: true,
    pairPlan,
    issues,
  };
}

function splitMixedParticipants(
  participants: Participant[]
):
  | ({ ok: true } & MixedSide)
  | { ok: false; issues: BuildMixedPairPlanResult["issues"] } {
  const men = participants
    .filter((p) => p.sex === "m")
    .sort((a, b) => a.name.localeCompare(b.name, "it"));

  const women = participants
    .filter((p) => p.sex === "f")
    .sort((a, b) => a.name.localeCompare(b.name, "it"));

  const issues: BuildMixedPairPlanResult["issues"] = [];

  if (men.length === 0 || women.length === 0) {
    issues.push({
      code: "MISSING_MIXED_SIDES",
      message: "Nel misto servono almeno un uomo e una donna.",
    });
  }

  if (men.length !== women.length) {
    issues.push({
      code: "UNBALANCED_MIXED_SIDES",
      message: "Nel misto uomini e donne devono essere in numero uguale.",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, men, women };
}

function buildNoRepeatMixedPairPlan(args: {
  men: Participant[];
  women: Participant[];
  matchesPerPlayer: number;
  participants: Participant[];
}): MixedPairPlan {
  const { men, women, matchesPerPlayer, participants } = args;

  const teams: PairPlanTeam[] = [];
  const partnerCounts: PairCountMatrix = {};

  for (const participant of participants) {
    partnerCounts[participant.id] = {};
  }

  const n = men.length;

  for (let roundIndex = 0; roundIndex < matchesPerPlayer; roundIndex += 1) {
    for (let manIndex = 0; manIndex < n; manIndex += 1) {
      const man = men[manIndex];
      const woman = women[(manIndex + roundIndex) % n];

      teams.push({
        id: `team_${teams.length + 1}`,
        a: man,
        b: woman,
      });

      partnerCounts[man.id][woman.id] =
        (partnerCounts[man.id][woman.id] ?? 0) + 1;
      partnerCounts[woman.id][man.id] =
        (partnerCounts[woman.id][man.id] ?? 0) + 1;
    }
  }

  return buildMixedPairPlanResultData(teams, participants, partnerCounts);
}

function pickBestMixedTeamCandidate(args: {
  men: Participant[];
  women: Participant[];
  assignmentCounts: AssignmentCountMap;
  partnerCounts: PairCountMatrix;
  repeatCountByPlayer: RepeatCountMap;
  matchesPerPlayer: number;
  repeatMin: number;
}): { man: Participant; woman: Participant } | null {
  const {
    men,
    women,
    assignmentCounts,
    partnerCounts,
    repeatCountByPlayer,
    matchesPerPlayer,
    repeatMin,
  } = args;

  let best: { man: Participant; woman: Participant; score: number } | null =
    null;

  const menSorted = [...men].sort((a, b) => {
    const diff = assignmentCounts[a.id] - assignmentCounts[b.id];
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "it");
  });

  for (const man of menSorted) {
    if (assignmentCounts[man.id] >= matchesPerPlayer) continue;

    const womenSorted = [...women].sort((a, b) => {
      const diff = assignmentCounts[a.id] - assignmentCounts[b.id];
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "it");
    });

    for (const woman of womenSorted) {
      if (assignmentCounts[woman.id] >= matchesPerPlayer) continue;

      const score = scoreMixedTeamCandidate({
        man,
        woman,
        assignmentCounts,
        partnerCounts,
        repeatCountByPlayer,
        matchesPerPlayer,
        repeatMin,
      });

      if (!best || score > best.score) {
        best = { man, woman, score };
      }
    }
  }

  if (!best) return null;

  return { man: best.man, woman: best.woman };
}

function scoreMixedTeamCandidate(args: {
  man: Participant;
  woman: Participant;
  assignmentCounts: AssignmentCountMap;
  partnerCounts: PairCountMatrix;
  repeatCountByPlayer: RepeatCountMap;
  matchesPerPlayer: number;
  repeatMin: number;
}): number {
  const {
    man,
    woman,
    assignmentCounts,
    partnerCounts,
    repeatCountByPlayer,
    matchesPerPlayer,
    repeatMin,
  } = args;

  const currentPairCount = partnerCounts[man.id][woman.id] ?? 0;

  const manAssigned = assignmentCounts[man.id];
  const womanAssigned = assignmentCounts[woman.id];

  const manRepeat = repeatCountByPlayer[man.id];
  const womanRepeat = repeatCountByPlayer[woman.id];

  let score = 0;

  if (currentPairCount === 0) {
    score += 1000;
  } else {
    score -= 800;

    if (manRepeat > repeatMin) score -= 500;
    if (womanRepeat > repeatMin) score -= 500;

    if (manRepeat >= repeatMin && womanRepeat >= repeatMin) {
      score -= 1000;
    }
  }

  const assignmentGap = Math.abs(manAssigned - womanAssigned);
  score -= assignmentGap * 120;

  score -= manAssigned * 15;
  score -= womanAssigned * 15;

  score += (matchesPerPlayer - manAssigned) * 5;
  score += (matchesPerPlayer - womanAssigned) * 5;

  score -= manRepeat * 200;
  score -= womanRepeat * 200;

  const manRemaining = matchesPerPlayer - manAssigned;
  const womanRemaining = matchesPerPlayer - womanAssigned;

  if (manRemaining === 1 || womanRemaining === 1) {
    if (currentPairCount > 0) score -= 700;
  }

  score += deterministicTieBreaker(man.id, woman.id);

  return score;
}

function deterministicTieBreaker(a: string, b: string): number {
  const key = buildSortedPairKey(a, b);
  let acc = 0;

  for (let i = 0; i < key.length; i += 1) {
    acc += key.charCodeAt(i);
  }

  return (acc % 17) / 1000;
}

function buildMixedPairPlanResultData(
  teams: PairPlanTeam[],
  participants: Participant[],
  partnerCounts: PairCountMatrix
): MixedPairPlan {
  const teamsByPlayerId: Record<string, PairPlanTeam[]> = {};
  const statsByPlayerId: Record<string, MixedPairPlanPlayerStats> = {};

  for (const participant of participants) {
    teamsByPlayerId[participant.id] = [];
    statsByPlayerId[participant.id] = {
      playerId: participant.id,
      playerName: participant.name,
      assignedTeams: 0,
      uniquePartners: [],
      repeatedPartners: {},
    };
  }

  const repeatPairsMap = new Map<
    string,
    { playerAId: string; playerBId: string; occurrences: number }
  >();

  for (const team of teams) {
    teamsByPlayerId[team.a.id].push(team);
    teamsByPlayerId[team.b.id].push(team);

    statsByPlayerId[team.a.id].assignedTeams += 1;
    statsByPlayerId[team.b.id].assignedTeams += 1;

    const countA = partnerCounts[team.a.id][team.b.id] ?? 0;
    const countB = partnerCounts[team.b.id][team.a.id] ?? 0;

    if (!statsByPlayerId[team.a.id].uniquePartners.includes(team.b.name)) {
      statsByPlayerId[team.a.id].uniquePartners.push(team.b.name);
    }

    if (!statsByPlayerId[team.b.id].uniquePartners.includes(team.a.name)) {
      statsByPlayerId[team.b.id].uniquePartners.push(team.a.name);
    }

    if (countA > 1) {
      statsByPlayerId[team.a.id].repeatedPartners[team.b.name] = countA - 1;
    }

    if (countB > 1) {
      statsByPlayerId[team.b.id].repeatedPartners[team.a.name] = countB - 1;
    }

    const pairKey = buildSortedPairKey(team.a.id, team.b.id);
    if (!repeatPairsMap.has(pairKey)) {
      repeatPairsMap.set(pairKey, {
        playerAId: team.a.id,
        playerBId: team.b.id,
        occurrences: partnerCounts[team.a.id][team.b.id] ?? 0,
      });
    }
  }

  return {
    teams,
    teamsByPlayerId,
    statsByPlayerId,
    repeatPairs: [...repeatPairsMap.values()].filter(
      (pair) => pair.occurrences > 1
    ),
  };
}