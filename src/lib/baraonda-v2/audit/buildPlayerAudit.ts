import type {
  Participant,
  PlayerAudit,
  Turn,
} from "../domain/types";

type PlayerCounters = {
  matches: number;
  partnerCounts: Record<string, number>;
  opponentCounts: Record<string, number>;
  rests: number[];
};

export function buildPlayerAudit(
  participant: Participant,
  turns: Turn[],
  participantMap: Record<string, Participant>
): PlayerAudit {
  const counters: PlayerCounters = {
    matches: 0,
    partnerCounts: {},
    opponentCounts: {},
    rests: [],
  };

  for (const turn of turns) {
    if (turn.resting.some((restingPlayer) => restingPlayer.id === participant.id)) {
      counters.rests.push(turn.turnNumber);
    }

    for (const match of turn.matches) {
      const [p1, p2, p3, p4] = match.players;

      if (p1.id === participant.id) {
        counters.matches += 1;
        registerPartner(counters.partnerCounts, p2.id);
        registerOpponent(counters.opponentCounts, p3.id);
        registerOpponent(counters.opponentCounts, p4.id);
      } else if (p2.id === participant.id) {
        counters.matches += 1;
        registerPartner(counters.partnerCounts, p1.id);
        registerOpponent(counters.opponentCounts, p3.id);
        registerOpponent(counters.opponentCounts, p4.id);
      } else if (p3.id === participant.id) {
        counters.matches += 1;
        registerPartner(counters.partnerCounts, p4.id);
        registerOpponent(counters.opponentCounts, p1.id);
        registerOpponent(counters.opponentCounts, p2.id);
      } else if (p4.id === participant.id) {
        counters.matches += 1;
        registerPartner(counters.partnerCounts, p3.id);
        registerOpponent(counters.opponentCounts, p1.id);
        registerOpponent(counters.opponentCounts, p2.id);
      }
    }
  }

  const partners = Object.keys(counters.partnerCounts)
    .map((partnerId) => participantMap[partnerId]?.name ?? partnerId)
    .sort((a, b) => a.localeCompare(b, "it"));

  const partnerRepeats: Record<string, number> = {};
  for (const [partnerId, count] of Object.entries(counters.partnerCounts)) {
    if (count > 1) {
      const partnerName = participantMap[partnerId]?.name ?? partnerId;
      partnerRepeats[partnerName] = count - 1;
    }
  }

  const opponents = Object.keys(counters.opponentCounts)
    .map((opponentId) => participantMap[opponentId]?.name ?? opponentId)
    .sort((a, b) => a.localeCompare(b, "it"));

  return {
    playerId: participant.id,
    playerName: participant.name,
    matches: counters.matches,
    partners,
    partnerRepeats,
    opponents,
    rests: [...counters.rests].sort((a, b) => a - b),
  };
}

function registerPartner(
  partnerCounts: Record<string, number>,
  partnerId: string
): void {
  partnerCounts[partnerId] = (partnerCounts[partnerId] ?? 0) + 1;
}

function registerOpponent(
  opponentCounts: Record<string, number>,
  opponentId: string
): void {
  opponentCounts[opponentId] = (opponentCounts[opponentId] ?? 0) + 1;
}