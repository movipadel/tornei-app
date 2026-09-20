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
  const reason = String(body.reason ?? "").trim();
  const resultId = String(body.result_id ?? "").trim();
  if (!resultId || !reason || reason.length > 1000) {
    return NextResponse.json({ error: "Motivazione obbligatoria (massimo 1000 caratteri)" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin().rpc("league_away_captain_contest_result", {
    p_actor_user_id: userId,
    p_match_id: matchId,
    p_expected_result_id: resultId,
    p_reason: reason,
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data);
}
