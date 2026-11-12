import { computeMovibackEligibility, isSupportedTaxCode, type MovibackCertificate, type MovibackMembership } from "@/lib/movibackEligibility";
import { VOLUNTARY_MOVIBACK_EXIT } from "@/lib/movibackCustomerAdminShared";
export { VOLUNTARY_MOVIBACK_EXIT, canReviewCustomerCertificate } from "@/lib/movibackCustomerAdminShared";

type Membership = MovibackMembership & { suspension_reason?: string | null; fee_paid?: boolean };

export function customerReactivationDecision(input: {
  membership: Membership | null;
  membershipCount: number;
  accountActive: boolean;
  certificates: MovibackCertificate[];
  currentDate?: string;
}) {
  const { membership, membershipCount, accountActive, certificates, currentDate } = input;
  if (!membership || membershipCount !== 1 || !accountActive) return { allowed: false, reason: "Profilo cliente o membership da verificare." };
  if (membership.status !== "suspended" || membership.suspension_reason !== VOLUNTARY_MOVIBACK_EXIT) {
    return { allowed: false, reason: "La sospensione non consente il rientro diretto." };
  }
  if (!membership.fee_paid || !isSupportedTaxCode(membership.tax_code)) {
    return { allowed: false, reason: "Quota tessera o dati di tesseramento da verificare." };
  }
  const prospective = computeMovibackEligibility({
    memberships: [{ ...membership, status: "approved" }], certificates, accountActive, currentDate,
  });
  if (prospective.eligibility_state !== "active" && prospective.eligibility_state !== "grace_period") {
    return { allowed: false, reason: prospective.human_message };
  }
  return { allowed: true, reason: "Certificato idoneo; verificare la volontà di rientro del cliente." };
}
