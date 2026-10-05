import {
  moviLevels,
  playerProfileClubs,
  playerProfileLevels,
  playerProfileWindows,
  type AvailabilitySlot,
  type SharedPlayerProfile,
} from "@/lib/playerProfile";
import { isPlayingSide, type PlayingSide } from "./playingSide";

export const playerMatchingWeekdays = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
] as const;

export const playerMatchingRequestedTypes = ["male", "female", "mixed"] as const;
export const PLAYER_MATCH_THRESHOLD = 50;
export const PLAYER_MATCH_LIMIT = 20;

export type DescriptiveLevel = typeof playerProfileLevels[number];
export type MatchType = typeof playerMatchingRequestedTypes[number];
export type TimeWindow = typeof playerProfileWindows[number];

export type PlayerMatchCriteria = {
  clubs: (typeof playerProfileClubs[number])[];
  targetLevelNumeric: typeof moviLevels[number] | null;
  targetLevelDescriptive: DescriptiveLevel | null;
  weekday: number | null;
  timeWindow: TimeWindow | null;
  matchType: MatchType | null;
  playingSide: PlayingSide | null;
  lastMinute: boolean;
  excludePlayerId: string | null;
};

export type PlayerMatchCandidate = {
  id: string;
  fullName: string;
  normalizedPhone: string;
  gender: string | null;
  accountLinked: boolean;
  status: "active" | "archived" | "merged";
  moviLevel: number | null;
  profile: SharedPlayerProfile;
  identityWarning: boolean;
};

export type PlayerMatchScorePart = {
  score: number;
  max: number;
  detail: string;
};

export type PlayerMatchResult = {
  id: string;
  fullName: string;
  normalizedPhone: string;
  gender: string | null;
  accountState: "linked" | "unlinked";
  moviLevel: number | null;
  descriptiveLevel: DescriptiveLevel | null;
  preferredClubs: string[];
  availability: AvailabilitySlot[];
  preferredMatchTypes: string[];
  preferredSide: PlayingSide | null;
  availableLastMinute: boolean | null;
  identityWarning: boolean;
  matchedClub: string | null;
  score: number;
  scoreParts: {
    level: PlayerMatchScorePart;
    availability: PlayerMatchScorePart;
    club: PlayerMatchScorePart;
    matchType: PlayerMatchScorePart;
    side: PlayerMatchScorePart;
    lastMinute: PlayerMatchScorePart;
  };
};

type ScoredCandidate = PlayerMatchResult & {
  numericDistance: number;
  availabilityConfidence: number;
};

const descriptiveOrder: Record<DescriptiveLevel, number> = {
  avanzato: 0,
  intermedio: 1,
  principiante: 2,
};

export function numericLevelCategory(level: number): DescriptiveLevel {
  if (level <= 2.5) return "avanzato";
  if (level <= 4) return "intermedio";
  return "principiante";
}

function parseUuid(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Giocatore da escludere non valido");
  }
  return value;
}

