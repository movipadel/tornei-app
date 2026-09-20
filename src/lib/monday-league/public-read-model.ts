import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type PublicLeaguePhase = {
  id: string;
  code: "phase1" | "serie_a" | "serie_b";
  name: string;
  sequence: number;
  status: "draft" | "generated" | "in_progress" | "finalized";
};

export type PublicStanding = {
  position: number;
  teamId: string;
  teamName: string;
  points: number;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  setDifference: number;
  gamesWon: number;
  gamesLost: number;
  gameDifference: number;
};

export type PublicMatch = {
  id: string;
  roundId: string;
  homeTeam: { id: string; name: string; slug: string };
  awayTeam: { id: string; name: string; slug: string };
  scheduledAt: string | null;
  venue: { id: string; name: string } | null;
  workflowStatus: string;
  workflowLabel: string;
  lineups: null | {
    home: { state: "submitted"; players: string[] } | { state: "missing"; label: string };
    away: { state: "submitted"; players: string[] } | { state: "missing"; label: string };
  };
  result: null | {
    kind: "played" | "special";
    summary: string;
    status: "submitted" | "contested" | "confirmed" | "special";
    statusLabel: string;
    submittedAt?: string | null;
    contestDeadline?: string | null;
    sets: Array<{ number: number; homeGames: number; awayGames: number }>;
    actualPlayers: { home: string[]; away: string[] };
    specialType?: "walkover" | "no_show" | "administrative";
    winnerTeamId?: string | null;
  };
};

export type PublicRound = {
  id: string;
  number: number;
  playDate: string | null;
  matches: PublicMatch[];
};

export type PublicTeamCard = {
  id: string;
  name: string;
  slug: string;
  slogan: string | null;
  logoUrl: string | null;
  position: number | null;
  points: number;
};

export type PublicLeagueSnapshot = {
  available: true;
  season: { id: string; name: string; slug: string; status: string; timezone: "Europe/Rome" };
  phases: PublicLeaguePhase[];
  selectedPhase: PublicLeaguePhase;
  hasProvisionalResults: boolean;
  standings: PublicStanding[];
  rounds: PublicRound[];
  teams: PublicTeamCard[];
};

export type PublicLeagueUnavailable = { available: false };

type RawStanding = {
  position: number;
  team_id: string;
  team_name: string;
  points: number;
  played: number;
  wins: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
  set_difference: number;
  games_won: number;
  games_lost: number;
  game_difference: number;
};

type RawStandingsResponse = { rows?: RawStanding[]; has_provisional_results?: boolean };
type RawPublicLineupRow = {
  match_id: string;
  home_lineup: NonNullable<PublicMatch["lineups"]>["home"] | null;
  away_lineup: NonNullable<PublicMatch["lineups"]>["away"] | null;
};
type RawResultState = {
  result_id: string;
  effective_status: "submitted" | "contested" | "confirmed" | "superseded";
  submitted_at: string;
  contest_deadline: string;
};

const VISIBLE_SEASON_STATES = ["draft", "phase1", "phase2", "completed", "archived"];
const VISIBLE_PHASE_STATES = ["draft", "generated", "in_progress", "finalized"];

