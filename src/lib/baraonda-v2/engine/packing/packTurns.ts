import type {
  PackTurnsResult,
  Participant,
  PlannedMatch,
  Turn,
  TurnMatch,
} from "../../domain/types";

type RestHistoryMap = Record<string, number[]>;
type MatchPlayerIds = [string, string, string, string];
type PackTurnsMode = "mixed" | "non_mixed";

type TurnCombination = {
  matches: PlannedMatch[];
  usedPlayerIds: Set<string>;
  score: number;
};

export function packTurns(
  matches: PlannedMatch[],
  participants: Participant[],
  maxCourts: number,
  mode: PackTurnsMode = "mixed"
): PackTurnsResult {
  const issues: PackTurnsResult["issues"] = [];

  if (matches.length === 0) {
    return {
      ok: true,
      turns: [],
      issues,
    };
  }

  const normalizedMaxCourts = normalizeMaxCourts(maxCourts);

  const restHistory: RestHistoryMap = {};
  for (const participant of participants) {
    restHistory[participant.id] = [];
  }

  const remainingMatches = [...matches];
  const turns: Turn[] = [];
  let turnNumber = 1;

  while (remainingMatches.length > 0) {
    const bestCombination = pickBestTurnCombination(
      remainingMatches,
      participants,
      normalizedMaxCourts,
      turnNumber,
      restHistory,
      mode
    );

    if (!bestCombination || bestCombination.matches.length === 0) {
      issues.push({
        code: "NO_VALID_TURN_COMBINATION",
        message:
          "Impossibile costruire una combinazione valida di match per il turno corrente.",
      });

      return {
        ok: false,
        issues,
      };
    }

    const turnMatchList: TurnMatch[] = bestCombination.matches.map((match, index) => ({
      matchNumber: index + 1,
      players: [
        match.team1.a,
        match.team1.b,
        match.team2.a,
        match.team2.b,
      ],
    }));

    const resting = participants
      .filter((participant) => !bestCombination.usedPlayerIds.has(participant.id))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));

    for (const restingParticipant of resting) {
      restHistory[restingParticipant.id].push(turnNumber);
    }

    turns.push({
      turnNumber,
      matches: turnMatchList,
      resting,
    });

    removeSelectedMatches(remainingMatches, bestCombination.matches);
    turnNumber += 1;
  }

  return {
    ok: true,
    turns,
    issues,
  };
}

function pickBestTurnCombination(
  matches: PlannedMatch[],
  participants: Participant[],
  maxCourts: number,
  currentTurnNumber: number,
  restHistory: RestHistoryMap,
  mode: PackTurnsMode
): TurnCombination | null {
  const sortedMatches = [...matches].sort((a, b) => {
    const keyA = getPlannedMatchDeterministicKey(a);
    const keyB = getPlannedMatchDeterministicKey(b);
    return keyA.localeCompare(keyB, "it");
  });

  let best: TurnCombination | null = null;

  const maxMatchesInTurn = Math.min(maxCourts, sortedMatches.length);

  for (let size = 1; size <= maxMatchesInTurn; size += 1) {
    const combinations = generateMatchCombinations(sortedMatches, size);

    for (const combination of combinations) {
      const usedPlayerIds = getUsedPlayerIdsForMatches(combination);

      if (!usedPlayerIds) {
        continue;
      }

      const score = scoreTurnCombination(
        combination,
        sortedMatches,
        participants,
        usedPlayerIds,
        currentTurnNumber,
        restHistory,
        maxCourts,
        mode
      );

      const candidate: TurnCombination = {
        matches: combination,
        usedPlayerIds,
        score,
      };

      if (!best || isBetterCombination(candidate, best)) {
        best = candidate;
      }
    }
  }

  return best;
}

