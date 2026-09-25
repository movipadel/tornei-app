import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const denied = await guardAdmin(); if (denied) return denied;
  const sb = supabaseAdmin();
  const [help, onboarding, candidates, authPage] = await Promise.all([
    sb.from("user_access_help_requests").select("id,kind,status,public_user_id,submitted_name_normalized,submitted_phone_normalized,created_at,closed_at,resolution_note").order("created_at", { ascending: false }).limit(500),
    sb.from("user_auth_onboarding").select("auth_user_id,flow,state,full_name,normalized_email,normalized_phone,linked_public_user_id,created_at,updated_at")
      .in("state", ["conflict", "review_required", "verified", "pending_verification"]).order("updated_at", { ascending: false }).limit(500),
    sb.from("users").select("id,full_name,phone,email,auth_migration_state").in("auth_migration_state", ["activation_pending", "review_required", "conflict"]).limit(1000),
    sb.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const error = help.error || onboarding.error || candidates.error || authPage.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const candidateMap = new Map((candidates.data ?? []).map((row) => [row.id, row]));
  const authMap = new Map((authPage.data.users ?? []).map((row) => [row.id, row]));
  const helpIds = [...new Set((help.data ?? []).flatMap((row) => row.public_user_id ? [row.public_user_id] : []))];
  const { data: helpProfiles, error: profilesError } = helpIds.length
    ? await sb.from("users").select("id,full_name,phone,email").in("id", helpIds)
    : { data: [], error: null };
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });
  const helpProfileMap = new Map((helpProfiles ?? []).map((row) => [row.id, row]));

  const helpItems = (help.data ?? []).map((row) => ({
    source: "help_request", id: row.id, status: row.status, reason: reason(row.kind),
    name: row.public_user_id ? helpProfileMap.get(row.public_user_id)?.full_name : row.submitted_name_normalized,
    phone: row.public_user_id ? helpProfileMap.get(row.public_user_id)?.phone : row.submitted_phone_normalized,
    profile_email: row.public_user_id ? helpProfileMap.get(row.public_user_id)?.email : null,
    auth_email: null, created_at: row.created_at, updated_at: row.closed_at ?? row.created_at,
    can_resolve: row.status === "open", can_cancel: row.status === "open", can_retry: false,
  }));
  const onboardingItems = (onboarding.data ?? []).filter((row) => {
    const auth = authMap.get(row.auth_user_id);
    return row.state === "conflict" || row.state === "review_required"
      || (Boolean(auth?.email_confirmed_at) && row.state !== "linked" && !row.linked_public_user_id);
  }).map((row) => {
    const profile = row.linked_public_user_id ? candidateMap.get(row.linked_public_user_id) : undefined;
    return { source: "onboarding", id: row.auth_user_id, status: "open",
      reason: row.state === "conflict" ? "Dati verificati in conflitto con il profilo"
        : row.state === "review_required" ? "Più profili richiedono una verifica"
          : "Email verificata, collegamento da completare",
      name: row.full_name ?? profile?.full_name ?? null, phone: row.normalized_phone ?? profile?.phone ?? null,
      auth_email: authMap.get(row.auth_user_id)?.email ?? row.normalized_email,
      profile_email: profile?.email ?? null, created_at: row.created_at, updated_at: row.updated_at,
      can_resolve: false, can_cancel: !row.linked_public_user_id, can_retry: Boolean(authMap.get(row.auth_user_id)?.email_confirmed_at),
      technical: { flow: row.flow, state: row.state },
    };
  });
  return NextResponse.json({ data: [...helpItems, ...onboardingItems].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))) });
}

export async function POST(request: Request) {
  const denied = await guardAdmin(); if (denied) return denied;
  const session = await getStaffSessionFromCookie();
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? ""); const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  const sb = supabaseAdmin();
  if (action === "resolve_help" || action === "cancel_help") {
    const { data, error } = await sb.rpc("close_user_access_help_request", {
      p_request_id: id, p_action: action === "resolve_help" ? "resolved" : "cancelled",
      p_actor_staff_id: session!.sid, p_note: String(body.note ?? "") || null,
    });
    return error ? NextResponse.json({ error: error.message }, { status: 409 }) : NextResponse.json({ data });
  }
  const { data: draft, error: draftError } = await sb.from("user_auth_onboarding")
    .select("state,linked_public_user_id").eq("auth_user_id", id).maybeSingle();
  if (draftError || !draft) return NextResponse.json({ error: "Onboarding non trovato" }, { status: 404 });
  const { count: linkedCount, error: linkedError } = await sb.from("users").select("id", { count: "exact", head: true }).eq("auth_user_id", id);
  if (linkedError || linkedCount) return NextResponse.json({ error: "Identità già collegata: operazione bloccata" }, { status: 409 });
  if (action === "retry_onboarding") {
    const { data, error } = await sb.rpc("resolve_and_link_verified_auth_user", { p_auth_user_id: id });
    return error ? NextResponse.json({ error: error.message }, { status: 409 }) : NextResponse.json({ data });
  }
  if (action === "cancel_onboarding" && !draft.linked_public_user_id) {
    const { error } = await sb.auth.admin.deleteUser(id);
    return error ? NextResponse.json({ error: error.message }, { status: 409 }) : NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
}

function reason(kind: string) {
  if (kind === "email_inaccessible") return "Email del profilo non più accessibile";
  if (kind === "name_mismatch") return "Nome diverso da quello del profilo";
  return "Più profili associati agli stessi dati";
}