export function parsePlayerMatchCriteria(value: unknown): PlayerMatchCriteria {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Criteri non validi");
  const body = value as Record<string, unknown>;
  const allowed = new Set(["club", "target_level_numeric", "target_level_descriptive", "weekday", "time_window", "match_type", "playing_side", "last_minute", "exclude_player_id"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new Error("Campi di ricerca non validi");
  if (typeof body.club !== "string" || !playerProfileClubs.includes(body.club as never)) throw new Error("Club non valido");
  const numeric = body.target_level_numeric === null || body.target_level_numeric === undefined ? null : body.target_level_numeric;
  const descriptive = body.target_level_descriptive === null || body.target_level_descriptive === undefined ? null : body.target_level_descriptive;
  if (numeric !== null && (typeof numeric !== "number" || !moviLevels.includes(numeric as never))) throw new Error("Livello MOVI non valido");
  if (descriptive !== null && (typeof descriptive !== "string" || !playerProfileLevels.includes(descriptive as never))) throw new Error("Livello descrittivo non valido");
  if ((numeric === null) === (descriptive === null)) throw new Error("Indica un solo livello obiettivo");
  if (!Number.isInteger(body.weekday) || (body.weekday as number) < 1 || (body.weekday as number) > 7) throw new Error("Giorno non valido");
  if (typeof body.time_window !== "string" || !playerProfileWindows.includes(body.time_window as never)) throw new Error("Fascia oraria non valida");
  if (typeof body.match_type !== "string" || !playerMatchingRequestedTypes.includes(body.match_type as never)) throw new Error("Tipo partita non valido");
  const playingSide = body.playing_side === null || body.playing_side === undefined ? null : body.playing_side;
  if (playingSide !== null && !isPlayingSide(playingSide)) throw new Error("Lato di gioco non valido");
  if (typeof body.last_minute !== "boolean") throw new Error("Indicazione last minute non valida");
  return {
    clubs: [body.club as PlayerMatchCriteria["clubs"][number]],
    targetLevelNumeric: numeric as PlayerMatchCriteria["targetLevelNumeric"],
    targetLevelDescriptive: descriptive as PlayerMatchCriteria["targetLevelDescriptive"],
    weekday: body.weekday as number,
    timeWindow: body.time_window as TimeWindow,
    matchType: body.match_type as MatchType,
    playingSide,
    lastMinute: body.last_minute,
    excludePlayerId: parseUuid(body.exclude_player_id),
  };
}

function scoreLevel(candidate: PlayerMatchCandidate, criteria: PlayerMatchCriteria) {
  if (criteria.targetLevelNumeric === null && criteria.targetLevelDescriptive === null) {
    return { part: { score: 0, max: 0, detail: "Livello obiettivo non indicato" }, distance: Number.POSITIVE_INFINITY };
  }
  if (criteria.targetLevelNumeric !== null && candidate.moviLevel !== null) {
    const distance = Math.abs(candidate.moviLevel - criteria.targetLevelNumeric);
    if (distance > 1) return null;
    const score = distance === 0 ? 30 : distance === 0.5 ? 24 : 16;
    return { part: { score, max: 30, detail: `MOVI ${candidate.moviLevel.toFixed(1)} · distanza ${distance.toFixed(1)}` }, distance };
  }

  const targetCategory = criteria.targetLevelNumeric !== null
    ? numericLevelCategory(criteria.targetLevelNumeric)
    : criteria.targetLevelDescriptive!;
  const candidateCategory = candidate.moviLevel !== null
    ? numericLevelCategory(candidate.moviLevel)
    : candidate.profile.descriptive_level;
  if (!candidateCategory) return { part: { score: 8, max: 30, detail: "Livello non indicato · punteggio neutro" }, distance: Number.POSITIVE_INFINITY };
  const categoryDistance = Math.abs(descriptiveOrder[candidateCategory] - descriptiveOrder[targetCategory]);
  const numericConfidence = candidate.moviLevel !== null;
  const score = categoryDistance === 0 ? (numericConfidence ? 24 : 20) : categoryDistance === 1 ? 10 : 4;
  const source = numericConfidence ? `MOVI ${candidate.moviLevel!.toFixed(1)}` : `Livello ${candidateCategory}`;
  return { part: { score, max: 30, detail: `${source} · confronto descrittivo` }, distance: Number.POSITIVE_INFINITY };
}

function scoreClub(candidate: PlayerMatchCandidate, criteria: PlayerMatchCriteria) {
  if (criteria.clubs.length === 0) return { part: { score: 0, max: 0, detail: "Club indifferente" }, matchedClub: null };
  const clubs = candidate.profile.preferred_clubs;
  const exact = criteria.clubs.find((club) => clubs.includes(club));
  if (exact) return { part: { score: 20, max: 20, detail: criteria.clubs.length > 1 ? `Club preferito: ${exact}` : "Club preferito" }, matchedClub: criteria.clubs.length > 1 ? exact : null };
  if (clubs.length === 0) return { part: { score: 10, max: 20, detail: "Nessuna restrizione club" }, matchedClub: null };
  if (candidate.profile.available_other_clubs === true) return { part: { score: 12, max: 20, detail: criteria.clubs.length > 1 ? `Disponibile anche a ${criteria.clubs[0]}` : "Disponibile anche in altri club" }, matchedClub: criteria.clubs.length > 1 ? criteria.clubs[0] : null };
  if (candidate.profile.available_other_clubs === false) return null;
  return { part: { score: 10, max: 20, detail: "Disponibilità club non indicata" }, matchedClub: null };
}

function scoreAvailability(candidate: PlayerMatchCandidate, criteria: PlayerMatchCriteria) {
  const max = (criteria.weekday === null ? 0 : 10) + (criteria.timeWindow === null ? 0 : 15);
  if (max === 0) return { part: { score: 0, max: 0, detail: "Giorno e fascia non definiti" }, confidence: 0 };
  const availability = candidate.profile.availability;
  if (availability.length === 0) {
    return { part: { score: Math.round(max * 0.48), max, detail: "Disponibilità non indicata · punteggio neutro" }, confidence: 0 };
  }
  const day = criteria.weekday !== null && availability.some((slot) => slot.weekday === criteria.weekday);
  const time = criteria.timeWindow !== null && availability.some((slot) => slot.time_window === criteria.timeWindow);
  const exact = criteria.weekday !== null && criteria.timeWindow !== null && availability.some((slot) => slot.weekday === criteria.weekday && slot.time_window === criteria.timeWindow);
  const score = (day ? 10 : 0) + (time ? 15 : 0);
  const detail = exact ? "Giorno e fascia confermati" : day || time ? (criteria.weekday !== null && criteria.timeWindow !== null ? "Compatibilità parziale esplicita" : day ? "Giorno confermato" : "Fascia confermata") : "Disponibilità esplicita non coincidente";
  return { part: { score, max, detail }, confidence: exact ? 2 : day || time ? 1 : 0 };
}

function scoreMatchType(candidate: PlayerMatchCandidate, criteria: PlayerMatchCriteria) {
  if (criteria.matchType === null) return { score: 0, max: 0, detail: "Tipo partita indifferente" };
  const types = candidate.profile.preferred_match_types;
  if (types.includes(criteria.matchType)) return { score: 15, max: 15, detail: "Tipo partita preferito" };
  if (types.includes("any")) return { score: 12, max: 15, detail: "Qualsiasi tipo di partita" };
  if (types.length === 0) return { score: 10, max: 15, detail: "Preferenza partita non indicata" };
  return null;
}

function scoreLastMinute(candidate: PlayerMatchCandidate, criteria: PlayerMatchCriteria) {
  if (!criteria.lastMinute) return { score: 0, max: 0, detail: "Non rilevante per questa ricerca" };
  if (candidate.profile.available_last_minute === true) return { score: 10, max: 10, detail: "Disponibile last minute" };
  if (candidate.profile.available_last_minute === false) return { score: 0, max: 10, detail: "Non disponibile last minute" };
  return { score: 5, max: 10, detail: "Disponibilità last minute non indicata" };
}

function scoreSide(candidate: PlayerMatchCandidate, criteria: PlayerMatchCriteria): PlayerMatchScorePart {
  if (criteria.playingSide === null) return { score: 0, max: 0, detail: "Lato richiesta non indicato" };
  if (criteria.playingSide === "any") return { score: 0, max: 0, detail: "Lato richiesta indifferente" };
  const candidateSide = candidate.profile.preferred_side;
  if (candidateSide === null) return { score: 5, max: 10, detail: "Lato candidato non indicato" };
  if (candidateSide === "any") return { score: 7, max: 10, detail: "Disponibile su entrambi i lati" };
  if (candidateSide !== criteria.playingSide) return { score: 10, max: 10, detail: "Lato complementare" };
  return { score: 2, max: 10, detail: "Stesso lato preferito" };
}

export function scorePlayerMatch(candidate: PlayerMatchCandidate, criteria: PlayerMatchCriteria): ScoredCandidate | null {
  if (candidate.status !== "active" || candidate.id === criteria.excludePlayerId) return null;
  const level = scoreLevel(candidate, criteria);
  const club = scoreClub(candidate, criteria);
  const matchType = scoreMatchType(candidate, criteria);
  if (!level || !club || !matchType) return null;
  const availability = scoreAvailability(candidate, criteria);
  const lastMinute = scoreLastMinute(candidate, criteria);
  const side = scoreSide(candidate, criteria);
  const raw = level.part.score + availability.part.score + club.part.score + matchType.score + side.score + lastMinute.score;
  const max = level.part.max + availability.part.max + club.part.max + matchType.max + side.max + lastMinute.max;
  const score = max === 0 ? 0 : Math.round((raw / max) * 100);
  return {
    id: candidate.id,
    fullName: candidate.fullName,
    normalizedPhone: candidate.normalizedPhone,
    gender: candidate.gender,
    accountState: candidate.accountLinked ? "linked" : "unlinked",
    moviLevel: candidate.moviLevel,
    descriptiveLevel: candidate.profile.descriptive_level,
    preferredClubs: candidate.profile.preferred_clubs,
    availability: candidate.profile.availability,
    preferredMatchTypes: candidate.profile.preferred_match_types,
    preferredSide: candidate.profile.preferred_side,
    availableLastMinute: candidate.profile.available_last_minute,
    identityWarning: candidate.identityWarning,
    matchedClub: club.matchedClub,
    score,
    scoreParts: { level: level.part, availability: availability.part, club: club.part, matchType, side, lastMinute },
    numericDistance: level.distance,
    availabilityConfidence: availability.confidence,
  };
}

export function rankPlayerMatches(candidates: PlayerMatchCandidate[], criteria: PlayerMatchCriteria): PlayerMatchResult[] {
  const ranked = candidates
    .map((candidate) => scorePlayerMatch(candidate, criteria))
    .filter((candidate): candidate is ScoredCandidate => candidate !== null && candidate.score >= PLAYER_MATCH_THRESHOLD)
    .sort((left, right) =>
      right.score - left.score ||
      left.numericDistance - right.numericDistance ||
      right.availabilityConfidence - left.availabilityConfidence ||
      left.fullName.localeCompare(right.fullName, "it", { sensitivity: "base" }) ||
      left.id.localeCompare(right.id)
    )
    .slice(0, PLAYER_MATCH_LIMIT);
  return ranked.map((candidate) => ({
    id: candidate.id,
    fullName: candidate.fullName,
    normalizedPhone: candidate.normalizedPhone,
    gender: candidate.gender,
    accountState: candidate.accountState,
    moviLevel: candidate.moviLevel,
    descriptiveLevel: candidate.descriptiveLevel,
    preferredClubs: candidate.preferredClubs,
    availability: candidate.availability,
    preferredMatchTypes: candidate.preferredMatchTypes,
    preferredSide: candidate.preferredSide,
    availableLastMinute: candidate.availableLastMinute,
    identityWarning: candidate.identityWarning,
    matchedClub: candidate.matchedClub,
    score: candidate.score,
    scoreParts: candidate.scoreParts,
  }));
}
