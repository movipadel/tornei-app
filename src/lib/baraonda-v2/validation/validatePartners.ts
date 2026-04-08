import type {
  BaraondaContext,
  MixedPairPlan,
  Participant,
  PartnerValidationDetails,
  PartnerValidationResult,
  Turn,
  ValidationIssue,
} from "../domain/types";
import { buildSortedPairKey } from "../utils/keys";

type PartnerCounter = Record<string, Record<string, number>>;
type MatchesCounter = Record<string, number>;

export function validatePartners(
  context: BaraondaContext,
  turns: Turn[],
  participants: Participant[]
): PartnerValidationResult {
  const issues: ValidationIssue[] = [];
  const participantMap = buildParticipantMap(participants);

  const partnerCounter: PartnerCounter = {};
  const matchesCounter: MatchesCounter = {};

  for (const participant of participants) {
    partnerCounter[participant.id] = {};
    matchesCounter[participant.id] = 0;
  }

  for (const turn of turns) {
    for (const match of turn.matches) {
      const [p1, p2, p3, p4] = match.players;

      registerTeamPartner(partnerCounter, matchesCounter, p1.id, p2.id);
      registerTeamPartner(partnerCounter, matchesCounter, p3.id, p4.id);

      if (context.isMixed) {
        validateMixedPartnerShape(
          participantMap,
          p1.id,
          p2.id,
          issues,
          match.matchNumber,
          turn.turnNumber
        );
        validateMixedPartnerShape(
          participantMap,
          p3.id,
          p4.id,
          issues,
          match.matchNumber,
          turn.turnNumber
        );
      }
    }
  }

  const details = buildPartnerValidationDetails(
    participants,
    partnerCounter,
    matchesCounter,
    participantMap
  );

  validateMatchesPerPlayerEquality(context, details.matchesPerPlayer, issues);
  validatePartnerRepeatNecessity(context, participants, partnerCounter, issues);
  validatePartnerRepeatDistribution(context, participants, partnerCounter, issues);

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
    details,
  };
}

