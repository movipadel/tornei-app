import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateMondayLeaguePhase1 } from "@/lib/monday-league/generator";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const phaseId = String(body.phase_id ?? "");
  const orderedTeamIds = Array.isArray(body.ordered_team_ids)
    ? body.ordered_team_ids.map((id: unknown) => String(id))
    : [];
  const sb = supabaseAdmin();
  const { data: phase, error: phaseError } = await sb
    .from("league_phases").select("id,season_id,status,generated_at,generation_fingerprint")
    .eq("id", phaseId).eq("code", "phase1").single();
  if (phaseError || !phase) return NextResponse.json({ error: "Fase 1 non trovata" }, { status: 404 });
  const { data: teams, error } = await sb.from("league_teams").select("id,name")
    .eq("season_id", phase.season_id).eq("is_active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const activeIds = (teams ?? []).map((team) => team.id).sort();
  if (new Set(orderedTeamIds).size !== orderedTeamIds.length ||
      JSON.stringify([...orderedTeamIds].sort()) !== JSON.stringify(activeIds)) {
    return NextResponse.json({ error: "L’ordine deve includere esattamente tutte le squadre attive" }, { status: 400 });
  }
  try {
    const generation = generateMondayLeaguePhase1(phaseId, orderedTeamIds);
    const names = new Map((teams ?? []).map((team) => [team.id, team.name]));
    return NextResponse.json({ data: generation, team_names: Object.fromEntries(names), phase });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview non valida" }, { status: 400 });
  }
}
