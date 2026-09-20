import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
const BUCKET = "monday-league-media";
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug: teamId } = await context.params;
  const [userId, staffId, form] = await Promise.all([getUserIdFromCookie(), getMondayLeagueAdminActorId(), req.formData()]);
  if (!userId && !staffId) return NextResponse.json({ error: "Autenticazione richiesta" }, { status: 401 });
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  if (!(file instanceof File) || !["logo", "hero"].includes(kind) || !TYPES[file.type]) {
    return NextResponse.json({ error: "File o tipo immagine non valido" }, { status: 400 });
  }
  const limit = kind === "logo" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size <= 0 || file.size > limit) return NextResponse.json({ error: "Dimensione immagine non valida" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: team } = await sb.from("league_teams").select("season_id,slogan,logo_path,image_path").eq("id", teamId).maybeSingle();
  if (!team) return NextResponse.json({ error: "Squadra non trovata" }, { status: 404 });
  if (!staffId) {
    const { data: ownsTeam, error: ownershipError } = await sb.rpc("league_is_captain", { p_user_id: userId, p_team_id: teamId });
    if (ownershipError || !ownsTeam) return NextResponse.json({ error: "Solo il capitano della squadra può caricare immagini" }, { status: 403 });
  }
  const path = `monday-league/${team.season_id}/${teamId}/${kind}/${randomUUID()}.${TYPES[file.type]}`;
  const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  const { data, error } = await sb.rpc("league_update_team_profile", {
    p_actor_user_id: staffId ? null : userId, p_actor_staff_id: staffId, p_team_id: teamId,
    p_slogan: team.slogan, p_logo_path: kind === "logo" ? path : team.logo_path,
    p_image_path: kind === "hero" ? path : team.image_path,
  });
  if (error) {
    await sb.storage.from(BUCKET).remove([path]);
    return mondayLeagueErrorResponse(error);
  }
  return NextResponse.json({ ...data, path });
}
