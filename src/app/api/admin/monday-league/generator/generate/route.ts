import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateMondayLeaguePhase1 } from "@/lib/monday-league/generator";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const actorId = await getMondayLeagueAdminActorId();
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const phaseId = String(body.phase_id ?? "");
  const orderedTeamIds = Array.isArray(body.ordered_team_ids)
    ? body.ordered_team_ids.map((id: unknown) => String(id))
    : [];
  const sb = supabaseAdmin();
  const { data: phase, error: phaseError } = await sb
    .from("league_phases").select("id,season_id").eq("id", phaseId).eq("code", "phase1").single();
  if (phaseError || !phase) return NextResponse.json({ error: "Fase 1 non trovata" }, { status: 404 });
  const { data: teams, error: teamError } = await sb.from("league_teams").select("id")
    .eq("season_id", phase.season_id).eq("is_active", true);
  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 });
  const activeIds = (teams ?? []).map((team) => team.id).sort();
  if (new Set(orderedTeamIds).size !== orderedTeamIds.length ||
      JSON.stringify([...orderedTeamIds].sort()) !== JSON.stringify(activeIds)) {
    return NextResponse.json({ error: "L’ordine deve includere esattamente tutte le squadre attive" }, { status: 400 });
  }
  let generation;
  try {
    generation = generateMondayLeaguePhase1(phaseId, orderedTeamIds);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Calendario non valido" }, { status: 400 });
  }
  const { data, error } = await sb.rpc("league_generate_phase1", {
    p_actor_id: actorId,
    p_phase_id: phaseId,
    p_ordered_team_ids: generation.orderedTeamIds,
    p_tie_break_team_ids: generation.tieBreakOrder,
    p_algorithm_version: generation.algorithmVersion,
    p_fingerprint: generation.fingerprint,
    p_fingerprint_payload: generation.fingerprintPayload,
    p_rounds: generation.rounds,
    p_quality_metrics: generation.quality,
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data, { status: data?.created ? 201 : 200 });
}
