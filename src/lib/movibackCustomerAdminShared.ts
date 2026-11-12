export const VOLUNTARY_MOVIBACK_EXIT = "Uscita volontaria utente";

export function canReviewCustomerCertificate(
  membership: { status: string; suspension_reason?: string | null } | null,
  count: number,
  accountActive: boolean,
  certificate: { status: string } | null,
) {
  if (!membership || count !== 1 || !accountActive || certificate?.status !== "pending_review") return false;
  return membership.status === "pending_review" || membership.status === "approved"
    || (membership.status === "suspended" && membership.suspension_reason === VOLUNTARY_MOVIBACK_EXIT);
}
