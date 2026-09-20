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
    .select("id,name,slug,status,max_teams,published_at,created_at")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!season) return NextResponse.json({ data: { season: null, phase: null, teams: 0, rounds: 0, matches: 0 } });

  const [{ data: phase, error: phaseError }, { count: teams }, { count: rounds }, { count: matches }] =
    await Promise.all([
      sb.from("league_phases").select("id,code,name,status,algorithm_version,generation_fingerprint,generated_at").eq("season_id", season.id).eq("code", "phase1").single(),
      sb.from("league_teams").select("id", { count: "exact", head: true }).eq("season_id", season.id).eq("is_active", true),
      sb.from("league_rounds").select("id", { count: "exact", head: true }).in("phase_id", await phaseIds(sb, season.id)),
      sb.from("league_matches").select("id", { count: "exact", head: true }).in("phase_id", await phaseIds(sb, season.id)),
    ]);
  if (phaseError) return NextResponse.json({ error: phaseError.message }, { status: 500 });
  return NextResponse.json({ data: { season, phase, teams: teams ?? 0, rounds: rounds ?? 0, matches: matches ?? 0 } });
}

async function phaseIds(sb: ReturnType<typeof supabaseAdmin>, seasonId: string) {
  const { data } = await sb.from("league_phases").select("id").eq("season_id", seasonId);
  return (data ?? []).map((row) => row.id);
}