function assertQuery(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function safeMediaUrl(value: unknown): string | null {
  const path = String(value ?? "").trim();
  if (!path) return null;
  if (path.startsWith("/") || /^https:\/\//i.test(path)) return path;
  if (/^monday-league\/[0-9a-f-]+\/[0-9a-f-]+\/(logo|hero)\/[0-9a-f-]+\.(png|jpe?g|webp)$/i.test(path)) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    if (base) return `${base}/storage/v1/object/public/monday-league-media/${path.split("/").map(encodeURIComponent).join("/")}`;
  }
  return null;
}

function selectDefaultPhase(phases: PublicLeaguePhase[], seasonStatus: string) {
  const active = phases.filter((phase) => phase.status === "in_progress");
  if (active.length) return active.sort((a, b) => b.sequence - a.sequence || a.code.localeCompare(b.code))[0];
  if (seasonStatus === "phase1") return phases.find((phase) => phase.code === "phase1") ?? phases[0];
  return [...phases].sort((a, b) => b.sequence - a.sequence || a.code.localeCompare(b.code))[0];
}

function workflowLabel(status: string) {
  return ({
    unscheduled: "Da programmare",
    scheduled: "In programma",
    submitted: "Risultato provvisorio",
    contested: "Risultato contestato",
    confirmed: "Conclusa",
    postponed: "Rinviata",
    suspended: "Sospesa",
    cancelled: "Annullata",
  } as Record<string, string>)[status] ?? "Stato non disponibile";
}

function specialLabel(type: string) {
  return ({ walkover: "Vittoria a tavolino", no_show: "No-show", administrative: "Decisione amministrativa" } as Record<string, string>)[type] ?? "Esito speciale";
}

export function derivePublicLeagueHeroState(status: string) {
  if (status === "phase1") return { eyebrow: "Monday League", title: "Classifica e prossima giornata" };
  if (status === "phase2") return { eyebrow: "Monday League", title: "Serie A & Serie B" };
  if (status === "completed") return { eyebrow: "Monday League", title: "Classifica finale" };
  return { eyebrow: "Monday League", title: "Scopri le squadre" };
}

export async function getPublicLeagueSnapshot(phaseId?: string | null): Promise<PublicLeagueSnapshot | PublicLeagueUnavailable> {
  const sb = supabaseAdmin();
  const now = new Date().toISOString();
  const { data: season, error: seasonError } = await sb
    .from("league_seasons")
    .select("id,name,slug,status,timezone,published_at,public_visibility")
    .in("status", VISIBLE_SEASON_STATES)
    .eq("public_visibility", "public")
    .not("published_at", "is", null)
    .lte("published_at", now)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertQuery(seasonError, "public season");
  if (!season) return { available: false };

  const { data: phaseRows, error: phaseError } = await sb
    .from("league_phases")
    .select("id,code,name,sequence,status")
    .eq("season_id", season.id)
    .in("status", VISIBLE_PHASE_STATES)
    .order("sequence", { ascending: true })
    .order("code", { ascending: true });
  assertQuery(phaseError, "public phases");

  const phases = (phaseRows ?? []) as PublicLeaguePhase[];
  if (!phases.length) return { available: false };
  const selectedPhase = phases.find((phase) => phase.id === phaseId) ?? selectDefaultPhase(phases, season.status);
  if (!selectedPhase) return { available: false };

  const [{ data: membershipRows, error: membershipError }, { data: roundRows, error: roundError }, standingsResponse] = await Promise.all([
    selectedPhase.status === "draft"
      ? sb.from("league_teams").select("id").eq("season_id", season.id).eq("is_active", true)
      : sb.from("league_phase_teams").select("team_id").eq("phase_id", selectedPhase.id),
    sb.from("league_rounds").select("id,round_number,play_date").eq("phase_id", selectedPhase.id).order("round_number"),
    sb.rpc("league_get_standings", { p_phase_id: selectedPhase.id }),
  ]);
  assertQuery(membershipError, "public memberships");
  assertQuery(roundError, "public rounds");
  assertQuery(standingsResponse.error, "public standings");

  const teamIds = (membershipRows ?? []).map((row) => "team_id" in row ? row.team_id : row.id);
  const roundIds = (roundRows ?? []).map((row) => row.id);
  const [{ data: teamRows, error: teamError }, { data: matchRows, error: matchError }, { data: venueRows, error: venueError }] = await Promise.all([
    teamIds.length
      ? sb.from("league_teams").select("id,name,slug,slogan,logo_path").eq("season_id", season.id).in("id", teamIds)
      : Promise.resolve({ data: [], error: null }),
    roundIds.length
      ? sb.from("league_matches").select("id,round_id,home_team_id,away_team_id,venue_id,scheduled_at,lineups_locked_at,match_status,current_result_id,current_special_outcome_id,created_at").in("round_id", roundIds).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    sb.from("league_venues").select("id,name"),
  ]);
  assertQuery(teamError, "public teams");
  assertQuery(matchError, "public matches");
  assertQuery(venueError, "public venues");

  const lineupResponse = (matchRows ?? []).length
    ? await sb.rpc("league_get_public_lineups", { p_match_ids: (matchRows ?? []).map((match) => match.id) })
    : { data: [], error: null };
  assertQuery(lineupResponse.error, "public lineups");
  const publicLineupRows = (lineupResponse.data ?? []) as RawPublicLineupRow[];
  const lineupsByMatch = new Map<string, RawPublicLineupRow>(publicLineupRows.map((row) => [row.match_id, row]));

  const currentResultIds = (matchRows ?? []).flatMap((match) => match.current_result_id ? [match.current_result_id] : []);
  const currentSpecialIds = (matchRows ?? []).flatMap((match) => match.current_special_outcome_id ? [match.current_special_outcome_id] : []);
  const [{ data: resultRows, error: resultError }, { data: setRows, error: setError }, { data: specialRows, error: specialError }, resultStatesResponse] = await Promise.all([
    currentResultIds.length
      ? sb.from("league_result_submissions").select("id,status,home_sets_won,away_sets_won").in("id", currentResultIds).in("status", ["submitted", "contested", "confirmed"])
      : Promise.resolve({ data: [], error: null }),
    currentResultIds.length
      ? sb.from("league_match_sets").select("result_submission_id,set_number,home_games,away_games").in("result_submission_id", currentResultIds).order("set_number")
      : Promise.resolve({ data: [], error: null }),
    currentSpecialIds.length
      ? sb.from("league_match_special_outcomes").select("id,outcome_type,winner_team_id,status").in("id", currentSpecialIds).eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
    currentResultIds.length
      ? sb.rpc("league_get_result_states", { p_result_ids: currentResultIds })
      : Promise.resolve({ data: [], error: null }),
  ]);
  assertQuery(resultError, "public results");
  assertQuery(setError, "public sets");
  assertQuery(specialError, "public special outcomes");
  assertQuery(resultStatesResponse.error, "public result states");

  const rawStandings = (standingsResponse.data ?? {}) as RawStandingsResponse;
  const standings: PublicStanding[] = (rawStandings.rows ?? []).map((row) => ({
    position: row.position,
    teamId: row.team_id,
    teamName: row.team_name,
    points: row.points,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    setsWon: row.sets_won,
    setsLost: row.sets_lost,
    setDifference: row.set_difference,
    gamesWon: row.games_won,
    gamesLost: row.games_lost,
    gameDifference: row.game_difference,
  }));
  const standingsByTeam = new Map(standings.map((row) => [row.teamId, row]));
  const teamsById = new Map((teamRows ?? []).map((team) => [team.id, team]));
  const venuesById = new Map((venueRows ?? []).map((venue) => [venue.id, venue]));
  const resultsById = new Map((resultRows ?? []).map((result) => [result.id, result]));
  const resultStatesById = new Map(((resultStatesResponse.data ?? []) as RawResultState[]).map((state) => [state.result_id, state]));
  const specialsById = new Map((specialRows ?? []).map((special) => [special.id, special]));

  const matches: PublicMatch[] = (matchRows ?? []).flatMap((match) => {
    const home = teamsById.get(match.home_team_id);
    const away = teamsById.get(match.away_team_id);
    if (!home || !away) return [];
    const standard = match.current_result_id ? resultsById.get(match.current_result_id) : null;
    const resultState = standard ? resultStatesById.get(standard.id) : null;
    const special = match.current_special_outcome_id ? specialsById.get(match.current_special_outcome_id) : null;
    const sets = standard
      ? (setRows ?? []).filter((set) => set.result_submission_id === standard.id).map((set) => ({ number: set.set_number, homeGames: set.home_games, awayGames: set.away_games }))
      : [];
    const result = standard ? {
      kind: "played" as const,
      summary: `${standard.home_sets_won}–${standard.away_sets_won}`,
      status: (resultState?.effective_status ?? standard.status) as "submitted" | "contested" | "confirmed",
      statusLabel: (resultState?.effective_status ?? standard.status) === "submitted" ? "Provvisorio" : (resultState?.effective_status ?? standard.status) === "contested" ? "Contestato" : "Definitivo",
      submittedAt: resultState?.submitted_at ?? null,
      contestDeadline: resultState?.contest_deadline ?? null,
      sets,
      actualPlayers: { home: [], away: [] },
    } : special ? {
      kind: "special" as const,
      summary: specialLabel(special.outcome_type),
      status: "special" as const,
      statusLabel: "Speciale",
      sets: [],
      actualPlayers: { home: [], away: [] },
      specialType: special.outcome_type as "walkover" | "no_show" | "administrative",
      winnerTeamId: special.winner_team_id,
    } : null;
    return [{
      id: match.id,
      roundId: match.round_id,
      homeTeam: { id: home.id, name: home.name, slug: home.slug },
      awayTeam: { id: away.id, name: away.name, slug: away.slug },
      scheduledAt: match.scheduled_at,
      venue: match.venue_id && venuesById.get(match.venue_id) ? { id: match.venue_id, name: venuesById.get(match.venue_id)!.name } : null,
      workflowStatus: match.match_status,
      workflowLabel: workflowLabel(match.match_status),
      lineups: lineupsByMatch.get(match.id)?.home_lineup && lineupsByMatch.get(match.id)?.away_lineup ? {
        home: lineupsByMatch.get(match.id)!.home_lineup as NonNullable<PublicMatch["lineups"]>["home"],
        away: lineupsByMatch.get(match.id)!.away_lineup as NonNullable<PublicMatch["lineups"]>["away"],
      } : null,
      result,
    }];
  });

  const matchesByRound = new Map<string, PublicMatch[]>();
  for (const match of matches) matchesByRound.set(match.roundId, [...(matchesByRound.get(match.roundId) ?? []), match]);

  const teams: PublicTeamCard[] = (teamRows ?? [])
    .map((team) => ({
      id: team.id,
      name: team.name,
      slug: team.slug,
      slogan: team.slogan,
      logoUrl: safeMediaUrl(team.logo_path),
      position: standingsByTeam.get(team.id)?.position ?? null,
      points: standingsByTeam.get(team.id)?.points ?? 0,
    }))
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.name.localeCompare(b.name));

  return {
    available: true,
    season: { id: season.id, name: season.name, slug: season.slug, status: season.status, timezone: "Europe/Rome" },
    phases,
    selectedPhase,
    hasProvisionalResults: Boolean(rawStandings.has_provisional_results),
    standings,
    rounds: (roundRows ?? []).map((round) => ({ id: round.id, number: round.round_number, playDate: round.play_date, matches: matchesByRound.get(round.id) ?? [] })),
    teams,
  };
}

