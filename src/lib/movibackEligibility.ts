import "server-only";

export type MovibackEligibilityState =
  | "active"
  | "grace_period"
  | "standby"
  | "pending_review"
  | "blocked";

export type MovibackCertificate = {
  id: string;
  status: string;
  expiry_date: string | null;
  uploaded_at?: string | null;
};

export type MovibackMembership = {
  id: string;
  status: string;
  tax_code: string | null;
  health_data_consent_at?: string | null;
};

export type MovibackEligibility = {
  membership_state: string;
  certificate_state: string;
  eligibility_state: MovibackEligibilityState;
  can_earn_points: boolean;
  can_redeem: boolean;
  can_use_card: boolean;
  needs_certificate_upload: boolean;
  needs_certificate_review: boolean;
  grace_days_remaining: number | null;
  expired_days: number | null;
  reason_code: string;
  human_message: string;
  approved_certificate_id: string | null;
  latest_certificate_id: string | null;
};

export const STANDBY_EARN_MESSAGE =
  "MoviBack in stand-by: certificato medico scaduto da oltre 60 giorni. Aggiorna il certificato per riattivare l’accumulo punti.";

export function normalizeTaxCode(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export function isSupportedTaxCode(value: unknown) {
  const normalized = normalizeTaxCode(value);
  return normalized.length >= 11 && normalized.length <= 16;
}

export function romeCalendarDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateNumber(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) return null;
  return timestamp;
}

export function calendarDaysAfter(expiryDate: string, currentDate: string) {
  const expiry = dateNumber(expiryDate);
  const current = dateNumber(currentDate);
  if (expiry === null || current === null) return null;
  return Math.floor((current - expiry) / 86_400_000);
}

function result(
  membershipState: string,
  certificateState: string,
  eligibilityState: MovibackEligibilityState,
  reasonCode: string,
  humanMessage: string,
  extras: Partial<MovibackEligibility> = {},
): MovibackEligibility {
  const operational = eligibilityState === "active" || eligibilityState === "grace_period";
  const usable = operational || eligibilityState === "standby";
  return {
    membership_state: membershipState,
    certificate_state: certificateState,
    eligibility_state: eligibilityState,
    can_earn_points: operational,
    can_redeem: usable,
    can_use_card: usable,
    needs_certificate_upload: false,
    needs_certificate_review: false,
    grace_days_remaining: null,
    expired_days: null,
    reason_code: reasonCode,
    human_message: humanMessage,
    approved_certificate_id: null,
    latest_certificate_id: null,
    ...extras,
  };
}

export function computeMovibackEligibility(input: {
  memberships: MovibackMembership[];
  certificates: MovibackCertificate[];
  currentDate?: string;
  accountActive?: boolean;
}) {
  const memberships = input.memberships ?? [];
  const certificates = [...(input.certificates ?? [])].sort((a, b) =>
    String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? "")),
  );
  const latest = certificates[0] ?? null;
  const latestApproved = certificates.find((certificate) => certificate.status === "approved") ?? null;
  const latestId = latest?.id ?? null;

  if (memberships.length !== 1) {
    return result(
      memberships.length ? "conflict" : "none",
      latest?.status ?? "none",
      "blocked",
      memberships.length ? "MEMBERSHIP_CARDINALITY" : "NO_MEMBERSHIP",
      memberships.length ? "Più membership MoviBack richiedono una verifica Admin." : "Membership MoviBack non presente.",
      { latest_certificate_id: latestId, needs_certificate_upload: !latest },
    );
  }

  const membership = memberships[0];
  if (input.accountActive === false) {
    return result(membership.status, latest?.status ?? "none", "blocked", "ACCOUNT_INACTIVE", "Account cliente non attivo.", { latest_certificate_id: latestId });
  }
  if (!isSupportedTaxCode(membership.tax_code)) {
    return result(membership.status, latest?.status ?? "none", "blocked", "TAX_CODE_INVALID", "Codice fiscale mancante o non valido.", { latest_certificate_id: latestId });
  }
  if (membership.status === "pending_review") {
    return result(membership.status, latest?.status ?? "none", "pending_review", "MEMBERSHIP_PENDING", "Richiesta MoviBack in revisione.", { latest_certificate_id: latestId, needs_certificate_upload: !latest, needs_certificate_review: latest?.status === "pending_review" });
  }
  if (membership.status !== "approved") {
    return result(membership.status, latest?.status ?? "none", "blocked", "MEMBERSHIP_NOT_APPROVED", "Membership MoviBack non attiva.", { latest_certificate_id: latestId });
  }
  if (!latestApproved) {
    const pending = latest?.status === "pending_review" || latest?.status === "uploaded";
    return result(membership.status, latest?.status ?? "none", pending ? "pending_review" : "blocked", pending ? "CERTIFICATE_PENDING" : "CERTIFICATE_MISSING", pending ? "Certificato in attesa di revisione Admin." : "Certificato medico approvato non presente.", { latest_certificate_id: latestId, needs_certificate_upload: !latest || latest?.status === "rejected", needs_certificate_review: pending });
  }
  if (!latestApproved.expiry_date) {
    return result(membership.status, "approved", "blocked", "CERTIFICATE_EXPIRY_MISSING", "Il certificato approvato non ha una data di scadenza valida.", { latest_certificate_id: latestId, approved_certificate_id: latestApproved.id });
  }

  const expiredDays = calendarDaysAfter(latestApproved.expiry_date, input.currentDate ?? romeCalendarDate());
  if (expiredDays === null) {
    return result(membership.status, "approved", "blocked", "CERTIFICATE_EXPIRY_INVALID", "Data di scadenza del certificato non valida.", { latest_certificate_id: latestId, approved_certificate_id: latestApproved.id });
  }
  if (expiredDays <= 0) {
    return result(membership.status, "valid", "active", "ELIGIBLE", "MoviBack attivo.", { latest_certificate_id: latestId, approved_certificate_id: latestApproved.id, expired_days: Math.max(0, expiredDays), needs_certificate_review: latest?.status === "pending_review" });
  }
  if (expiredDays <= 60) {
    return result(membership.status, "expired_grace", "grace_period", "CERTIFICATE_GRACE", "Certificato scaduto: MoviBack resta attivo nel periodo di tolleranza.", { latest_certificate_id: latestId, approved_certificate_id: latestApproved.id, expired_days: expiredDays, grace_days_remaining: 60 - expiredDays, needs_certificate_review: latest?.status === "pending_review" });
  }
  return result(membership.status, "expired", "standby", "CERTIFICATE_STANDBY", STANDBY_EARN_MESSAGE, { latest_certificate_id: latestId, approved_certificate_id: latestApproved.id, expired_days: expiredDays, needs_certificate_upload: latest?.status !== "pending_review", needs_certificate_review: latest?.status === "pending_review" });
}

