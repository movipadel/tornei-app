import type {
  BaraondaContext,
  Participant,
  TournamentAudit,
  Turn,
  ValidationReport,
} from "../domain/types";
import { buildPlayerAudit } from "./buildPlayerAudit";

export function buildTournamentAudit(
  context: BaraondaContext,
  turns: Turn[],
  validation: ValidationReport
): TournamentAudit {
  const participants = context.participants;
  const participantMap = buildParticipantMap(participants);

  const players = participants
    .map((participant) => buildPlayerAudit(participant, turns, participantMap))
    .sort((a, b) => a.playerName.localeCompare(b.playerName, "it"));

  return {
    valid: validation.valid,
    errors: validation.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message),
    warnings: validation.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
    players,
    quality: {
      totalPartnerRepeats: countTotalPartnerRepeats(players),
      totalOpponentRepeats: countTotalOpponentRepeats(turns, participants),
      consecutiveRestViolations: countConsecutiveRestViolations(players),
    },
  };
}

function buildParticipantMap(
  participants: Participant[]
): Record<string, Participant> {
  const map: Record<string, Participant> = {};

  for (const participant of participants) {
    map[participant.id] = participant;
  }

  return map;
}

function countTotalPartnerRepeats(
  players: TournamentAudit["players"]
): number {
  let total = 0;

  for (const player of players) {
    total += Object.values(player.partnerRepeats).reduce(
      (sum, count) => sum + count,
      0
    );
  }

  // ogni repeat partner è contato su entrambi i giocatori
  return total / 2;
}

function countTotalOpponentRepeats(
  turns: Turn[],
  participants: Participant[]
): number {
  const opponentCounts: Record<string, Record<string, number>> = {};

  for (const participant of participants) {
    opponentCounts[participant.id] = {};
  }

  for (const turn of turns) {
    for (const match of turn.matches) {
      const [p1, p2, p3, p4] = match.players;

      registerOpponentPair(opponentCounts, p1.id, p3.id);
      registerOpponentPair(opponentCounts, p1.id, p4.id);
      registerOpponentPair(opponentCounts, p2.id, p3.id);
      registerOpponentPair(opponentCounts, p2.id, p4.id);
    }
  }

  let total = 0;
  const seenPairs = new Set<string>();

  for (const participant of participants) {
    for (const [opponentId, count] of Object.entries(
      opponentCounts[participant.id] ?? {}
    )) {
      const key = buildSortedPairKey(participant.id, opponentId);

      if (seenPairs.has(key)) {
        continue;
      }

      if (count > 1) {
        total += count - 1;
      }

      seenPairs.add(key);
    }
  }

  return total;
}

function registerOpponentPair(
  opponentCounts: Record<string, Record<string, number>>,
  a: string,
  b: string
): void {
  opponentCounts[a][b] = (opponentCounts[a][b] ?? 0) + 1;
  opponentCounts[b][a] = (opponentCounts[b][a] ?? 0) + 1;
}

function countConsecutiveRestViolations(
  players: TournamentAudit["players"]
): number {
  let total = 0;

  for (const player of players) {
    const rests = [...player.rests].sort((a, b) => a - b);

    for (let i = 1; i < rests.length; i += 1) {
      if (rests[i] === rests[i - 1] + 1) {
        total += 1;
      }
    }
  }

  return total;
}

function buildSortedPairKey(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y, "it")).join("__");
}