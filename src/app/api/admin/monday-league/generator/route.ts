import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const phaseId = new URL(req.url).searchParams.get("phase_id");
  if (!phaseId) return NextResponse.json({ error: "phase_id mancante" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: phase, error } = await sb.from("league_phases")
    .select("id,status,algorithm_version,generation_fingerprint,generated_at")
    .eq("id", phaseId).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const { data: run } = await sb.from("league_generation_runs")
    .select("input_team_order,quality_metrics,completed_at")
    .eq("phase_id", phaseId).eq("generation_kind", "phase_schedule").maybeSingle();
  const { data: memberships } = await sb.from("league_phase_teams")
    .select("team_id,seed_position,tie_break_order").eq("phase_id", phaseId).order("seed_position");
  const { data: rounds } = await sb.from("league_rounds")
    .select("id,round_number,status").eq("phase_id", phaseId).order("round_number");
  const roundIds = (rounds ?? []).map((round) => round.id);
  const { data: matches } = roundIds.length
    ? await sb.from("league_matches").select("id,round_id,home_team_id,away_team_id,match_status,venue_id,scheduled_at").in("round_id", roundIds).order("created_at")
    : { data: [] };
  return NextResponse.json({ data: { phase, run, memberships: memberships ?? [], rounds: rounds ?? [], matches: matches ?? [] } });
}