function isBetterCombination(
  candidate: TurnCombination,
  currentBest: TurnCombination
): boolean {
  if (candidate.score !== currentBest.score) {
    return candidate.score > currentBest.score;
  }

  if (candidate.matches.length !== currentBest.matches.length) {
    return candidate.matches.length > currentBest.matches.length;
  }

  const candidateKey = getCombinationDeterministicKey(candidate.matches);
  const bestKey = getCombinationDeterministicKey(currentBest.matches);
  return candidateKey.localeCompare(bestKey, "it") < 0;
}

function scoreTurnCombination(
  combination: PlannedMatch[],
  allMatches: PlannedMatch[],
  participants: Participant[],
  usedPlayerIds: Set<string>,
  currentTurnNumber: number,
  restHistory: RestHistoryMap,
  maxCourts: number,
  mode: PackTurnsMode
): number {
  let score = 0;

  const restingParticipants = participants.filter(
    (participant) => !usedPlayerIds.has(participant.id)
  );

  // 1. Priorità fortissima: più match nel turno è meglio
  score += combination.length * 10000;

  // 2. Piccolo bonus se si saturano i campi, ma non dominante
  if (combination.length === maxCourts) {
    score += 500;
  }

  // 3. Penalizza tanti riposi
  score -= restingParticipants.length * 300;

  // 4. Penalizza riposi consecutivi
  for (const participant of restingParticipants) {
    const rests = restHistory[participant.id] ?? [];
    const lastRestTurn = rests.length > 0 ? rests[rests.length - 1] : null;

    if (lastRestTurn != null && lastRestTurn === currentTurnNumber - 1) {
      score -= 1200;
    }
  }

  // 5. Penalizza concentrazione riposi su chi ha già riposato molto
  for (const participant of restingParticipants) {
    const restsCount = (restHistory[participant.id] ?? []).length;
    score -= restsCount * 120;
  }

  // 6. Bonus per far giocare chi ha riposato nel turno precedente
  for (const match of combination) {
    const playerIds = getPlannedMatchPlayerIds(match);

    for (const playerId of playerIds) {
      const rests = restHistory[playerId] ?? [];
      const lastRestTurn = rests.length > 0 ? rests[rests.length - 1] : null;

      if (lastRestTurn != null && lastRestTurn === currentTurnNumber - 1) {
        score += 150;
      }
    }
  }

  // 7. Bonus leggero per equilibrio generale dei riposi
  const projectedRestCounts = participants.map((participant) => {
    const current = (restHistory[participant.id] ?? []).length;
    return current + (usedPlayerIds.has(participant.id) ? 0 : 1);
  });

  const minProjectedRests = Math.min(...projectedRestCounts);
  const maxProjectedRests = Math.max(...projectedRestCounts);
  score -= (maxProjectedRests - minProjectedRests) * 250;

  // 8. Ottimizzazione SOLO per non-misto
  if (mode === "non_mixed") {
  // 1. privilegia match difficili (come già facevi)
  for (const match of combination) {
    const compatCount = countCompatibleMatches(match, allMatches);

    if (compatCount <= 1) score += 2500;
    else if (compatCount === 2) score += 1200;
    else if (compatCount === 3) score += 250;
  }

  const remainingMatches = allMatches.filter(
    (match) => !combination.includes(match)
  );

  // 2. penalità globale (già presente)
  score -= estimateFuturePackingPenalty(remainingMatches);

  // 🔥 3. NUOVA LOGICA — ANTI-ISOLAMENTO (CRITICA)
  let isolatedPenalty = 0;

  for (const match of remainingMatches) {
    const compat = countCompatibleMatches(match, remainingMatches);

    if (compat === 0) {
      // match completamente isolato → disastro
      isolatedPenalty += 2;
    } else if (compat === 1) {
      // quasi isolato → molto pericoloso
      isolatedPenalty += 1;
    }
  }

  score -= isolatedPenalty * 4000;

  // 🔥 4. BONUS se il futuro è "compattabile"
  let goodMatches = 0;

  for (const match of remainingMatches) {
    const compat = countCompatibleMatches(match, remainingMatches);

    if (compat >= 3) {
      goodMatches += 1;
    }
  }

  score += goodMatches * 150;
}

  // 9. Determinismo
  score += deterministicCombinationTieBreaker(combination);

  return score;
}

