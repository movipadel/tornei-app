import { NextResponse } from "next/server";
import { guardOperatorPermission } from "@/lib/operatorAuthorization";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";

export async function POST(req: Request) {
  const denied = await guardOperatorPermission("monday_league.manage"); if (denied) return denied;
  const actor = await getMondayLeagueAdminActorId(); if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { data, error } = await supabaseAdmin().rpc("league_schedule_round", {
    p_actor_id: actor, p_round_id: String(body.round_id ?? ""),
    p_expected_schedule_version: Number(body.expected_schedule_version), p_play_date: body.play_date || null,
    p_assignments: Array.isArray(body.assignments) ? body.assignments : [],
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data);
}
