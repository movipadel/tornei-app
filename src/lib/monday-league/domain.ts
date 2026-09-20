export const MONDAY_LEAGUE_TITLE = "Monday League" as const;
export const MONDAY_LEAGUE_MAX_TEAMS = 16 as const;
export const MONDAY_LEAGUE_MAX_PLAYERS_PER_TEAM = 4 as const;
export const MONDAY_LEAGUE_TIMEZONE = "Europe/Rome" as const;
export const MONDAY_LEAGUE_PUBLIC_ROUTE = "/monday-league" as const;

export const LEAGUE_SEASON_STATUSES = [
  "draft",
  "phase1",
  "phase2",
  "completed",
  "archived",
] as const;

export type LeagueSeasonStatus = (typeof LEAGUE_SEASON_STATUSES)[number];

export const LEAGUE_PHASE_CODES = ["phase1", "serie_a", "serie_b"] as const;
export type LeaguePhaseCode = (typeof LEAGUE_PHASE_CODES)[number];

export const LEAGUE_PHASE_STATUSES = [
  "draft",
  "generated",
  "in_progress",
  "finalized",
] as const;

export type LeaguePhaseStatus = (typeof LEAGUE_PHASE_STATUSES)[number];

export const LEAGUE_ROUND_STATUSES = [
  "generated",
  "scheduling",
  "scheduled",
  "completed",
] as const;

export type LeagueRoundStatus = (typeof LEAGUE_ROUND_STATUSES)[number];

export const LEAGUE_MATCH_STATUSES = [
  "unscheduled",
  "scheduled",
  "submitted",
  "contested",
  "confirmed",
  "postponed",
  "cancelled",
  "suspended",
] as const;

export type LeagueMatchStatus = (typeof LEAGUE_MATCH_STATUSES)[number];

export const LEAGUE_VENUE_CODES = [
  "COSTIGLIOLE",
  "MANTA",
  "CENTALLO",
] as const;

export type LeagueVenueCode = (typeof LEAGUE_VENUE_CODES)[number];

export type MondayLeagueHeroState =
  | "pre_season"
  | "phase1_active"
  | "phase2_active"
  | "completed";

export type MondayLeagueHeroContent = {
  state: MondayLeagueHeroState;
  title: string;
  href: typeof MONDAY_LEAGUE_PUBLIC_ROUTE;
};

export function mondayLeagueHeroForStatus(
  status: Exclude<LeagueSeasonStatus, "archived">
): MondayLeagueHeroContent {
  const titleByStatus: Record<Exclude<LeagueSeasonStatus, "archived">, string> = {
    draft: "Monday League — Scopri le squadre",
    phase1: "Monday League — Classifica e prossima giornata",
    phase2: "Monday League — Serie A & Serie B",
    completed: "Monday League — Classifica finale",
  };

  const stateByStatus: Record<
    Exclude<LeagueSeasonStatus, "archived">,
    MondayLeagueHeroState
  > = {
    draft: "pre_season",
    phase1: "phase1_active",
    phase2: "phase2_active",
    completed: "completed",
  };

  return {
    state: stateByStatus[status],
    title: titleByStatus[status],
    href: MONDAY_LEAGUE_PUBLIC_ROUTE,
  };
}
