import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function accountForPlayer(id: string) {
  const sb = supabaseAdmin();
  const player = await sb.from("player_identities")
    .select("account_user_id,status").eq("id", id).maybeSingle();
  if (player.error) throw player.error;
  if (!player.data?.account_user_id || player.data.status !== "active") return null;
  const account = await sb.from("users")
    .select("id,email,identity_status,auth_migration_state,auth_user_id")
    .eq("id", player.data.account_user_id).maybeSingle();
  if (account.error) throw account.error;
  return account.data;
}

type RepairState = { state: string; reason?: string; operation_id?: string; new_email?: string; auth_user_id?: string };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(); if (denied) return denied;
  const { id } = await params;
  if (!uuid.test(id)) return NextResponse.json({ error: "Cliente non valido" }, { status: 400 });
  try {
    const sb = supabaseAdmin();
    const account = await accountForPlayer(id);
    if (!account) return NextResponse.json({ error: "Account non collegato" }, { status: 404 });
    const [operation, help, probe] = await Promise.all([
      sb.from("account_activation_email_repair_operations")
        .select("id,state,new_email").eq("public_user_id", account.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("user_access_help_requests")
        .select("id", { count: "exact", head: true }).eq("public_user_id", account.id).eq("status", "open"),
      sb.rpc("admin_prepare_incomplete_activation_email_repair", {
        p_public_user_id: account.id, p_actor_staff_id: null, p_new_email: null,
        p_reason: null, p_operation_id: null, p_dry_run: true,
      }),
    ]);
    if (operation.error || help.error || probe.error) throw new Error("Account access lookup failed");
    const candidate = (probe.data ?? { state: "blocked" }) as RepairState;
    const repair = account.auth_user_id
      ? { state: "active" }
      : candidate.state === "prepared"
        ? { state: "prepared", operation_id: candidate.operation_id, new_email: candidate.new_email }
        : operation.data?.state === "completed" && account.auth_migration_state === "legacy"
          ? { state: "completed", new_email: operation.data.new_email }
          : { state: candidate.state, reason: candidate.reason };
    return NextResponse.json({ data: {
      current_email: account.email, auth_migration_state: account.auth_migration_state,
      auth_linked: Boolean(account.auth_user_id), repair, open_access_requests: help.count ?? 0,
    } });
  } catch {
    return NextResponse.json({ error: "Stato accesso non disponibile" }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(); if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  }
  const session = await getStaffSessionFromCookie();
  if (!session?.sid) return NextResponse.json({ error: "Sessione Admin richiesta" }, { status: 403 });
  const { id } = await params;
  if (!uuid.test(id)) return NextResponse.json({ error: "Cliente non valido" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const operationId = String(body.operation_id ?? "");
  const resume = body.resume === true;
  const email = String(body.new_email ?? "").trim().toLowerCase();
  const reason = String(body.reason ?? "").trim();
  if (body.confirmed !== true || !uuid.test(operationId)
      || (!resume && (!emailPattern.test(email) || email.length > 254 || reason.length < 8 || reason.length > 1000))) {
    return NextResponse.json({ error: "Conferma, email e motivo validi sono richiesti" }, { status: 400 });
  }
  try {
    const sb = supabaseAdmin();
    const account = await accountForPlayer(id);
    if (!account) return NextResponse.json({ error: "Account non collegato" }, { status: 404 });
    const prepared = await sb.rpc("admin_prepare_incomplete_activation_email_repair", {
      p_public_user_id: account.id, p_actor_staff_id: session.sid,
      p_new_email: resume ? null : email, p_reason: resume ? null : reason,
      p_operation_id: operationId, p_dry_run: false,
    });
    if (prepared.error) throw prepared.error;
    const state = (prepared.data ?? {}) as RepairState;
    if (state.state === "completed") return NextResponse.json({ state: "completed" });
    if (state.state !== "prepared" || state.operation_id !== operationId || !state.auth_user_id) {
      return NextResponse.json({ error: "Correzione non disponibile: verifica account e indirizzo" }, { status: 409 });
    }
    const auth = await sb.auth.admin.getUserById(state.auth_user_id);
    if (!auth.error) {
      const ready = await sb.rpc("admin_incomplete_activation_repair_deletion_ready", { p_operation_id: operationId });
      if (ready.error) return NextResponse.json({ error: "Verifica Auth non disponibile. Riprova." }, { status: 503 });
      if (ready.data !== true || auth.data.user?.email_confirmed_at || auth.data.user?.last_sign_in_at) {
        const cancelled = await sb.rpc("admin_cancel_incomplete_activation_email_repair", {
          p_operation_id: operationId, p_actor_staff_id: session.sid,
        });
        if (cancelled.error || (cancelled.data as RepairState | null)?.state !== "cancelled") {
          return NextResponse.json({ error: "Stato Auth cambiato: richiede verifica Admin" }, { status: 409 });
        }
        return NextResponse.json({ error: "Stato Auth cambiato: correzione annullata. Ricarica l’account." }, { status: 409 });
      }
      const deleted = await sb.auth.admin.deleteUser(state.auth_user_id);
      if (deleted.error) return NextResponse.json({ error: "Annullamento Auth non riuscito. Riprova la correzione." }, { status: 503 });
    } else if (auth.error.status !== 404) {
      return NextResponse.json({ error: "Stato Auth non disponibile. Riprova la correzione." }, { status: 503 });
    }
    const finished = await sb.rpc("admin_finish_incomplete_activation_email_repair", {
      p_operation_id: operationId, p_actor_staff_id: session.sid,
    });
    if (finished.error || (finished.data as RepairState | null)?.state !== "completed") {
      return NextResponse.json({ error: "Auth annullato; finalizzazione sospesa. Riprova la correzione." }, { status: 409 });
    }
    return NextResponse.json({ state: "completed" });
  } catch {
    return NextResponse.json({ error: "Correzione non completata. Ricarica lo stato e riprova." }, { status: 503 });
  }
}
