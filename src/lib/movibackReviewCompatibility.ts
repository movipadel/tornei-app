import type { supabaseAdmin } from "@/lib/supabaseAdmin";

type AdminDb = ReturnType<typeof supabaseAdmin>;
type RpcError = { code?: string; message?: string };
type ReviewData = { ok?: boolean; error_code?: string; [key: string]: unknown };

export type ReviewOutcome =
  | { kind: "SUCCESS"; data: ReviewData; usedLegacy: boolean }
  | { kind: "RPC_NOT_INSTALLED" | "BUSINESS_RULE_REJECTED" | "AUTHORIZATION_FAILED" | "UNEXPECTED_DATABASE_ERROR"; code?: string; usedLegacy: boolean };

// PGRST202 is also possible during a stale schema cache. Only the named, absent C6
// signature permits the C5 retry; a C6 business/permission failure never does.
export function isMissingMembershipC6(error: RpcError | null): boolean {
  return error?.code === "PGRST202" &&
    /(?:public\.)?review_moviback_membership_c6\s*\(/i.test(error.message ?? "");
}

export function classifyReviewError(error: RpcError): Exclude<ReviewOutcome["kind"], "SUCCESS"> {
  if (error.code === "42501" || error.code === "PGRST301" || error.code === "PGRST302") return "AUTHORIZATION_FAILED";
  return "UNEXPECTED_DATABASE_ERROR";
}

function resultOf(data: unknown, usedLegacy: boolean): ReviewOutcome {
  const result = (data ?? {}) as ReviewData;
  if (result.ok === true) return { kind: "SUCCESS", data: result, usedLegacy };
  if (result.ok !== false || !result.error_code) return { kind: "UNEXPECTED_DATABASE_ERROR", usedLegacy };
  return { kind: result.error_code === "OPERATOR_INVALID" ? "AUTHORIZATION_FAILED" : "BUSINESS_RULE_REJECTED",
    code: result.error_code, usedLegacy };
}

export async function reviewMovibackMembershipCompatible(
  sb: AdminDb,
  input: {
    membershipId: string;
    certificateId: string;
    userId: string;
    action: "approve" | "reject";
    rejectionReason: string | null;
    certificateNote: string;
    actorStaffId: string;
  },
): Promise<ReviewOutcome> {
  const canonical = await sb.rpc("review_moviback_membership_c6", {
    p_membership_id: input.membershipId, p_certificate_id: input.certificateId,
    p_action: input.action, p_rejection_reason: input.rejectionReason,
    p_certificate_note: input.certificateNote, p_actor_staff_id: input.actorStaffId,
  });
  if (!canonical.error) return resultOf(canonical.data, false);
  if (!isMissingMembershipC6(canonical.error)) {
    return { kind: classifyReviewError(canonical.error), code: canonical.error.code, usedLegacy: false };
  }

  // C5 has no certificate_id argument and selects the user's newest upload.
  // Refuse a stale or tied target instead of reviewing a different certificate.
  const certificates = await sb.from("medical_certificates")
    .select("id,uploaded_at,status")
    .eq("user_id", input.userId)
    .order("uploaded_at", { ascending: false })
    .limit(2);
  if (certificates.error) return { kind: classifyReviewError(certificates.error), code: certificates.error.code, usedLegacy: true };
  const [newest, second] = certificates.data ?? [];
  if (!newest || newest.id !== input.certificateId ||
      (second && second.uploaded_at === newest.uploaded_at) ||
      !["pending_review", "approved"].includes(newest.status)) {
    return { kind: "BUSINESS_RULE_REJECTED", code: "CERTIFICATE_NOT_REVIEWABLE", usedLegacy: true };
  }

  const legacy = await sb.rpc("review_moviback_membership_c5", {
    p_membership_id: input.membershipId, p_action: input.action,
    p_rejection_reason: input.rejectionReason, p_certificate_note: input.certificateNote,
    p_actor_staff_id: input.actorStaffId,
  });
  // A stale post-migration schema cache can report C6 missing while C5 has
  // already been revoked. This is temporary RPC unavailability, not a bad Admin.
  if (legacy.error?.code === "PGRST202" || legacy.error?.code === "42501") {
    return { kind: "RPC_NOT_INSTALLED", code: legacy.error.code, usedLegacy: true };
  }
  if (legacy.error) return { kind: classifyReviewError(legacy.error), code: legacy.error.code, usedLegacy: true };
  return resultOf(legacy.data, true);
}
