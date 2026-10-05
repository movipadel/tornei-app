import { requestClubs, type RequestRow, type RequestStatus } from "@/lib/moviRequests";
import { PLAYER_MATCH_LIMIT, playerMatchingRequestedTypes, type PlayerMatchCriteria, type PlayerMatchResult, type TimeWindow } from "@/lib/playerMatching";
import { playerProfileLevels, playerProfileWindows } from "@/lib/playerProfile";
import type { PlayingSide } from "./playingSide";

export const giocaMatchingStates: RequestStatus[] = ["received", "searching", "found"];

export type GiocaMatchingContext = {
  clubs: string[];
  level: string | null;
  weekday: number | null;
  timeWindow: string | null;
  matchTypes: string[];
  playingSide: PlayingSide | null;
  lastMinute: false;
  requesterExcluded: boolean;
};

type GiocaRequest = Pick<RequestRow, "request_type" | "clubs" | "requested_date" | "time_window" | "level" | "match_type" | "playing_side">;

export function weekdayFromStoredDate(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data richiesta non valida");
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Data richiesta non valida");
  return ((date.getUTCDay() + 6) % 7) + 1;
}

export function giocaRequestToMatchingCriteria(request: GiocaRequest, requesterPlayerId: string | null): PlayerMatchCriteria[] {
  if (request.request_type !== "gioca") throw new Error("I suggerimenti sono disponibili solo per richieste Gioca");
  if (!Array.isArray(request.clubs) || request.clubs.some((club) => !requestClubs.includes(club as never))) throw new Error("Club richiesta non validi");
  if (request.level !== "unknown" && !playerProfileLevels.includes(request.level as never)) throw new Error("Livello richiesta non valido");
  if (!playerProfileWindows.includes(request.time_window as never) && request.time_window !== "any") throw new Error("Fascia richiesta non valida");
  if (!Array.isArray(request.match_type) || request.match_type.length === 0 || new Set(request.match_type).size !== request.match_type.length || request.match_type.some(type => type !== "any" && !playerMatchingRequestedTypes.includes(type as never)) || (request.match_type.includes("any") && request.match_type.length > 1)) throw new Error("Tipo partita richiesta non valido");
  const base = {
    clubs: [...request.clubs] as PlayerMatchCriteria["clubs"],
    targetLevelNumeric: null,
    targetLevelDescriptive: request.level === "unknown" ? null : request.level,
    weekday: weekdayFromStoredDate(request.requested_date),
    timeWindow: request.time_window === "any" ? null : request.time_window as TimeWindow,
    lastMinute: false,
    playingSide: request.playing_side ?? null,
    excludePlayerId: requesterPlayerId,
  };
  return request.match_type.map(matchType => ({...base, matchType: matchType === "any" ? null : matchType as PlayerMatchCriteria["matchType"]}));
}

export function giocaMatchingContext(criteria: PlayerMatchCriteria[], requestedTypes: string[]): GiocaMatchingContext {
  const first=criteria[0];
  return {
    clubs: [...first.clubs],
    level: first.targetLevelDescriptive,
    weekday: first.weekday,
    timeWindow: first.timeWindow,
    matchTypes: [...requestedTypes],
    playingSide: first.playingSide,
    lastMinute: false,
    requesterExcluded: first.excludePlayerId !== null,
  };
}

export function mergeGiocaMatchResults(groups: PlayerMatchResult[][]): PlayerMatchResult[] {
  const best=new Map<string,PlayerMatchResult>();
  for(const candidate of groups.flat())if(!best.has(candidate.id)||candidate.score>best.get(candidate.id)!.score)best.set(candidate.id,candidate);
  return [...best.values()].sort((left,right)=>right.score-left.score||left.fullName.localeCompare(right.fullName,"it",{sensitivity:"base"})||left.id.localeCompare(right.id)).slice(0,PLAYER_MATCH_LIMIT);
}

export function supportsGiocaMatching(request: Pick<RequestRow, "request_type" | "status">) {
  return request.request_type === "gioca" && giocaMatchingStates.includes(request.status);
}
