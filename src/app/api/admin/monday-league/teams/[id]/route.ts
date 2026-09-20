import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMondayLeagueAdminActorId, mondayLeagueErrorResponse, slugifyLeagueName } from "@/lib/monday-league/admin-server";

export const runtime = "nodejs";

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const actorId = await getMondayLeagueAdminActorId();
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const { data, error } = await supabaseAdmin().rpc("league_admin_replace_roster", {
    p_actor_id: actorId,
    p_team_id: id,
    p_name: name,
    p_slug: slugifyLeagueName(String(body.slug ?? name)),
    p_captain_user_id: body.captain_user_id ?? null,
    p_roster: Array.isArray(body.roster) ? body.roster : [],
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data);
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const actorId = await getMondayLeagueAdminActorId();
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const { data, error } = await supabaseAdmin().rpc("league_admin_set_team_active", {
    p_actor_id: actorId,
    p_team_id: id,
    p_is_active: Boolean(body.is_active),
    p_reason: String(body.reason ?? "").trim() || null,
  });
  if (error) return mondayLeagueErrorResponse(error);
  return NextResponse.json(data);
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(); if (denied) return denied;
  const actorId = await getMondayLeagueAdminActorId();
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params; const body = await req.json().catch(() => ({}));
  const { data, error } = await supabaseAdmin().rpc("league_admin_delete_team", {
    p_actor_id: actorId, p_team_id: id, p_confirmation: String(body.confirmation ?? ""),
  });
  if (error) return mondayLeagueErrorResponse(error); return NextResponse.json(data);
}
