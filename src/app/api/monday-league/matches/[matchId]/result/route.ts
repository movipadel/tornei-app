import { NextResponse } from "next/server";

import { mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ matchId: string }> }) {
  const userId = await getUserIdFromCookie();
  if (!userId) return NextResponse.json({ error: "Autenticazione richiesta" }, { status: 401 });
  const { matchId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const sets = Array.isArray(body.sets) ? body.sets : null;
  if (!sets) return NextResponse.json({ error: "Set non validi" }, { status: 400 });
  const { data, error } = await supabaseAdmin().rpc("league_captain_submit_result", {
    p_actor_user_id: userId,
    p_match_id: matchId,
    p_sets: sets,
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data);
}
