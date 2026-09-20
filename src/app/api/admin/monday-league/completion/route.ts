import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentCompletionReadiness() {
  const sb = supabaseAdmin();
  const { data: season, error } = await sb.from("league_seasons")
    .select("id,name,status,completed_at,public_visibility")
    .neq("status", "archived").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!season || !["phase2", "completed"].includes(season.status)) return { season, readiness: null };
  const { data, error: readinessError } = await sb.rpc("league_phase2_completion_readiness", { p_season_id: season.id });
  if (readinessError) throw readinessError;
  return { season, readiness: data };
}

export async function GET() {
  const denied = await guardAdmin(); if (denied) return denied;
  try { return NextResponse.json({ data: await currentCompletionReadiness() }); }
  catch (error) { return mondayLeagueErrorResponse(error as { message?: string }); }
}

export async function POST(req: Request) {
  const denied = await guardAdmin(); if (denied) return denied;
  const actorId = await getMondayLeagueAdminActorId();
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const expectedFingerprint = String(body.expected_fingerprint ?? "");
  if (!expectedFingerprint) return NextResponse.json({ error: "Preview obbligatoria" }, { status: 400 });
  try {
    const { season } = await currentCompletionReadiness();
    if (!season) return NextResponse.json({ error: "Stagione non trovata" }, { status: 404 });
    const { data, error } = await supabaseAdmin().rpc("league_complete_season", {
      p_actor_id: actorId, p_season_id: season.id, p_expected_fingerprint: expectedFingerprint,
    });
    if (error) return mondayLeagueErrorResponse(error);
    return NextResponse.json(data, { status: data?.created ? 201 : 200 });
  } catch (error) { return mondayLeagueErrorResponse(error as { message?: string }); }
}
