import { NextResponse } from "next/server";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function PUT(req: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getUserIdFromCookie();
  if (!userId) return NextResponse.json({ error: "Autenticazione richiesta" }, { status: 401 });
  const { slug: teamId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const { data, error } = await supabaseAdmin().rpc("league_captain_replace_roster_preseason", {
    p_actor_user_id: userId, p_team_id: teamId, p_roster: Array.isArray(body.roster) ? body.roster : [],
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data);
}
