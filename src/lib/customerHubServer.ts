import "server-only";

import { customerAuthAccess } from "@/lib/customerHub";
import { computeMovibackEligibility } from "@/lib/movibackEligibility";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function loadCustomerAccount(userId: string) {
  const sb = supabaseAdmin();
  const [accountResult, membershipsResult, certificatesResult] = await Promise.all([
    sb.from("users").select("id,full_name,phone,email,gender,identity_status,auth_migration_state,auth_user_id,created_at").eq("id", userId).maybeSingle(),
    sb.from("loyalty_memberships").select("id,user_id,status,membership_code,tax_code,membership_type,fee_points,fee_paid,approved_at,approved_by,suspended_at,suspension_reason,health_data_consent_at,created_at,updated_at").eq("user_id", userId),
    sb.from("medical_certificates").select("id,status,uploaded_at,reviewed_at,reviewed_by,expiry_date,notes").eq("user_id", userId).order("uploaded_at", { ascending: false }),
  ]);
  if (accountResult.error || membershipsResult.error || certificatesResult.error) throw new Error("Customer Hub non disponibile");
  if (!accountResult.data) return null;

  const { auth_user_id: authUserId, ...safeAccount } = accountResult.data;
  const memberships = membershipsResult.data ?? [];
  const membership = memberships.length === 1 ? memberships[0] : null;
  const certificates = certificatesResult.data ?? [];
  const eligibility = computeMovibackEligibility({
    memberships,
    certificates,
    accountActive: safeAccount.identity_status === "active",
  });
  let transactions: unknown[] = [];
  let redemptions: unknown[] = [];
  let activePromo: unknown = null;
  let agreementEntitlement: unknown = null;
  let pointsBalance = 0;

  if (membership) {
    const now = new Date().toISOString();
    const [txResult, redemptionsResult, promoResult, entitlementResult, balance] = await Promise.all([
      sb.from("loyalty_transactions").select("id,type,source,euro_amount,points_delta,club,notes,created_at").eq("membership_id", membership.id).order("created_at", { ascending: false }).limit(20),
      sb.from("reward_redemptions").select("id,points_cost,status,requested_at,approved_at,delivered_at,cancelled_at,notes,reward:rewards_catalog(id,name,category)").eq("membership_id", membership.id).order("requested_at", { ascending: false }).limit(10),
      sb.from("loyalty_user_promos").select("id,multiplier,starts_at,ends_at,is_active,notes").eq("membership_id", membership.id).eq("is_active", true).lte("starts_at", now).gte("ends_at", now).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("moviback_agreement_entitlements").select("id,status,activation_source,effective_from,effective_until,revoked_at,not_activation_reason,created_at,agreement:moviback_agreements(id,name,status,multiplier,valid_from,valid_until),code:moviback_agreement_codes(code_suffix,status)").eq("membership_id", membership.id).in("status", ["pending", "active", "scheduled", "not_activated"]).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("loyalty_transactions").select("points_delta").eq("membership_id", membership.id),
    ]);
    if (txResult.error || redemptionsResult.error || promoResult.error || entitlementResult.error || balance.error) throw new Error("Attività MoviBack non disponibile");
    transactions = txResult.data ?? [];
    redemptions = redemptionsResult.data ?? [];
    activePromo = promoResult.data ?? null;
    agreementEntitlement = entitlementResult.data ?? null;
    pointsBalance = (balance.data ?? []).reduce((sum, item) => sum + Number(item.points_delta ?? 0), 0);
  }

  return {
    account: {
      ...safeAccount,
      auth_linked: Boolean(authUserId),
      auth_access: customerAuthAccess(safeAccount.auth_migration_state, Boolean(authUserId)),
    },
    membership,
    membership_count: memberships.length,
    eligibility,
    certificate: certificates[0] ?? null,
    certificates,
    points_balance: pointsBalance,
    transactions,
    redemptions,
    active_promo: activePromo,
    agreement_entitlement: agreementEntitlement,
  };
}
