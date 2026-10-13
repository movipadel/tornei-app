import { NextResponse } from "next/server";
import { getCurrentOperator, guardOperatorPermission } from "@/lib/operatorAuthorization";
import { computeMovibackEligibility, isSupportedTaxCode, normalizeTaxCode } from "@/lib/movibackEligibility";
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
  const [accountResult, membershipsResult, certificatesResult, cases] = await Promise.all([
    sb.from("users").select("id,full_name,phone,email,gender,identity_status,auth_migration_state,auth_user_id,created_at").eq("id", userId).maybeSingle(),
    sb.from("loyalty_memberships").select("id,user_id,status,membership_code,tax_code,membership_type,fee_points,fee_paid,approved_at,approved_by,suspended_at,suspension_reason,health_data_consent_at,created_at,updated_at").eq("user_id", userId),
    sb.from("medical_certificates").select("id,status,uploaded_at,reviewed_at,reviewed_by,expiry_date,notes").eq("user_id", userId).order("uploaded_at", { ascending: false }),
    casePromise,
  ]);
  if (accountResult.error || membershipsResult.error || certificatesResult.error) return NextResponse.json({ error: "Customer Hub non disponibile" }, { status: 503 });
  const memberships = membershipsResult.data ?? [], membership = memberships.length === 1 ? memberships[0] : null, certificates = certificatesResult.data ?? [];
  const eligibility = computeMovibackEligibility({ memberships, certificates, accountActive: accountResult.data?.identity_status === "active" });
  let transactions: unknown[] = [], redemptions: unknown[] = [], activePromo: unknown = null, agreementEntitlement: unknown = null, pointsBalance = 0;
  if (membership) {
    const now = new Date().toISOString();
    const [txResult, redemptionsResult, promoResult, entitlementResult, balance] = await Promise.all([
      sb.from("loyalty_transactions").select("id,type,source,euro_amount,points_delta,club,notes,created_at").eq("membership_id", membership.id).order("created_at", { ascending: false }).limit(20),
      sb.from("reward_redemptions").select("id,points_cost,status,requested_at,approved_at,delivered_at,cancelled_at,notes,reward:rewards_catalog(id,name,category)").eq("membership_id", membership.id).order("requested_at", { ascending: false }).limit(10),
      sb.from("loyalty_user_promos").select("id,multiplier,starts_at,ends_at,is_active,notes").eq("membership_id", membership.id).eq("is_active", true).lte("starts_at", now).gte("ends_at", now).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("moviback_agreement_entitlements").select("id,status,activation_source,effective_from,effective_until,revoked_at,not_activation_reason,created_at,agreement:moviback_agreements(id,name,status,multiplier,valid_from,valid_until),code:moviback_agreement_codes(code_suffix,status)").eq("membership_id", membership.id).in("status", ["pending", "active", "scheduled", "not_activated"]).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("loyalty_transactions").select("points_delta").eq("membership_id", membership.id),
    ]);
    if (txResult.error || redemptionsResult.error || promoResult.error || entitlementResult.error || balance.error) return NextResponse.json({ error: "Attività MoviBack non disponibile" }, { status: 503 });
    transactions = txResult.data ?? []; redemptions = redemptionsResult.data ?? []; activePromo = promoResult.data ?? null;
    agreementEntitlement = entitlementResult.data ?? null;
    pointsBalance = (balance.data ?? []).reduce((sum, item) => sum + Number(item.points_delta ?? 0), 0);
  }
  const account = accountResult.data;
  const accountDrift = account ? { name: account.full_name.trim().toLocaleLowerCase("it") !== player.full_name.trim().toLocaleLowerCase("it"), phone: account.phone.replace(/\D/g, "") !== player.normalized_phone.replace(/\D/g, ""), gender: Boolean(account.gender && player.gender && account.gender !== player.gender) } : null;
  return NextResponse.json({ data: { player, account, account_drift: accountDrift, open_cases: cases.data ?? [], membership, membership_count: memberships.length, eligibility, certificate: certificates[0] ?? null, certificates, points_balance: pointsBalance, transactions, redemptions, active_promo: activePromo, agreement_entitlement: agreementEntitlement } });
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
