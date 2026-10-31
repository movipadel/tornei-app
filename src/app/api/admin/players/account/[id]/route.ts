import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { loadCustomerAccount } from "@/lib/customerHubServer";
import { getCurrentOperator, guardOperatorPermission } from "@/lib/operatorAuthorization";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardOperatorPermission("players.manage");
  if (denied) return denied;
  const { id } = await params;
  if (!uuid.test(id)) return NextResponse.json({ error: "Cliente non valido" }, { status: 400 });
  const sb = supabaseAdmin();
  let linked;
  let customer;
  let operator;
  try {
    [linked, customer, operator] = await Promise.all([
      sb.from("player_identities").select("id").eq("account_user_id", id).neq("status", "merged").maybeSingle(),
      loadCustomerAccount(id),
      getCurrentOperator(),
    ]);
  } catch {
    return NextResponse.json({ error: "Customer Hub non disponibile" }, { status: 503 });
  }
  if (!customer) return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
  if (linked.error) return NextResponse.json({ error: "Identità giocatore non disponibile" }, { status: 503 });
  if (linked.data?.id) return NextResponse.json({ error: "Identità giocatore già collegata", player_identity_id: linked.data.id }, { status: 409 });
  if (customer.account.identity_status !== "active") return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
  return NextResponse.json({ data: { kind: "account_only", account_user_id: id, player_identity_id: null, ...customer, can_manage_identity: operator?.role === "admin" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  const { id } = await params;
  if (!uuid.test(id)) return NextResponse.json({ error: "Cliente non valido" }, { status: 400 });
  const sb = supabaseAdmin();
  const [account, linked] = await Promise.all([
    sb.from("users").select("id").eq("id", id).eq("identity_status", "active").maybeSingle(),
    sb.from("player_identities").select("id").eq("account_user_id", id).neq("status", "merged").maybeSingle(),
  ]);
  if (account.error || linked.error) return NextResponse.json({ error: "Verifica identità non disponibile" }, { status: 503 });
  if (!account.data) return NextResponse.json({ error: "Cliente attivo non trovato" }, { status: 404 });
  if (linked.data?.id) return NextResponse.json({ data: { state: "linked", player_id: linked.data.id, already_applied: true } });

  // Existing certified resolver: exact safe matches are linked, zero matches are
  // created, ambiguous matches open a review case. This is invoked only by the
  // explicit Admin action below and never by list/detail reads.
  const resolved = await sb.rpc("player_profile_resolve_account", { p_user: id });
  if (resolved.error) return NextResponse.json({ error: "Identità non risolta: controlla i dati nella coda verifiche" }, { status: 409 });
  return NextResponse.json({ data: resolved.data });
}
