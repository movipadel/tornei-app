import type {
  BaraondaContext,
  BuildNonMixedPairPlanResult,
  NonMixedPairPlan,
  PairPlanPlayerStats,
  PairPlanTeam,
  PairRepeatEntry,
  Participant,
} from "../../domain/types";

type PairCountsMap = Record<string, Record<string, number>>;
type AssignedCountsMap = Record<string, number>;
type RemainingDegreesMap = Record<string, number>;

export function buildNonMixedPairPlan(
  context: BaraondaContext,
  participants: Participant[]
): BuildNonMixedPairPlanResult {
  const issues: BuildNonMixedPairPlanResult["issues"] = [];

  if (context.isMixed) {
    return {
      ok: false,
      issues: [
        {
          code: "NON_MIXED_REQUIRED",
          message: "Il pair plan non-misto richiede un context non misto.",
        },
      ],
    };
  }

  if (participants.length !== context.playersCount) {
    return {
      ok: false,
      issues: [
        {
          code: "PARTICIPANTS_COUNT_MISMATCH",
          message: "Il numero partecipanti non coincide con il context.",
        },
      ],
    };
  }

  if (!context.isValidMath) {
    return {
      ok: false,
      issues: [
        {
          code: "NON_MIXED_INVALID_MATH",
          message:
            "La configurazione non-misto non è matematicamente valida per costruire il pair plan.",
        },
      ],
    };
  }

  const targetTeams = context.totalMatches * 2;

  if (targetTeams <= 0) {
    return {
      ok: false,
      issues: [
        {
          code: "NON_MIXED_EMPTY_TARGET",
          message: "Il numero di team target non è valido.",
        },
      ],
    };
  }

  const pairCounts: PairCountsMap = {};
  const assignedCounts: AssignedCountsMap = {};
  initializeMaps(participants, pairCounts, assignedCounts);

  const buildResult =
    context.repeatMin === 0
      ? buildStrictNoRepeatTeams(
          context,
          participants,
          pairCounts,
          assignedCounts,
          targetTeams
        )
      : buildRepeatAwareTeams(
          context,
          participants,
          pairCounts,
          assignedCounts,
          targetTeams
        );

  if (!buildResult.ok || !buildResult.teams) {
    return {
      ok: false,
      issues: [...issues, ...buildResult.issues],
    };
  }

  const statsByPlayerId = buildStatsByPlayerId(participants, buildResult.teams);
  const repeatPairs = buildRepeatPairs(participants, pairCounts);

  const pairPlan: NonMixedPairPlan = {
    teams: buildResult.teams,
    statsByPlayerId,
    repeatPairs,
  };

  return {
    ok: true,
    pairPlan,
    issues,
  };
}

function initializeMaps(
  participants: Participant[],
  pairCounts: PairCountsMap,
  assignedCounts: AssignedCountsMap
): void {
  for (const participant of participants) {
    assignedCounts[participant.id] = 0;
    pairCounts[participant.id] = {};
  }

  for (const a of participants) {
    for (const b of participants) {
      if (a.id === b.id) continue;
      pairCounts[a.id][b.id] = 0;
    }
  }
}

/**
 * Modalità STRICT per il caso repeatMin === 0.
 *
 * Regola madre:
 * - ogni giocatore deve avere exactly matchesPerPlayer partner
 * - nessuna coppia può comparire più di una volta
 *
 * Costruiamo quindi un grafo semplice k-regolare:
 * - vertici = giocatori
 * - archi = team/partner
 * - grado di ogni vertice = matchesPerPlayer
 *
 * Se la costruzione non riesce, il caso viene considerato non costruibile
 * in modo coerente con le regole hard.
 */
