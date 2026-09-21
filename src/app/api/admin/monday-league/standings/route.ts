import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mondayLeagueAdminReadError } from "@/lib/monday-league/admin-read-error";

function adminStandingsReadFailure(scope: string, error: { code?: string } | null | undefined) {
  const failure = mondayLeagueAdminReadError("standings", scope, error);
  return NextResponse.json(failure.body, { status: failure.status });
}

export async function GET(req: Request) {
  const denied = await guardAdmin(); if (denied) return denied;
  const sb = supabaseAdmin();
  const requested = new URL(req.url).searchParams.get("phase_id");
  const { data: season, error: seasonError } = await sb.from("league_seasons").select("id").neq("status", "archived").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (seasonError) return adminStandingsReadFailure("season", seasonError);
  if (!season) return NextResponse.json({ data: null });
  const { data: phases, error: phaseError } = await sb.from("league_phases").select("id,code,name,status").eq("season_id", season.id).in("status", ["generated", "in_progress", "finalized"]).order("sequence");
  if (phaseError) return adminStandingsReadFailure("phases", phaseError);
  const phase = (phases ?? []).find((item) => item.id === requested || item.code === requested) ?? (phases ?? []).find((item) => item.code === "phase1") ?? null;
  if (!phase) return NextResponse.json({ data: null });
  const { data, error } = await sb.rpc("league_get_standings", { p_phase_id: phase.id });
  if (error) return adminStandingsReadFailure("standings", error);
  return NextResponse.json({ data: { ...data, phase, phases: phases ?? [] } });
}
