import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse, slugifyLeagueName } from "@/lib/monday-league/admin-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const actorId = await getMondayLeagueAdminActorId();
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const slug = slugifyLeagueName(String(body.slug ?? name));
  const { data, error } = await supabaseAdmin().rpc("league_create_season", {
    p_actor_id: actorId,
    p_name: name,
    p_slug: slug,
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data, { status: 201 });
}