export async function getPublicLeagueTeam(slug: string, phaseId?: string | null, viewerUserId?: string | null) {
  let snapshot = await getPublicLeagueSnapshot(phaseId);
  if (!snapshot.available) return snapshot;
  if (!phaseId && snapshot.season.status === "phase2") {
    const lookup = supabaseAdmin();
    const { data: candidate } = await lookup.from("league_teams").select("id").eq("season_id", snapshot.season.id).eq("slug", slug).maybeSingle();
    if (candidate) {
      const currentPhaseIds = snapshot.phases.filter((phase) => phase.code !== "phase1").map((phase) => phase.id);
      const { data: membership } = currentPhaseIds.length
        ? await lookup.from("league_phase_teams").select("phase_id").eq("team_id", candidate.id).in("phase_id", currentPhaseIds).maybeSingle()
        : { data: null };
      if (membership?.phase_id && membership.phase_id !== snapshot.selectedPhase.id) {
        snapshot = await getPublicLeagueSnapshot(membership.phase_id);
        if (!snapshot.available) return snapshot;
      }
    }
  }
  const summary = snapshot.teams.find((team) => team.slug === slug);
  if (!summary) return { available: true as const, found: false as const, snapshot };

  const sb = supabaseAdmin();
  const { data: team, error: teamError } = await sb
    .from("league_teams")
    .select("id,name,slug,slogan,logo_path,image_path,captain_player_id")
    .eq("id", summary.id)
    .eq("season_id", snapshot.season.id)
    .single();
  assertQuery(teamError, "public team profile");
  if (!team) return { available: true as const, found: false as const, snapshot };
  const { data: players, error: playerError } = await sb
    .from("league_team_players")
    .select("id,display_name")
    .eq("team_id", team.id)
    .eq("is_active", true)
    .order("joined_at");
  assertQuery(playerError, "public roster");

  const standing = snapshot.standings.find((row) => row.teamId === team.id) ?? null;
  const schedule = snapshot.rounds.flatMap((round) => round.matches
    .filter((match) => match.homeTeam.id === team.id || match.awayTeam.id === team.id)
    .map((match) => ({ ...match, roundNumber: round.number, playDate: round.playDate, side: match.homeTeam.id === team.id ? "home" as const : "away" as const })));
  const nextMatch = schedule.find((match) => !match.result && !["cancelled", "suspended"].includes(match.workflowStatus)) ?? null;
  const captainResponse = viewerUserId
    ? await sb.rpc("league_get_captain_context", { p_user_id: viewerUserId, p_team_id: team.id })
    : { data: null, error: null };
  assertQuery(captainResponse.error, "captain context");
  const captainResultResponse = viewerUserId
    ? await sb.rpc("league_get_captain_result_context", { p_user_id: viewerUserId, p_team_id: team.id })
    : { data: null, error: null };
  assertQuery(captainResultResponse.error, "captain result context");
  const captainContext = captainResponse.data ? {
    ...captainResponse.data,
    result: captainResultResponse.data ?? null,
    roster: (players ?? []).map((player) => ({ id: player.id, displayName: player.display_name, isCaptain: player.id === team.captain_player_id })),
  } : null;

  return {
    available: true as const,
    found: true as const,
    snapshot: { season: snapshot.season, phases: snapshot.phases, selectedPhase: snapshot.selectedPhase },
    team: {
      id: team.id,
      name: team.name,
      slug: team.slug,
      slogan: team.slogan,
      logoUrl: safeMediaUrl(team.logo_path),
      imageUrl: safeMediaUrl(team.image_path),
      roster: (players ?? []).map((player) => ({ displayName: player.display_name, isCaptain: player.id === team.captain_player_id })),
      standing,
      nextMatch,
      schedule,
    },
    captain: captainContext,
  };
}
