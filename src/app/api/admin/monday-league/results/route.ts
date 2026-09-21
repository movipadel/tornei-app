import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";
import { mondayLeagueAdminReadError } from "@/lib/monday-league/admin-read-error";

function adminResultsReadFailure(scope: string, error: { code?: string } | null | undefined) {
  const failure = mondayLeagueAdminReadError("results", scope, error);
  return NextResponse.json(failure.body, { status: failure.status });
}

export async function GET(req: Request) {
  const denied = await guardAdmin(); if (denied) return denied;
  const sb = supabaseAdmin();
  const { data: season, error: seasonError } = await sb.from("league_seasons").select("id,status").neq("status", "archived").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (seasonError) return adminResultsReadFailure("season", seasonError);
  if (!season) return NextResponse.json({ data: null });
  const { data: phases, error: phaseError } = await sb.from("league_phases").select("id,code,name,status").eq("season_id", season.id).in("status", ["generated", "in_progress", "finalized"]).order("sequence");
  if (phaseError) return adminResultsReadFailure("phases", phaseError);
  const requestedPhase = new URL(req.url).searchParams.get("phase");
  const phase = (phases ?? []).find((item) => item.id === requestedPhase || item.code === requestedPhase) ?? (phases ?? []).find((item) => item.code === "phase1") ?? null;
  if (!phase) return NextResponse.json({ data: null });
  const [teamResponse, playerResponse, roundResponse, matchResponse] = await Promise.all([
    sb.from("league_teams").select("id,name").eq("season_id", season.id),
    sb.from("league_team_players").select("id,team_id,display_name,is_active").eq("is_active", true),
    sb.from("league_rounds").select("id,round_number,play_date").eq("phase_id", phase.id).order("round_number"),
    sb.from("league_matches").select("id,round_id,home_team_id,away_team_id,scheduled_at,schedule_version,match_status,current_result_id,current_special_outcome_id").eq("phase_id", phase.id).order("scheduled_at"),
  ]);
  for (const [scope, response] of [["teams", teamResponse], ["players", playerResponse], ["rounds", roundResponse], ["matches", matchResponse]] as const) {
    if (response.error) return adminResultsReadFailure(scope, response.error);
  }
  const teams = teamResponse.data; const players = playerResponse.data;
  const rounds = roundResponse.data; const matches = matchResponse.data;
  const matchIds = (matches ?? []).map((match) => match.id);
  const resultIds = (matches ?? []).flatMap((match) => match.current_result_id ? [match.current_result_id] : []);
  const specialIds = (matches ?? []).flatMap((match) => match.current_special_outcome_id ? [match.current_special_outcome_id] : []);
  const [resultResponse, specialResponse, contestResponse, stateResponse] = await Promise.all([
    matchIds.length ? sb.from("league_result_submissions").select("*").in("match_id", matchIds).order("revision") : Promise.resolve({ data: [], error: null }),
    specialIds.length ? sb.from("league_match_special_outcomes").select("*").in("id", specialIds) : Promise.resolve({ data: [], error: null }),
    matchIds.length ? sb.from("league_result_contests").select("*").in("match_id", matchIds).order("opened_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    resultIds.length ? sb.rpc("league_get_result_states", { p_result_ids: resultIds }) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [scope, response] of [["results", resultResponse], ["special outcomes", specialResponse], ["contests", contestResponse], ["result states", stateResponse]] as const) {
    if (response.error) return adminResultsReadFailure(scope, response.error);
  }
  const results = resultResponse.data; const specials = specialResponse.data; const contests = contestResponse.data;
  const allResultIds = (results ?? []).map((result) => result.id);
  const [setResponse, contestUserResponse] = await Promise.all([
    allResultIds.length ? sb.from("league_match_sets").select("*").in("result_submission_id", allResultIds).order("set_number") : Promise.resolve({ data: [], error: null }),
    (contests ?? []).length ? sb.from("users").select("id,full_name").in("id", [...new Set((contests ?? []).map((contest) => contest.opened_by_user_id))]) : Promise.resolve({ data: [], error: null }),
  ]);
  if (setResponse.error) return adminResultsReadFailure("sets", setResponse.error);
  if (contestUserResponse.error) return adminResultsReadFailure("contest users", contestUserResponse.error);
  const sets = setResponse.data; const contestUsers = contestUserResponse.data;
  const teamIds = new Set((teams ?? []).map((team) => team.id));
  return NextResponse.json({ data: { season, phase, phases: phases ?? [], teams: teams ?? [], players: (players ?? []).filter((player) => teamIds.has(player.team_id)), rounds: rounds ?? [], matches: matches ?? [], results: results ?? [], sets: sets ?? [], specials: specials ?? [], contests: contests ?? [], contestUsers: contestUsers ?? [], resultStates: stateResponse.data ?? [] } });
}

export async function POST(req: Request) {
  const denied = await guardAdmin(); if (denied) return denied;
  const actor = await getMondayLeagueAdminActorId(); if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({})); const action = String(body.action ?? "");
  const sb = supabaseAdmin(); let call;
  if (action === "submit") call = sb.rpc("league_admin_submit_result", { p_actor_id: actor, p_match_id: body.match_id, p_sets: body.sets });
  else if (action === "correct") call = sb.rpc("league_admin_correct_result", { p_actor_id: actor, p_match_id: body.match_id, p_expected_result_id: body.expected_result_id, p_expected_status: body.expected_status, p_sets: body.sets, p_reason: body.reason });
  else if (action === "confirm") call = sb.rpc("league_admin_confirm_result", { p_actor_id: actor, p_match_id: body.match_id, p_expected_result_id: body.expected_result_id });
  else if (action === "resolve_contest") call = sb.rpc("league_admin_resolve_contest", {
    p_actor_id: actor, p_match_id: body.match_id, p_expected_result_id: body.expected_result_id,
    p_expected_contest_id: body.expected_contest_id, p_resolution: body.resolution,
    p_sets: body.resolution === "correct" ? body.sets : [], p_reason: body.reason,
  });
  else if (action === "workflow") call = sb.rpc("league_set_match_workflow_state", { p_actor_id: actor, p_match_id: body.match_id, p_expected_schedule_version: body.expected_schedule_version, p_state: body.state, p_reason: body.reason });
  else if (action === "special") call = sb.rpc("league_set_match_special_outcome", {
    p_actor_id: actor, p_match_id: body.match_id, p_expected_result_id: body.expected_result_id ?? null,
    p_expected_special_outcome_id: body.expected_special_outcome_id ?? null, p_outcome_type: body.outcome_type,
    p_winner_team_id: body.winner_team_id ?? null, p_counts_as_played: Boolean(body.counts_as_played),
    p_home_points: Number(body.home_points), p_away_points: Number(body.away_points), p_home_win: Boolean(body.home_win), p_away_win: Boolean(body.away_win),
    p_home_sets: Number(body.home_sets), p_away_sets: Number(body.away_sets), p_home_games: Number(body.home_games), p_away_games: Number(body.away_games), p_reason: body.reason,
  }); else return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
  const { data, error } = await call; if (error) return mondayLeagueErrorResponse(error); return NextResponse.json(data);
}
