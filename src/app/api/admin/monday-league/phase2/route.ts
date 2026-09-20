import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildPhase2Generation, type Phase2Readiness } from "@/lib/monday-league/phase2";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentReadiness() {
  const sb = supabaseAdmin();
  const { data: season, error } = await sb.from("league_seasons").select("id,name,status")
    .neq("status", "archived").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!season) return { season: null, readiness: null };
  const { data, error: readinessError } = await sb.rpc("league_phase2_readiness", { p_season_id: season.id });
  if (readinessError) throw readinessError;
  return { season, readiness: data as Phase2Readiness };
}

export async function GET() {
  const denied = await guardAdmin(); if (denied) return denied;
  try { return NextResponse.json({ data: await currentReadiness() }); }
  catch (error) { return mondayLeagueErrorResponse(error as { message?: string }); }
}

export async function POST(req: Request) {
  const denied = await guardAdmin(); if (denied) return denied;
  const actorId = await getMondayLeagueAdminActorId();
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    const { season, readiness } = await currentReadiness();
    if (!season || !readiness) return NextResponse.json({ error: "Stagione non trovata" }, { status: 404 });
    const expected = String(body.expected_fingerprint ?? "");
    if (!expected) return NextResponse.json({ error: "Preview obbligatoria" }, { status: 400 });
    const generation = buildPhase2Generation(readiness);
    const { data, error } = await supabaseAdmin().rpc("league_generate_phase2", {
      p_actor_id: actorId, p_season_id: season.id, p_expected_fingerprint: expected,
      p_serie_a_phase_id: generation.serieAPhaseId, p_serie_b_phase_id: generation.serieBPhaseId,
      p_serie_a_rounds: generation.serieA.rounds, p_serie_b_rounds: generation.serieB.rounds,
      p_serie_a_quality: generation.serieA.quality, p_serie_b_quality: generation.serieB.quality,
    });
    if (error) return mondayLeagueErrorResponse(error);
    return NextResponse.json(data, { status: data?.created ? 201 : 200 });
  } catch (error) { return mondayLeagueErrorResponse(error as { message?: string }); }
}
