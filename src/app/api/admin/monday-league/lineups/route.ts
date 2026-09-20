import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAdmin(); if (denied) return denied;
  const matchId = new URL(req.url).searchParams.get("match_id");
  if (!matchId) return NextResponse.json({ error: "match_id richiesto" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: lineups, error } = await sb.from("league_lineups")
    .select("id,match_id,team_id,revision,status,submitted_at,submitted_by_user_id,overridden_by_staff_id,override_reason")
    .eq("match_id", matchId).eq("status", "current");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (lineups ?? []).map((lineup) => lineup.id);
  const { data: players, error: playerError } = ids.length ? await sb.from("league_lineup_players")
    .select("lineup_id,slot,player_id,league_team_players(display_name)").in("lineup_id", ids).order("slot") : { data: [], error: null };
  if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 });
  return NextResponse.json({ data: (lineups ?? []).map((lineup) => ({ ...lineup, players: (players ?? []).filter((p) => p.lineup_id === lineup.id) })) });
}

export async function POST(req: Request) {
  const denied = await guardAdmin(); if (denied) return denied;
  const actorId = await getMondayLeagueAdminActorId();
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({})); const sb = supabaseAdmin();
  if (body.action === "reopen") {
    const { data, error } = await sb.rpc("league_reopen_lineups", { p_actor_id: actorId, p_match_id: body.match_id, p_reason: String(body.reason ?? "") });
    if (error) return mondayLeagueErrorResponse(error); return NextResponse.json(data);
  }
  const { data, error } = await sb.rpc("league_write_lineup", {
    p_actor_user_id: null, p_actor_staff_id: actorId, p_match_id: body.match_id,
    p_team_id: body.team_id, p_player_ids: Array.isArray(body.player_ids) ? body.player_ids : [],
    p_override_reason: String(body.reason ?? "") || null,
  });
  if (error) return mondayLeagueErrorResponse(error); return NextResponse.json(data);
}
