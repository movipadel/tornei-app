import { NextResponse } from "next/server";
import { guardOperatorPermission } from "@/lib/operatorAuthorization";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";

export async function POST(req: Request) {
  const denied = await guardOperatorPermission("monday_league.manage"); if (denied) return denied;
  const actor = await getMondayLeagueAdminActorId(); if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { data, error } = await supabaseAdmin().rpc("league_set_round_dates", {
    p_actor_id: actor, p_phase_id: String(body.phase_id ?? ""), p_dates: Array.isArray(body.dates) ? body.dates : [],
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data);
}
