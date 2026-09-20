import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;
  const sb = supabaseAdmin();
  const { data: season, error } = await sb
    .from("league_seasons")
    .select("id,name,slug,status,max_teams,published_at,public_visibility,created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!season) return NextResponse.json({ data: { season: null, phase: null, teams: 0, rounds: 0, matches: 0, scheduled_rounds: 0, unscheduled_matches: 0, missing_results: 0, provisional_results: 0, confirmed_results: 0 } });

  const { data: phase, error: phaseError } = await sb.from("league_phases")
    .select("id,code,name,status,algorithm_version,generation_fingerprint,generated_at")
    .eq("season_id", season.id).eq("code", "phase1").maybeSingle();
  if (phaseError) return NextResponse.json({ error: phaseError.message }, { status: 500 });
  if (!phase) return NextResponse.json({ data: { season, phase: null, teams: 0, rounds: 0, matches: 0, scheduled_rounds: 0, unscheduled_matches: 0, missing_results: 0, provisional_results: 0, confirmed_results: 0 } });
  const [{ count: teams }, { data: rounds }, { data: matches }] = await Promise.all([
    sb.from("league_teams").select("id", { count: "exact", head: true }).eq("season_id", season.id).eq("is_active", true),
    sb.from("league_rounds").select("id,status").eq("phase_id", phase.id),
    sb.from("league_matches").select("id,match_status,current_result_id,current_special_outcome_id").eq("phase_id", phase.id),
  ]);
  const allMatches = matches ?? [];
  return NextResponse.json({ data: {
    season, phase, teams: teams ?? 0, rounds: rounds?.length ?? 0, matches: allMatches.length,
    scheduled_rounds: (rounds ?? []).filter((round) => round.status === "scheduled" || round.status === "completed").length,
    unscheduled_matches: allMatches.filter((match) => match.match_status === "unscheduled" || match.match_status === "postponed").length,
    missing_results: allMatches.filter((match) => ["scheduled", "postponed"].includes(match.match_status) && !match.current_result_id && !match.current_special_outcome_id).length,
    provisional_results: allMatches.filter((match) => ["submitted", "contested"].includes(match.match_status)).length,
    confirmed_results: allMatches.filter((match) => match.match_status === "confirmed").length,
  } });
}
