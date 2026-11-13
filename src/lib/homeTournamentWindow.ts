const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addCalendarDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function todayRomeISODate(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

export function getHomeTournamentWindow(today = todayRomeISODate()) {
  if (!ISO_DATE.test(today)) throw new Error("Invalid ISO calendar date");
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = addCalendarDays(today, mondayOffset);
  return { start, end: addCalendarDays(start, 13) };
}

export function getHomeFeaturedTournamentWindow(today = todayRomeISODate()) {
  return { start: today, end: getHomeTournamentWindow(today).end };
}

export function filterHomeTournaments<T extends { date?: string | null; time?: string | null }>(
  tournaments: T[],
  today = todayRomeISODate(),
) {
  const { start, end } = getHomeFeaturedTournamentWindow(today);
  return tournaments
    .filter((tournament) => Boolean(tournament.date && ISO_DATE.test(tournament.date) && tournament.date >= start && tournament.date <= end))
    .sort((a, b) => `${a.date}T${a.time || "00:00"}`.localeCompare(`${b.date}T${b.time || "00:00"}`));
}

export function getHomeTournamentCta(
  tournament: { hasLive?: boolean; registrations_open?: boolean; max_participants: number; counts?: { main: number } },
  status: "none" | "main" | "reserve",
) {
  if (tournament.hasLive) return "live";
  if (status === "main") return "registered";
  if (status === "reserve") return "reserve";
  if (tournament.registrations_open === false) return "closed";
  return (tournament.counts?.main ?? 0) >= tournament.max_participants ? "waitlist" : "register";
}
