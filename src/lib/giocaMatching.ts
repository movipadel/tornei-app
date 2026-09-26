import { requestClubs, type RequestRow, type RequestStatus } from "@/lib/moviRequests";
import { playerMatchingRequestedTypes, type PlayerMatchCriteria, type TimeWindow } from "@/lib/playerMatching";
import { playerProfileLevels, playerProfileWindows } from "@/lib/playerProfile";

export const giocaMatchingStates: RequestStatus[] = ["received", "searching", "found"];

export type GiocaMatchingContext = {
  clubs: string[];
  level: string | null;
  weekday: number | null;
  timeWindow: string | null;
  matchType: string | null;
  lastMinute: false;
  requesterExcluded: boolean;
};

type GiocaRequest = Pick<RequestRow, "request_type" | "clubs" | "requested_date" | "time_window" | "level" | "match_type">;

export function weekdayFromStoredDate(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data richiesta non valida");
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Data richiesta non valida");
  return ((date.getUTCDay() + 6) % 7) + 1;
}

export function giocaRequestToMatchingCriteria(request: GiocaRequest, requesterPlayerId: string | null): PlayerMatchCriteria {
  if (request.request_type !== "gioca") throw new Error("I suggerimenti sono disponibili solo per richieste Gioca");
  if (!Array.isArray(request.clubs) || request.clubs.some((club) => !requestClubs.includes(club as never))) throw new Error("Club richiesta non validi");
  if (request.level !== "unknown" && !playerProfileLevels.includes(request.level as never)) throw new Error("Livello richiesta non valido");
  if (!playerProfileWindows.includes(request.time_window as never) && request.time_window !== "any") throw new Error("Fascia richiesta non valida");
  if (request.match_type !== "any" && !playerMatchingRequestedTypes.includes(request.match_type as never)) throw new Error("Tipo partita richiesta non valido");
  return {
    clubs: [...request.clubs] as PlayerMatchCriteria["clubs"],
    targetLevelNumeric: null,
    targetLevelDescriptive: request.level === "unknown" ? null : request.level,
    weekday: weekdayFromStoredDate(request.requested_date),
    timeWindow: request.time_window === "any" ? null : request.time_window as TimeWindow,
    matchType: request.match_type === "any" ? null : request.match_type,
    lastMinute: false,
    excludePlayerId: requesterPlayerId,
  };
}

export function giocaMatchingContext(criteria: PlayerMatchCriteria): GiocaMatchingContext {
  return {
    clubs: [...criteria.clubs],
    level: criteria.targetLevelDescriptive,
    weekday: criteria.weekday,
    timeWindow: criteria.timeWindow,
    matchType: criteria.matchType,
    lastMinute: false,
    requesterExcluded: criteria.excludePlayerId !== null,
  };
}

export function supportsGiocaMatching(request: Pick<RequestRow, "request_type" | "status">) {
  return request.request_type === "gioca" && giocaMatchingStates.includes(request.status);
}
