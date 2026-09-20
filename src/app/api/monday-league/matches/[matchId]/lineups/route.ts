import { NextResponse } from "next/server";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ matchId: string }> }) {
  const userId = await getUserIdFromCookie();
  if (!userId) return NextResponse.json({ error: "Autenticazione richiesta" }, { status: 401 });
  const { matchId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const { data, error } = await supabaseAdmin().rpc("league_write_lineup", {
    p_actor_user_id: userId, p_actor_staff_id: null, p_match_id: matchId,
    p_team_id: String(body.team_id ?? ""), p_player_ids: Array.isArray(body.player_ids) ? body.player_ids : [],
    p_override_reason: null,
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data);
}