function generateMatchCombinations(
  matches: PlannedMatch[],
  size: number
): PlannedMatch[][] {
  const results: PlannedMatch[][] = [];

  function backtrack(startIndex: number, current: PlannedMatch[]): void {
    if (current.length === size) {
      results.push([...current]);
      return;
    }

    for (let i = startIndex; i < matches.length; i += 1) {
      current.push(matches[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return results;
}

function getUsedPlayerIdsForMatches(matches: PlannedMatch[]): Set<string> | null {
  const usedPlayerIds = new Set<string>();

  for (const match of matches) {
    const playerIds = getPlannedMatchPlayerIds(match);

    for (const playerId of playerIds) {
      if (usedPlayerIds.has(playerId)) {
        return null;
      }

      usedPlayerIds.add(playerId);
    }
  }

  return usedPlayerIds;
}

function removeSelectedMatches(
  remainingMatches: PlannedMatch[],
  selectedMatches: PlannedMatch[]
): void {
  const selectedRefs = new Set<PlannedMatch>(selectedMatches);

  for (let i = remainingMatches.length - 1; i >= 0; i -= 1) {
    if (selectedRefs.has(remainingMatches[i])) {
      remainingMatches.splice(i, 1);
    }
  }
}

function getPlannedMatchPlayerIds(match: PlannedMatch): MatchPlayerIds {
  return [
    match.team1.a.id,
    match.team1.b.id,
    match.team2.a.id,
    match.team2.b.id,
  ];
}

function arePlannedMatchesCompatible(
  a: PlannedMatch,
  b: PlannedMatch
): boolean {
  const aIds = new Set(getPlannedMatchPlayerIds(a));
  const bIds = getPlannedMatchPlayerIds(b);

  return bIds.every((id) => !aIds.has(id));
}

function countCompatibleMatches(
  target: PlannedMatch,
  matches: PlannedMatch[]
): number {
  let count = 0;

  for (const other of matches) {
    if (other === target) continue;

    if (arePlannedMatchesCompatible(target, other)) {
      count += 1;
    }
  }

  return count;
}

function estimateFuturePackingPenalty(matches: PlannedMatch[]): number {
  if (matches.length <= 1) {
    return 0;
  }

  let penalty = 0;

  for (const match of matches) {
    const compatCount = countCompatibleMatches(match, matches);

    if (compatCount === 0) penalty += 6000;
    else if (compatCount === 1) penalty += 1500;
    else if (compatCount === 2) penalty += 500;
  }

  return penalty;
}

function getPlannedMatchDeterministicKey(match: PlannedMatch): string {
  const team1Key = [match.team1.a.id, match.team1.b.id]
    .sort((a, b) => a.localeCompare(b, "it"))
    .join("__");

  const team2Key = [match.team2.a.id, match.team2.b.id]
    .sort((a, b) => a.localeCompare(b, "it"))
    .join("__");

  return [team1Key, team2Key]
    .sort((a, b) => a.localeCompare(b, "it"))
    .join("___VS___");
}

function getCombinationDeterministicKey(matches: PlannedMatch[]): string {
  return matches
    .map((match) => getPlannedMatchDeterministicKey(match))
    .sort((a, b) => a.localeCompare(b, "it"))
    .join("|||");
}

function deterministicCombinationTieBreaker(matches: PlannedMatch[]): number {
  const key = getCombinationDeterministicKey(matches);
  let acc = 0;

  for (let i = 0; i < key.length; i += 1) {
    acc += key.charCodeAt(i);
  }

  return (acc % 31) / 1000;
}

function normalizeMaxCourts(maxCourts: number): number {
  if (!Number.isFinite(maxCourts)) return 1;
  return Math.max(1, Math.min(3, Math.floor(maxCourts)));
}