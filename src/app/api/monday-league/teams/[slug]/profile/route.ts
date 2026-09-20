import { NextResponse } from "next/server";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse } from "@/lib/monday-league/admin-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function PATCH(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug: teamId } = await context.params;
  const [userId, staffId, body] = await Promise.all([
    getUserIdFromCookie(), getMondayLeagueAdminActorId(), req.json().catch(() => ({})),
  ]);
  if (!userId && !staffId) return NextResponse.json({ error: "Autenticazione richiesta" }, { status: 401 });
  const { data: current, error: readError } = await supabaseAdmin().from("league_teams")
    .select("slogan,logo_path,image_path").eq("id", teamId).maybeSingle();
  if (readError || !current) return NextResponse.json({ error: "Squadra non trovata" }, { status: 404 });
  const { data, error } = await supabaseAdmin().rpc("league_update_team_profile", {
    p_actor_user_id: staffId ? null : userId,
    p_actor_staff_id: staffId,
    p_team_id: teamId,
    p_slogan: Object.hasOwn(body, "slogan") ? String(body.slogan ?? "") : current.slogan,
    p_logo_path: Object.hasOwn(body, "logo_path") ? body.logo_path || null : current.logo_path,
    p_image_path: Object.hasOwn(body, "image_path") ? body.image_path || null : current.image_path,
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data);
}
