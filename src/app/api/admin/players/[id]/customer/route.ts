import { NextResponse } from "next/server";
import { getCurrentOperator, guardOperatorPermission } from "@/lib/operatorAuthorization";
import { loadCustomerAccount } from "@/lib/customerHubServer";
import { isSupportedTaxCode, normalizeTaxCode } from "@/lib/movibackEligibility";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardOperatorPermission("players.manage"); if (denied) return denied;
  const operator = await getCurrentOperator();
  const { id } = await params;
  if (!uuid.test(id)) return NextResponse.json({ error: "Giocatore non valido" }, { status: 400 });
  const sb = supabaseAdmin();
  const playerResult = await sb.from("player_identities").select("id,full_name,normalized_phone,gender,account_user_id,status").eq("id", id).maybeSingle();
  if (playerResult.error || !playerResult.data) return NextResponse.json({ error: "Giocatore non trovato" }, { status: 404 });
  const player = playerResult.data;
  const casePromise = operator?.role === "admin"
    ? sb.from("player_identity_cases").select("id,case_type,status,updated_at").in("status", ["open", "in_review"]).contains("player_ids", [id]).order("updated_at", { ascending: false }).limit(5)
    : Promise.resolve({ data: [], error: null });
  if (!player.account_user_id) {
    const cases = await casePromise;
    return NextResponse.json({ data: { player, account: null, account_drift: null, open_cases: cases.data ?? [], membership: null, membership_count: 0, eligibility: null, certificate: null, certificates: [], points_balance: 0, transactions: [], redemptions: [], active_promo: null } });
  }
  const userId = player.account_user_id;
  let customer;
  let cases;
  try {
    [customer, cases] = await Promise.all([loadCustomerAccount(userId), casePromise]);
  } catch {
    return NextResponse.json({ error: "Customer Hub non disponibile" }, { status: 503 });
  }
  if (!customer) return NextResponse.json({ error: "Customer Hub non disponibile" }, { status: 503 });
  const account = customer.account;
  const accountDrift = account ? { name: account.full_name.trim().toLocaleLowerCase("it") !== player.full_name.trim().toLocaleLowerCase("it"), phone: account.phone.replace(/\D/g, "") !== player.normalized_phone.replace(/\D/g, ""), gender: Boolean(account.gender && player.gender && account.gender !== player.gender) } : null;
  return NextResponse.json({ data: { player, ...customer, account_drift: accountDrift, open_cases: cases.data ?? [] } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardOperatorPermission("players.manage"); if (denied) return denied;
  const origin = req.headers.get("origin"); if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  const { id } = await params, body = await req.json().catch(() => ({})), taxCode = normalizeTaxCode(body.tax_code);
  if (!isSupportedTaxCode(taxCode)) return NextResponse.json({ error: "Codice fiscale non valido: usa da 11 a 16 caratteri senza spazi" }, { status: 400 });
  const sb = supabaseAdmin();
  const player = await sb.from("player_identities").select("account_user_id").eq("id", id).maybeSingle();
  if (player.error || !player.data?.account_user_id) return NextResponse.json({ error: "Account non collegato" }, { status: 404 });
  const memberships = await sb.from("loyalty_memberships").select("id").eq("user_id", player.data.account_user_id);
  if (memberships.error || memberships.data?.length !== 1) return NextResponse.json({ error: "Cardinalità membership da verificare" }, { status: 409 });
  const updated = await sb.from("loyalty_memberships").update({ tax_code: taxCode, updated_at: new Date().toISOString() }).eq("id", memberships.data[0].id).select("id,tax_code").single();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: updated.data });
}
