import type {
  BaraondaContext,
  BaraondaEngineMode,
  BaraondaInput,
  Participant,
} from "../domain/types";
import {
  getMixedMaxUniquePartners,
  getMixedRepeatMin,
  getNonMixedMaxUniquePartners,
  getNonMixedRepeatMin,
  getTotalMatches,
  isMixedGenderSplitValid,
  isMixedPlayersCountValid,
  isTournamentMathValid,
  resolveMatchesPerPlayer,
} from "../domain/math";

export type BuildBaraondaContextResult =
  | { ok: true; context: BaraondaContext }
  | { ok: false; errors: string[] };

export function buildBaraondaContext(
  input: BaraondaInput
): BuildBaraondaContextResult {
  const participants = normalizeParticipants(input.participants);
  const playersCount = participants.length;
  const autoCourts = input.autoCourts ?? false;
  const maxCourts = normalizeMaxCourts(input.maxCourts);

  const validationErrors: string[] = [];

  if (playersCount < 4) {
    validationErrors.push("Servono almeno 4 partecipanti.");
  }

  const engineMode: BaraondaEngineMode =
    input.category === "misto" ? "mixed" : "non_mixed";

  const isMixed = engineMode === "mixed";

  const maleCount = participants.filter((p) => p.sex === "m").length;
  const femaleCount = participants.filter((p) => p.sex === "f").length;
  const perSexCount = isMixed ? playersCount / 2 : null;

  if (isMixed) {
    if (!isMixedPlayersCountValid(playersCount)) {
      validationErrors.push("Nel misto il numero totale di partecipanti deve essere pari.");
    }

    if (!isMixedGenderSplitValid(maleCount, femaleCount)) {
      validationErrors.push(
        "Nel misto servono uomini e donne in numero uguale."
      );
    }
  }

  const matchesPerPlayer = resolveMatchesPerPlayer(
    input.category,
    playersCount,
    input.formula
  );

  if (matchesPerPlayer == null) {
    validationErrors.push("Formula non disponibile per questa configurazione.");
  }

  const safeMatchesPerPlayer = matchesPerPlayer ?? 0;

  const isValidMath =
    safeMatchesPerPlayer > 0 &&
    isTournamentMathValid(playersCount, safeMatchesPerPlayer);

  if (safeMatchesPerPlayer > 0 && !isValidMath) {
    validationErrors.push(
      "Configurazione matematicamente non valida: (players × matchesPerPlayer) % 4 !== 0."
    );
  }

  const partnerUniqueMax =
    isMixed && perSexCount
      ? getMixedMaxUniquePartners(perSexCount)
      : getNonMixedMaxUniquePartners(playersCount);

  const repeatMin =
    isMixed && perSexCount
      ? getMixedRepeatMin(perSexCount, safeMatchesPerPlayer)
      : getNonMixedRepeatMin(playersCount, safeMatchesPerPlayer);

  const totalMatches =
    safeMatchesPerPlayer > 0
      ? getTotalMatches(playersCount, safeMatchesPerPlayer)
      : 0;

  const context: BaraondaContext = {
    category: input.category,
    engineMode,
    formula: input.formula,

    participants,
    playersCount,

    maxCourts,
    autoCourts,

    isMixed,

    maleCount,
    femaleCount,
    perSexCount,

    matchesPerPlayer: safeMatchesPerPlayer,
    totalMatches,

    partnerUniqueMax,
    repeatMin,

    isValidMath,
    validationErrors,
  };

  if (validationErrors.length > 0) {
    return { ok: false, errors: validationErrors };
  }

  return { ok: true, context };
}

function normalizeParticipants(participants: Participant[]): Participant[] {
  const seenIds = new Set<string>();
  const normalized: Participant[] = [];

  for (const participant of participants) {
    const id = String(participant.id ?? "").trim();
    const name = String(participant.name ?? "").trim();

    if (!id || !name) continue;
    if (seenIds.has(id)) continue;

    seenIds.add(id);

    normalized.push({
      id,
      name,
      sex: participant.sex,
    });
  }

  return normalized;
}

function normalizeMaxCourts(maxCourts: number): number {
  if (!Number.isFinite(maxCourts)) return 1;
  return Math.max(1, Math.min(3, Math.floor(maxCourts)));
}