function buildStrictNoRepeatTeams(
  context: BaraondaContext,
  participants: Participant[],
  pairCounts: PairCountsMap,
  assignedCounts: AssignedCountsMap,
  targetTeams: number
):
  | { ok: true; teams: PairPlanTeam[]; issues: [] }
  | {
      ok: false;
      issues: { code: string; message: string }[];
    } {
  const teams: PairPlanTeam[] = [];
  const remainingDegrees: RemainingDegreesMap = {};

  for (const participant of participants) {
    remainingDegrees[participant.id] = context.matchesPerPlayer;
  }

  let steps = 0;
  const maxSteps = Math.max(
    10000,
    participants.length * context.matchesPerPlayer * participants.length * 4
  );

  while (true) {
    steps += 1;

    if (steps > maxSteps) {
      return {
        ok: false,
        issues: [
          {
            code: "STRICT_PAIR_PLAN_STEP_LIMIT",
            message:
              "Raggiunto il limite di passi nella costruzione strict no-repeat del pair plan non-misto.",
          },
        ],
      };
    }

    const active = participants.filter((p) => remainingDegrees[p.id] > 0);

    if (active.length === 0) {
      break;
    }

    // Pivot: chi ha più gradi residui.
    // Tie-break: meno partner già usati, poi nome.
    const pivot = [...active].sort((a, b) => {
      const degreeDiff = remainingDegrees[b.id] - remainingDegrees[a.id];
      if (degreeDiff !== 0) return degreeDiff;

      const usedPartnersA = countUsedPartners(a.id, pairCounts);
      const usedPartnersB = countUsedPartners(b.id, pairCounts);
      if (usedPartnersA !== usedPartnersB) return usedPartnersA - usedPartnersB;

      return a.name.localeCompare(b.name, "it");
    })[0];

    const degree = remainingDegrees[pivot.id];

    const candidates = active
      .filter((other) => other.id !== pivot.id)
      .filter((other) => remainingDegrees[other.id] > 0)
      .filter((other) => (pairCounts[pivot.id][other.id] ?? 0) === 0)
      .sort((a, b) => {
        // Havel-Hakimi style: collega ai nodi con grado residuo più alto
        const degreeDiff = remainingDegrees[b.id] - remainingDegrees[a.id];
        if (degreeDiff !== 0) return degreeDiff;

        const usedPartnersA = countUsedPartners(a.id, pairCounts);
        const usedPartnersB = countUsedPartners(b.id, pairCounts);
        if (usedPartnersA !== usedPartnersB) return usedPartnersA - usedPartnersB;

        return a.name.localeCompare(b.name, "it");
      });

    if (candidates.length < degree) {
      return {
        ok: false,
        issues: [
          {
            code: "STRICT_NO_REPEAT_NOT_CONSTRUCTIBLE",
            message:
              "Impossibile completare il pair plan non-misto senza repeat partner, nonostante repeatMin = 0.",
          },
        ],
      };
    }

    const chosenPartners = candidates.slice(0, degree);

    for (const partner of chosenPartners) {
      if (teams.length >= targetTeams) {
        return {
          ok: false,
          issues: [
            {
              code: "STRICT_PAIR_PLAN_OVERFLOW",
              message:
                "Il pair plan strict no-repeat ha generato più team del previsto.",
            },
          ],
        };
      }

      addTeam(
        teams,
        pivot,
        partner,
        pairCounts,
        assignedCounts,
        remainingDegrees
      );
    }

    if (!isStrictConstructionStillFeasible(participants, remainingDegrees, pairCounts)) {
      return {
        ok: false,
        issues: [
          {
            code: "STRICT_PAIR_PLAN_DEAD_END",
            message:
              "La costruzione strict no-repeat è entrata in un dead-end: alcuni giocatori non hanno abbastanza partner nuovi residui.",
          },
        ],
      };
    }
  }

  if (teams.length !== targetTeams) {
    return {
      ok: false,
      issues: [
        {
          code: "STRICT_PAIR_PLAN_TEAM_COUNT_MISMATCH",
          message:
            `Il pair plan strict no-repeat ha prodotto ${teams.length} team ` +
            `invece di ${targetTeams}.`,
        },
      ],
    };
  }

  if (!allPlayersAssignedExactly(participants, assignedCounts, context.matchesPerPlayer)) {
    return {
      ok: false,
      issues: [
        {
          code: "STRICT_PAIR_PLAN_ASSIGNED_COUNT_MISMATCH",
          message:
            "Il pair plan strict no-repeat non assegna a tutti i giocatori il numero atteso di team.",
        },
      ],
    };
  }

  return {
    ok: true,
    teams,
    issues: [],
  };
}

/**
 * Modalità per il caso repeatMin > 0.
 * Mantiene una logica greedy compatibile con il resto dell'engine,
 * ma con scoring e controlli leggermente più robusti del precedente.
 */
