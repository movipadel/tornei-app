export const MOVI_VENUES = ["Revello", "Saluzzo", "Manta", "Costigliole", "Centallo"] as const;

export type TournamentPosterInput = {
  id?: string;
  name?: string | null;
  type?: string | null;
  category?: string | null;
  level?: string | null;
  date?: string | null;
  time?: string | null;
  club_name?: string | null;
  max_participants?: number | null;
  circuit_name?: string | null;
  qr_url?: string | null;
};

export type TournamentPosterData = {
  name: string;
  circuitName: string;
  category: string;
  level: string;
  dateDayName: string;
  dateDayNumber: string;
  dateMonth: string;
  time: string;
  capacityLabel: "MAX" | "MAX COPPIE";
  capacity: string;
  venues: Array<{ name: string; active: boolean }>;
  qrUrl: string;
};

export function getTournamentPosterData(tournament: TournamentPosterInput): TournamentPosterData {
  const type = String(tournament.type ?? "").trim().toLowerCase();
  const dateParts = formatDateParts(tournament.date ?? "");

  return {
    name: String(tournament.name ?? "").trim() || "TORNEO MOVI",
    circuitName: String(tournament.circuit_name ?? "").trim(),
    category: String(tournament.category ?? "").trim().toUpperCase(),
    level: String(tournament.level ?? "").trim().toUpperCase(),
    dateDayName: dateParts.dayName,
    dateDayNumber: dateParts.dayNumber,
    dateMonth: dateParts.month,
    time: formatTime(tournament.time ?? ""),
    capacityLabel: type === "coppie fisse" ? "MAX COPPIE" : "MAX",
    capacity: tournament.max_participants ? String(tournament.max_participants) : "",
    venues: buildVenueList(tournament.club_name ?? ""),
    qrUrl: String(tournament.qr_url ?? "").trim(),
  };
}

function formatDateParts(dateStr: string) {
  if (!dateStr) return { dayName: "", dayNumber: "", month: "" };
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const days = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];
  const months = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
  return { dayName: days[date.getUTCDay()] ?? "", dayNumber: String(day || "").padStart(2, "0"), month: months[(month || 1) - 1] ?? "" };
}

function formatTime(timeStr: string) {
  return timeStr ? timeStr.slice(0, 5) : "";
}

function normalizeVenue(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^MOVI\s+(PADEL\s+)?CLUB\s+/i, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

export function buildVenueList(location: string) {
  const normalized = normalizeVenue(location);
  const activeVenue = MOVI_VENUES.find((venue) => normalized.includes(normalizeVenue(venue)));
  return MOVI_VENUES.map((name) => ({ name, active: name === activeVenue }));
}
