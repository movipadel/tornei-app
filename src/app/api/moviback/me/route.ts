import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";
import {
  isQrDeliverable,
  publicManualRewardCode,
  publicQrToken,
} from "@/lib/movibackContracts";
import { createRuntimePerf } from "@/lib/runtimePerf";
import { computeMovibackEligibility } from "@/lib/movibackEligibility";

export const runtime = "nodejs";

export async function GET() {
  const perf = createRuntimePerf("/api/moviback/me");
  try {
  const uid = await getUserIdFromCookie();

  if (!uid) {
    return perf.json({
      user: null,
      membership: null,
      certificate: null,
      points: 0,
      transactions: [],
      redemptions: [],
      eligibility: null,
      active_agreement: null,
      agreement_state: null,
      agreement_history: [],
    });
  }

  const sb = supabaseAdmin();

  const [userResult, membershipResult, certificateResult] = await Promise.all([
    perf.db(() =>
      sb
        .from("users")
        .select("id,full_name,phone,email,gender")
        .eq("id", uid)
        .single()
    ),
    perf.db(() =>
      sb
        .from("loyalty_memberships")
        .select(
          "id,user_id,status,membership_code,tax_code,membership_type,fee_points,fee_paid,approved_at,suspended_at,suspension_reason,rejection_reason,rejected_at,created_at,updated_at"
        )
        .eq("user_id", uid)
        .maybeSingle()
    ),
    perf.db(() =>
      sb
        .from("medical_certificates")
        .select("id,status,uploaded_at,reviewed_at,expiry_date,notes")
        .eq("user_id", uid)
        .order("uploaded_at", { ascending: false })
        .limit(20)
    ),
  ]);

  const { data: user, error: userErr } = userResult;

  if (userErr) {
    return perf.json({ error: userErr.message }, { status: 500 });
  }

  const { data: membership, error: membershipErr } = membershipResult;

  if (membershipErr) {
    return perf.json({ error: membershipErr.message }, { status: 500 });
  }

  const { data: certificates, error: certErr } = certificateResult;
  const certificate = certificates?.[0] ?? null;

  let points = 0;
  let transactions: Array<Record<string, unknown>> = [];
  let redemptions: Array<Record<string, unknown>> = [];
  let activeAgreement: {
    entitlement_id: string;
    name: string;
    multiplier: number;
    status: string;
    effective_from: string;
    effective_until: string | null;
  } | null = null;
  let agreementState: {
    entitlement_id: string;
    name: string;
    multiplier: number;
    status: string;
    effective_from: string | null;
    effective_until: string | null;
    reason: string | null;
  } | null = null;
  let agreementHistory: Array<Record<string, unknown>> = [];

  if (membership?.id) {
    const now = new Date().toISOString();
    const [transactionsResult, redemptionsResult, entitlementResult, agreementHistoryResult] = await Promise.all([
      perf.db(() =>
        sb
          .from("loyalty_transactions")
          .select("id,type,source,euro_amount,points_delta,notes,created_at")
          .eq("membership_id", membership.id)
          .order("created_at", { ascending: false })
      ),
      perf.db(() =>
        sb
          .from("reward_redemptions")
          .select(
            `
            id,
            points_cost,
            status,
            fulfillment_type,
            qr_token,
            manual_code,
            requested_at,
            processing_at,
            ready_at,
            approved_at,
            delivered_at,
            cancelled_at,
            notes,
            reward:rewards_catalog (
              id,
              name,
              description,
              category,
              image_path,
              points_cost,
              reward_type
            )
          `
          )
          .eq("membership_id", membership.id)
          .order("requested_at", { ascending: false })
          .limit(10)
      ),
      perf.db(() =>
        sb
          .from("moviback_agreement_entitlements")
          .select("id,status,effective_from,effective_until,not_activation_reason,created_at,agreement:moviback_agreements(name,multiplier)")
          .eq("membership_id", membership.id)
          .in("status", ["pending", "active", "not_activated"])
          .is("revoked_at", null)
          .order("created_at", { ascending: false })
          .limit(10)
      ),
      perf.db(() =>
        sb.rpc("get_moviback_membership_agreement_history", {
          p_membership_id: membership.id,
        })
      ),
    ]);

    const { data: txRows, error: txErr } = transactionsResult;

    if (txErr) {
      return perf.json({ error: txErr.message }, { status: 500 });
    }

    const allTransactions = txRows ?? [];
    transactions = allTransactions.slice(0, 20);
    points = allTransactions.reduce(
      (sum, row) => sum + Number(row.points_delta ?? 0),
      0
    );

    const { data: redemptionRows, error: redemptionErr } = redemptionsResult;

    if (redemptionErr) {
      return perf.json({ error: redemptionErr.message }, { status: 500 });
    }

    redemptions = (redemptionRows ?? []).map((redemption) => ({
      ...redemption,
      qr_deliverable: isQrDeliverable(redemption.status),
      qr_token: publicQrToken(redemption.status, redemption.qr_token),
      manual_code: publicManualRewardCode(
        redemption.status,
        redemption.manual_code
      ),
      manual_code_deliverable: isQrDeliverable(redemption.status),
    }));

    if (entitlementResult.error) {
      return perf.json({ error: entitlementResult.error.message }, { status: 500 });
    }
    if (agreementHistoryResult.error) {
      return perf.json({ error: agreementHistoryResult.error.message }, { status: 500 });
    }
    agreementHistory = Array.isArray(agreementHistoryResult.data)
      ? agreementHistoryResult.data as Array<Record<string, unknown>>
      : [];
    const entitlementRows = (entitlementResult.data ?? []) as Array<{
      id: string;
      status: string;
      effective_from: string | null;
      effective_until: string | null;
      not_activation_reason: string | null;
      created_at: string;
      agreement: { name: string; multiplier: number } | { name: string; multiplier: number }[] | null;
    }>;
    const entitlement = entitlementRows.find((row) =>
      row.status === "active"
      && Boolean(row.effective_from)
      && row.effective_from! <= now
      && (!row.effective_until || row.effective_until > now)
    ) ?? entitlementRows.find((row) => row.status === "pending")
      ?? entitlementRows.find((row) => row.status === "not_activated")
      ?? null;
    const agreement = Array.isArray(entitlement?.agreement)
      ? entitlement?.agreement[0]
      : entitlement?.agreement;
    if (entitlement && agreement) {
      agreementState = {
        entitlement_id: entitlement.id,
        name: agreement.name,
        multiplier: Number(agreement.multiplier),
        status: entitlement.status,
        effective_from: entitlement.effective_from,
        effective_until: entitlement.effective_until,
        reason: entitlement.not_activation_reason,
      };
      if (entitlement.status === "active" && entitlement.effective_from) {
        activeAgreement = {
          entitlement_id: entitlement.id,
          name: agreement.name,
          multiplier: Number(agreement.multiplier),
          status: entitlement.status,
          effective_from: entitlement.effective_from,
          effective_until: entitlement.effective_until,
        };
      }
    }
  }

  if (certErr) {
    return perf.json({ error: certErr.message }, { status: 500 });
  }

  return perf.json({
    user,
    membership,
    certificate,
    points,
    transactions,
    redemptions,
    active_agreement: activeAgreement,
    agreement_state: agreementState,
    agreement_history: agreementHistory,
    eligibility: computeMovibackEligibility({
      memberships: membership ? [membership] : [],
      certificates: certificates ?? [],
    }),
  });
  } finally {
    perf.finish();
  }
}