function buildRepeatAwareTeams(
  context: BaraondaContext,
  participants: Participant[],
  pairCounts: PairCountsMap,
  assignedCounts: AssignedCountsMap,
  targetTeams: number
):
  | { ok: true; teams: PairPlanTeam[]; issues: [] }
  | {
      ok: false;
      issues: { code: string; message: string }[];
    } {
  const teams: PairPlanTeam[] = [];
  let guard = 0;
  const maxIterations = Math.max(
    50000,
    targetTeams * participants.length * participants.length * 20
  );

  while (teams.length < targetTeams) {
    guard += 1;

    if (guard > maxIterations) {
      return {
        ok: false,
        issues: [
          {
            code: "PAIR_PLAN_ITERATION_LIMIT",
            message:
              "Raggiunto limite iterazioni nella costruzione del pair plan non-misto.",
          },
        ],
      };
    }

    const pair = pickBestPairRepeatAware(
      participants,
      assignedCounts,
      pairCounts,
      context.matchesPerPlayer
    );

    if (!pair) {
      return {
        ok: false,
        issues: [
          {
            code: "NO_VALID_PAIR_FOUND",
            message:
              "Impossibile trovare una coppia valida per completare il pair plan non-misto.",
          },
        ],
      };
    }

    const [a, b] = pair;
    addTeam(teams, a, b, pairCounts, assignedCounts);
  }

  if (!allPlayersAssignedExactly(participants, assignedCounts, context.matchesPerPlayer)) {
    return {
      ok: false,
      issues: [
        {
          code: "PAIR_PLAN_ASSIGNED_COUNT_MISMATCH",
          message:
            "Il pair plan non-misto non assegna a tutti i giocatori il numero atteso di team.",
        },
      ],
    };
  }

  return {
    ok: true,
    teams,
    issues: [],
  };
}

function pickBestPairRepeatAware(
  participants: Participant[],
  assignedCounts: AssignedCountsMap,
  pairCounts: PairCountsMap,
  matchesPerPlayer: number
): [Participant, Participant] | null {
  let bestPair: [Participant, Participant] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  const ordered = [...participants].sort((p1, p2) => {
    const remaining1 = matchesPerPlayer - assignedCounts[p1.id];
    const remaining2 = matchesPerPlayer - assignedCounts[p2.id];
    if (remaining1 !== remaining2) return remaining2 - remaining1;

    const partners1 = countUsedPartners(p1.id, pairCounts);
    const partners2 = countUsedPartners(p2.id, pairCounts);
    if (partners1 !== partners2) return partners1 - partners2;

    return p1.name.localeCompare(p2.name, "it");
  });

  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i];

    if (assignedCounts[a.id] >= matchesPerPlayer) continue;

    for (let j = i + 1; j < ordered.length; j++) {
      const b = ordered[j];

      if (a.id === b.id) continue;
      if (assignedCounts[b.id] >= matchesPerPlayer) continue;

      const currentPairCount = pairCounts[a.id][b.id] ?? 0;

      const score = scorePairRepeatAware(
        a,
        b,
        assignedCounts,
        pairCounts,
        currentPairCount,
        matchesPerPlayer
      );

      if (score > bestScore) {
        bestScore = score;
        bestPair = [a, b];
      }
    }
  }

  return bestPair;
}

function scorePairRepeatAware(
  a: Participant,
  b: Participant,
  assignedCounts: AssignedCountsMap,
  pairCounts: PairCountsMap,
  currentPairCount: number,
  matchesPerPlayer: number
): number {
  let score = 0;

  const aRemaining = matchesPerPlayer - assignedCounts[a.id];
  const bRemaining = matchesPerPlayer - assignedCounts[b.id];
  const loadGap = Math.abs(assignedCounts[a.id] - assignedCounts[b.id]);

  score += aRemaining * 100;
  score += bRemaining * 100;

  if (currentPairCount === 0) {
    score += 10000;
  } else {
    score -= currentPairCount * 5000;
  }

  score -= loadGap * 50;

  const aUsedPartners = countUsedPartners(a.id, pairCounts);
  const bUsedPartners = countUsedPartners(b.id, pairCounts);

  score -= aUsedPartners * 10;
  score -= bUsedPartners * 10;

  const nameTieBreak = `${a.name}|${b.name}`;
  score += deterministicTieBreak(nameTieBreak);

  return score;
}

