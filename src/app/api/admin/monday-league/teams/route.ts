import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse, slugifyLeagueName } from "@/lib/monday-league/admin-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const sb = supabaseAdmin();
  let seasonId = new URL(req.url).searchParams.get("season_id");
  if (!seasonId) {
    const { data: season } = await sb.from("league_seasons").select("id").neq("status", "archived").order("created_at", { ascending: false }).limit(1).maybeSingle();
    seasonId = season?.id ?? null;
  }
  if (!seasonId) return NextResponse.json({ data: [] });
  const { data: teams, error } = await sb.from("league_teams")
    .select("id,season_id,name,slug,captain_player_id,slogan,logo_path,image_path,is_active,created_at")
    .eq("season_id", seasonId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (teams ?? []).map((team) => team.id);
  const { data: players, error: playerError } = ids.length
    ? await sb.from("league_team_players").select("id,team_id,display_name,user_id,is_active,joined_at,left_at").in("team_id", ids).order("created_at")
    : { data: [], error: null };
  if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 });
  const { data: phase } = await sb.from("league_phases").select("id,status").eq("season_id", seasonId).eq("code", "phase1").maybeSingle();
  const { data: memberships } = phase
    ? await sb.from("league_phase_teams").select("team_id,seed_position,tie_break_order").eq("phase_id", phase.id)
    : { data: [] };
  return NextResponse.json({
    data: (teams ?? []).map((team) => ({
      ...team,
      players: (players ?? []).filter((player) => player.team_id === team.id),
      captain: (players ?? []).find((player) => player.id === team.captain_player_id) ?? null,
      seed_position: (memberships ?? []).find((membership) => membership.team_id === team.id)?.seed_position ?? null,
    })),
    phase,
  });
}

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const actorId = await getMondayLeagueAdminActorId();
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const { data, error } = await supabaseAdmin().rpc("league_save_team", {
    p_actor_id: actorId,
    p_season_id: String(body.season_id ?? ""),
    p_team_id: null,
    p_name: name,
    p_slug: slugifyLeagueName(String(body.slug ?? name)),
    p_captain_user_id: body.captain_user_id ?? null,
    p_roster: Array.isArray(body.roster) ? body.roster : [],
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data, { status: 201 });
}
