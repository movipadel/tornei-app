import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guardAdmin(); if (denied) return denied;
  const actorId = await getMondayLeagueAdminActorId();
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const sb = supabaseAdmin();
  if (action === "visibility") {
    const { data, error } = await sb.rpc("league_set_season_visibility", { p_actor_id: actorId, p_season_id: body.season_id, p_visibility: body.visibility });
    if (error) return mondayLeagueErrorResponse(error); return NextResponse.json(data);
  }
  if (action === "archive") {
    const { data, error } = await sb.rpc("league_archive_season", { p_actor_id: actorId, p_season_id: body.season_id });
    if (error) return mondayLeagueErrorResponse(error); return NextResponse.json(data);
  }
  if (action === "delete") {
    const requestId = String(body.request_id || randomUUID());
    const { data, error } = await sb.rpc("league_delete_season", {
      p_actor_id: actorId, p_season_id: body.season_id,
      p_confirmation: String(body.confirmation ?? ""), p_request_id: requestId,
    });
    if (error) return mondayLeagueErrorResponse(error);
    const paths = Array.isArray(data?.data?.media_paths) ? data.data.media_paths.filter((path: unknown) =>
      typeof path === "string" && path.startsWith(`monday-league/${body.season_id}/`)) : [];
    let cleanupStatus = "complete"; let cleanupError: string | null = null;
    if (paths.length) {
      const cleanup = await sb.storage.from("monday-league-media").remove(paths);
      if (cleanup.error) { cleanupStatus = "failed"; cleanupError = cleanup.error.message; }
    }
    await sb.rpc("league_mark_storage_cleanup", {
      p_actor_id: actorId, p_request_id: requestId, p_status: cleanupStatus, p_error: cleanupError,
    });
    return NextResponse.json({ ...data, cleanup: { status: cleanupStatus, error: cleanupError }, request_id: requestId });
  }
  return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
}