function addTeam(
  teams: PairPlanTeam[],
  a: Participant,
  b: Participant,
  pairCounts: PairCountsMap,
  assignedCounts: AssignedCountsMap,
  remainingDegrees?: RemainingDegreesMap
): void {
  teams.push({
    id: `team_${teams.length + 1}`,
    a,
    b,
  });

  assignedCounts[a.id] += 1;
  assignedCounts[b.id] += 1;

  pairCounts[a.id][b.id] += 1;
  pairCounts[b.id][a.id] += 1;

  if (remainingDegrees) {
    remainingDegrees[a.id] -= 1;
    remainingDegrees[b.id] -= 1;
  }
}

function isStrictConstructionStillFeasible(
  participants: Participant[],
  remainingDegrees: RemainingDegreesMap,
  pairCounts: PairCountsMap
): boolean {
  let totalRemaining = 0;

  for (const participant of participants) {
    const remaining = remainingDegrees[participant.id] ?? 0;

    if (remaining < 0) {
      return false;
    }

    totalRemaining += remaining;

    if (remaining === 0) {
      continue;
    }

    const availableNewPartners = participants.filter((other) => {
      if (other.id === participant.id) return false;
      if ((remainingDegrees[other.id] ?? 0) <= 0) return false;
      return (pairCounts[participant.id][other.id] ?? 0) === 0;
    }).length;

    // Condizione necessaria:
    // per completare i suoi team futuri, il giocatore deve avere almeno
    // tanti partner nuovi residui quanti sono i gradi residui da assegnare.
    if (availableNewPartners < remaining) {
      return false;
    }
  }

  return totalRemaining % 2 === 0;
}

function allPlayersAssignedExactly(
  participants: Participant[],
  assignedCounts: AssignedCountsMap,
  matchesPerPlayer: number
): boolean {
  return participants.every(
    (participant) => (assignedCounts[participant.id] ?? 0) === matchesPerPlayer
  );
}

function countUsedPartners(
  playerId: string,
  pairCounts: PairCountsMap
): number {
  return Object.values(pairCounts[playerId] ?? {}).filter((count) => count > 0).length;
}

function deterministicTieBreak(seed: string): number {
  let acc = 0;
  for (let i = 0; i < seed.length; i++) {
    acc += seed.charCodeAt(i);
  }
  return -(acc / 100000);
}

function buildStatsByPlayerId(
  participants: Participant[],
  teams: PairPlanTeam[]
): Record<string, PairPlanPlayerStats> {
  const stats: Record<string, PairPlanPlayerStats> = {};

  for (const participant of participants) {
    stats[participant.id] = {
      playerId: participant.id,
      playerName: participant.name,
      assignedTeams: 0,
      uniquePartners: [],
      repeatedPartners: {},
    };
  }

  const uniquePartnerSets: Record<string, Set<string>> = {};
  const partnerCounters: Record<string, Record<string, number>> = {};

  for (const participant of participants) {
    uniquePartnerSets[participant.id] = new Set<string>();
    partnerCounters[participant.id] = {};
  }

  for (const team of teams) {
    const a = team.a;
    const b = team.b;

    stats[a.id].assignedTeams += 1;
    stats[b.id].assignedTeams += 1;

    uniquePartnerSets[a.id].add(b.name);
    uniquePartnerSets[b.id].add(a.name);

    partnerCounters[a.id][b.name] = (partnerCounters[a.id][b.name] ?? 0) + 1;
    partnerCounters[b.id][a.name] = (partnerCounters[b.id][a.name] ?? 0) + 1;
  }

  for (const participant of participants) {
    const playerStats = stats[participant.id];

    playerStats.uniquePartners = [...uniquePartnerSets[participant.id]].sort((a, b) =>
      a.localeCompare(b, "it")
    );

    const repeatedPartners: Record<string, number> = {};

    for (const [partnerName, count] of Object.entries(partnerCounters[participant.id])) {
      if (count > 1) {
        repeatedPartners[partnerName] = count - 1;
      }
    }

    playerStats.repeatedPartners = repeatedPartners;
  }

  return stats;
}

function buildRepeatPairs(
  participants: Participant[],
  pairCounts: PairCountsMap
): PairRepeatEntry[] {
  const repeats: PairRepeatEntry[] = [];

  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i];
      const b = participants[j];
      const count = pairCounts[a.id][b.id] ?? 0;

      if (count > 1) {
        repeats.push({
          playerAId: a.id,
          playerBId: b.id,
          occurrences: count,
        });
      }
    }
  }

  return repeats;
}