export function validatePartnersFromMixedPairPlan(
  context: BaraondaContext,
  pairPlan: MixedPairPlan,
  participants: Participant[]
): PartnerValidationResult {
  const issues: ValidationIssue[] = [];
  const participantMap = buildParticipantMap(participants);

  const partnerCounter: PartnerCounter = {};
  const matchesCounter: MatchesCounter = {};

  for (const participant of participants) {
    partnerCounter[participant.id] = {};
    matchesCounter[participant.id] = 0;
  }

  for (const team of pairPlan.teams) {
    registerTeamPartner(partnerCounter, matchesCounter, team.a.id, team.b.id);

    if (context.isMixed) {
      validateMixedPartnerShape(
        participantMap,
        team.a.id,
        team.b.id,
        issues,
        undefined,
        undefined
      );
    }
  }

  const details = buildPartnerValidationDetails(
    participants,
    partnerCounter,
    matchesCounter,
    participantMap
  );

  validateMatchesPerPlayerEquality(context, details.matchesPerPlayer, issues);
  validatePartnerRepeatNecessity(context, participants, partnerCounter, issues);
  validatePartnerRepeatDistribution(context, participants, partnerCounter, issues);

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
    details,
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

function registerTeamPartner(
  partnerCounter: PartnerCounter,
  matchesCounter: MatchesCounter,
  playerAId: string,
  playerBId: string
): void {
  partnerCounter[playerAId][playerBId] =
    (partnerCounter[playerAId][playerBId] ?? 0) + 1;
  partnerCounter[playerBId][playerAId] =
    (partnerCounter[playerBId][playerAId] ?? 0) + 1;

  matchesCounter[playerAId] = (matchesCounter[playerAId] ?? 0) + 1;
  matchesCounter[playerBId] = (matchesCounter[playerBId] ?? 0) + 1;
}

function validateMixedPartnerShape(
  participantMap: Record<string, Participant>,
  playerAId: string,
  playerBId: string,
  issues: ValidationIssue[],
  matchNumber?: number,
  turnNumber?: number
): void {
  const playerA = participantMap[playerAId];
  const playerB = participantMap[playerBId];

  if (!playerA || !playerB) {
    issues.push({
      code: "PARTNER_UNKNOWN_PLAYER",
      severity: "error",
      message: "Partner validation fallita: giocatore non trovato.",
    });
    return;
  }

  if (!playerA.sex || !playerB.sex) {
    issues.push({
      code: "MIXED_PARTNER_SEX_MISSING",
      severity: "error",
      message: buildLocationMessage(
        "Nel misto ogni giocatore deve avere il sesso valorizzato.",
        turnNumber,
        matchNumber
      ),
    });
    return;
  }

  if (playerA.sex === playerB.sex) {
    issues.push({
      code: "MIXED_INVALID_TEAM",
      severity: "error",
      message: buildLocationMessage(
        `Team misto non valido: ${playerA.name} e ${playerB.name} hanno lo stesso sesso.`,
        turnNumber,
        matchNumber
      ),
    });
  }
}

function buildPartnerValidationDetails(
  participants: Participant[],
  partnerCounter: PartnerCounter,
  matchesCounter: MatchesCounter,
  participantMap: Record<string, Participant>
): PartnerValidationDetails {
  const matchesPerPlayer: Record<string, number> = {};
  const uniquePartnersByPlayer: Record<string, string[]> = {};
  const repeatedPartnersByPlayer: Record<string, Record<string, number>> = {};

  let totalPartnerRepeats = 0;
  const globalPairRepeatSeen = new Set<string>();

  for (const participant of participants) {
    matchesPerPlayer[participant.id] = matchesCounter[participant.id] ?? 0;

    const partners = Object.keys(partnerCounter[participant.id] ?? {});
    uniquePartnersByPlayer[participant.id] = partners
      .map((partnerId) => participantMap[partnerId]?.name ?? partnerId)
      .sort((a, b) => a.localeCompare(b, "it"));

    repeatedPartnersByPlayer[participant.id] = {};

    for (const partnerId of Object.keys(partnerCounter[participant.id] ?? {})) {
      const count = partnerCounter[participant.id][partnerId] ?? 0;

      if (count > 1) {
        const partnerName = participantMap[partnerId]?.name ?? partnerId;
        repeatedPartnersByPlayer[participant.id][partnerName] = count - 1;

        const pairKey = buildSortedPairKey(participant.id, partnerId);
        if (!globalPairRepeatSeen.has(pairKey)) {
          totalPartnerRepeats += count - 1;
          globalPairRepeatSeen.add(pairKey);
        }
      }
    }
  }

  return {
    matchesPerPlayer,
    uniquePartnersByPlayer,
    repeatedPartnersByPlayer,
    totalPartnerRepeats,
  };
}

function validateMatchesPerPlayerEquality(
  context: BaraondaContext,
  matchesPerPlayerMap: Record<string, number>,
  issues: ValidationIssue[]
): void {
  const values = Object.values(matchesPerPlayerMap);

  if (values.length === 0) {
    issues.push({
      code: "PARTNER_EMPTY_MATCHES",
      severity: "error",
      message: "Nessuna informazione partner disponibile per la validazione.",
    });
    return;
  }

  const first = values[0];

  if (values.some((value) => value !== first)) {
    issues.push({
      code: "PARTNER_MATCHES_NOT_UNIFORM",
      severity: "error",
      message: "I giocatori non hanno tutti lo stesso numero di partner/match assegnati.",
    });
  }

  if (context.matchesPerPlayer > 0 && values.some((value) => value !== context.matchesPerPlayer)) {
    issues.push({
      code: "PARTNER_MATCHES_NOT_EXPECTED",
      severity: "error",
      message: `Il numero di match per giocatore non coincide con il valore atteso (${context.matchesPerPlayer}).`,
    });
  }
}

function validatePartnerRepeatNecessity(
  context: BaraondaContext,
  participants: Participant[],
  partnerCounter: PartnerCounter,
  issues: ValidationIssue[]
): void {
  const totalRepeats = countTotalPartnerRepeats(participants, partnerCounter);

  if (totalRepeats === 0) return;

  if (context.repeatMin === 0) {
    issues.push({
      code: "UNNECESSARY_PARTNER_REPEATS",
      severity: "error",
      message:
        "Sono presenti repeat partner non necessari: il minimo teorico dei repeat è 0.",
    });
    return;
  }

  if (totalRepeats < context.repeatMin) {
    issues.push({
      code: "PARTNER_REPEAT_BELOW_THEORETICAL_MIN",
      severity: "error",
      message:
        "Il conteggio dei repeat partner è sotto il minimo teorico atteso: probabile incoerenza nella ricostruzione del pair plan.",
    });
  }
}

function validatePartnerRepeatDistribution(
  context: BaraondaContext,
  participants: Participant[],
  partnerCounter: PartnerCounter,
  issues: ValidationIssue[]
): void {
  const repeatsPerPlayer: Record<string, number> = {};

  for (const participant of participants) {
    let repeats = 0;

    for (const partnerId of Object.keys(partnerCounter[participant.id] ?? {})) {
      const count = partnerCounter[participant.id][partnerId] ?? 0;
      if (count > 1) {
        repeats += count - 1;
      }
    }

    repeatsPerPlayer[participant.id] = repeats;
  }

  const repeatValues = Object.values(repeatsPerPlayer);

  if (repeatValues.length === 0) {
    return;
  }

  const max = Math.max(...repeatValues);
  const min = Math.min(...repeatValues);

  if (context.repeatMin > 0 && max - min > 1) {
    issues.push({
      code: "PARTNER_REPEATS_NOT_UNIFORM",
      severity: "error",
      message:
        "I repeat partner non sono distribuiti in modo uniforme tra i giocatori.",
    });
  }

  for (const participant of participants) {
    const repeatedPartners = Object.entries(partnerCounter[participant.id] ?? {})
      .filter(([, count]) => count > 1)
      .map(([partnerId, count]) => ({ partnerId, count }));

    for (const repeatedPartner of repeatedPartners) {
      if (repeatedPartner.count > 2) {
        issues.push({
          code: "PARTNER_REPEAT_CONCENTRATED",
          severity: "warning",
          message: `Repeat partner molto concentrato: giocatore ${participant.name} con lo stesso partner più di due volte.`,
        });
      }
    }
  }
}

function countTotalPartnerRepeats(
  participants: Participant[],
  partnerCounter: PartnerCounter
): number {
  let totalRepeats = 0;
  const seenPairs = new Set<string>();

  for (const participant of participants) {
    for (const partnerId of Object.keys(partnerCounter[participant.id] ?? {})) {
      const pairKey = buildSortedPairKey(participant.id, partnerId);
      if (seenPairs.has(pairKey)) continue;

      const count = partnerCounter[participant.id][partnerId] ?? 0;
      if (count > 1) {
        totalRepeats += count - 1;
      }

      seenPairs.add(pairKey);
    }
  }

  return totalRepeats;
}

function buildLocationMessage(
  base: string,
  turnNumber?: number,
  matchNumber?: number
): string {
  if (turnNumber == null && matchNumber == null) return base;
  if (turnNumber != null && matchNumber != null) {
    return `${base} (Turno ${turnNumber}, Match ${matchNumber})`;
  }
  if (turnNumber != null) return `${base} (Turno ${turnNumber})`;
  return `${base} (Match ${matchNumber})`;
}