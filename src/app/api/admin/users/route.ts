import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";
import { getCurrentOperator } from "@/lib/operatorAuthorization";
import { operatorMutationError, parseOperatorMutation } from "@/lib/operatorAdmin";

export const runtime = "nodejs";

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const sb = supabaseAdmin();

  const operator = await getCurrentOperator();
  const [{ data, error }, permissionsResult, activeAdminsResult] = await Promise.all([
    sb
    .from("staff_users")
    .select("id,full_name,email,role,is_active,last_login_at,created_at,updated_at")
    .order("created_at", { ascending: false }),
    sb.from("staff_permissions").select("staff_user_id,permission_key"),
    sb.from("staff_users").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true),
  ]);

  if (error || permissionsResult.error || activeAdminsResult.error) return NextResponse.json({ error: (error ?? permissionsResult.error ?? activeAdminsResult.error)?.message }, { status: 500 });
  const byUser = new Map<string, string[]>();
  for (const permission of permissionsResult.data ?? []) {
    const current = byUser.get(permission.staff_user_id) ?? [];
    current.push(permission.permission_key);
    byUser.set(permission.staff_user_id, current);
  }

  return NextResponse.json({
    data: (data ?? []).map((user) => ({ ...user, permissions: user.role === "staff" ? byUser.get(user.id) ?? [] : [] })),
    current_operator_id: operator?.sid ?? null,
    active_admin_count: activeAdminsResult.count ?? 0,
  });
}

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  let input;
  try { input = parseOperatorMutation(body, { requirePassword: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Dati non validi" }, { status: 400 }); }
  const actor = await getCurrentOperator();
  if (!actor || actor.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sb = supabaseAdmin();

  const { data, error } = await sb.rpc("admin_create_operator", {
    p_actor_staff_user_id: actor.sid,
    p_full_name: input.fullName,
    p_email: input.email,
    p_password: input.password,
    p_role: input.role,
    p_is_active: input.isActive,
    p_permissions: input.role === "staff" ? input.permissions : [],
    p_request_id: req.headers.get("x-request-id") ?? crypto.randomUUID(),
  });
  if (error) { const mapped = operatorMutationError(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status }); }
  return NextResponse.json({ ok: true, data }, { status: 201 });
}
