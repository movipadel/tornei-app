import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getCurrentOperator } from "@/lib/operatorAuthorization";
import { operatorMutationError, parseOperatorMutation } from "@/lib/operatorAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(); if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Operatore non valido" }, { status: 400 });
  const sb = supabaseAdmin();
  const actor = await getCurrentOperator();
  const [userResult, permissionResult, activeAdminsResult] = await Promise.all([
    sb.from("staff_users").select("id,full_name,email,role,is_active,last_login_at,created_at,updated_at").eq("id", id).maybeSingle(),
    sb.from("staff_permissions").select("permission_key").eq("staff_user_id", id),
    sb.from("staff_users").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true),
  ]);
  if (userResult.error || permissionResult.error || activeAdminsResult.error) return NextResponse.json({ error: "Impossibile caricare l'operatore" }, { status: 500 });
  if (!userResult.data) return NextResponse.json({ error: "Operatore non trovato" }, { status: 404 });
  const user = userResult.data;
  return NextResponse.json({ data: { ...user, permissions: user.role === "staff" ? (permissionResult.data ?? []).map((item) => item.permission_key) : [], is_self: actor?.sid === id, can_remove_admin_access: user.role !== "admin" || !user.is_active || (activeAdminsResult.count ?? 0) > 1 } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req); if (denied) return denied;
  const actor = await getCurrentOperator();
  if (!actor || actor.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Operatore non valido" }, { status: 400 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  let input;
  try { input = parseOperatorMutation(body, { requirePassword: false }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Dati non validi" }, { status: 400 }); }
  const expectedUpdatedAt = String(body.expected_updated_at ?? "");
  if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) return NextResponse.json({ error: "Versione operatore non valida" }, { status: 400 });
  const { data, error } = await supabaseAdmin().rpc("admin_update_operator", {
    p_actor_staff_user_id: actor.sid, p_target_staff_user_id: id,
    p_expected_updated_at: expectedUpdatedAt, p_full_name: input.fullName,
    p_email: input.email, p_role: input.role, p_is_active: input.isActive,
    p_permissions: input.role === "staff" ? input.permissions : [],
    p_request_id: req.headers.get("x-request-id") ?? crypto.randomUUID(),
  });
  if (error) { const mapped = operatorMutationError(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status }); }
  return NextResponse.json({ ok: true, data });
}
