import { canReviewCustomerCertificate, VOLUNTARY_MOVIBACK_EXIT } from "@/lib/movibackCustomerAdminShared";
import type { AccountIdentityConsistency } from "@/lib/customerAccountIdentityConsistency";

export type CustomerAdminIssue = {
  key: string;
  title: string;
  cause: string;
  consequence: string;
  action: string | null;
};

export function customerAdminStatusLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    active: "Attivo", approved: "Approvato", suspended: "Sospeso",
    pending_review: "In revisione", blocked: "Non operativo",
    grace_period: "Periodo di tolleranza", standby: "In stand-by",
    valid: "Valido", expired: "Scaduto", expired_grace: "Scaduto, in tolleranza",
    rejected: "Rifiutato", superseded: "Sostituito", uploaded: "Caricato",
    merged: "Unito", none: "Non presente",
  };
  return labels[value ?? ""] ?? value ?? "—";
}

export function customerAdminIssues(input: {
  account: { identity_status: string; auth_access: { key: string } } | null;
  playerStatus: string;
  identityCaseCount: number;
  membership: { status: string; suspension_reason?: string | null } | null;
  membershipCount: number;
  certificate: { status: string; expiry_date: string | null } | null;
  eligibility: { eligibility_state: string; reason_code: string; human_message: string } | null;
  canReactivate: boolean;
  accountIdentityConsistency?: AccountIdentityConsistency | null;
}): CustomerAdminIssue[] {
  const issues: CustomerAdminIssue[] = [];
  const add = (key: string, title: string, cause: string, consequence: string, action: string | null = null) =>
    issues.push({ key, title, cause, consequence, action });
  if (input.account && input.account.auth_access.key !== "active") {
    add("access", "Accesso MOVI da completare", "Il nuovo accesso non è ancora attivo.", "Il cliente potrebbe non accedere alle aree personali.", "access");
  }
  if (input.playerStatus === "merged" || input.identityCaseCount > 0) {
    add("identity", "Identità sportiva da verificare", "È presente una verifica o una fusione dell’identità giocatore.", "I collegamenti sportivi richiedono controllo Admin.", "identity");
  }
  if (input.accountIdentityConsistency?.severity === "CONFLICT") {
    add("account_identity_conflict", "Dati account e sportivi in conflitto",
      input.accountIdentityConsistency.findings.filter((item) => item.kind === "conflict").map((item) => item.message).join(" "),
      "Controlla i singoli campi prima di correggerli.");
  }
  const membership = input.membership;
  if (membership?.status === "suspended") {
    add("suspension", "MoviBack sospeso", membership.suspension_reason ?? "Motivo da verificare",
      "Card, accumulo e riscatto non disponibili.", input.canReactivate ? "reactivate" : null);
  }
  if (input.certificate?.status === "pending_review") {
    add("certificate", "Certificato in attesa di revisione",
      input.certificate.expiry_date ? `Scadenza: ${input.certificate.expiry_date}` : "Scadenza da verificare",
      membership?.status === "suspended" ? "MoviBack resta sospeso anche dopo l’approvazione del certificato." : "La verifica sanitaria non è conclusa.",
      canReviewCustomerCertificate(membership, input.membershipCount,
        input.account?.identity_status === "active", input.certificate) ? "review" : null);
  } else if (input.eligibility?.reason_code === "CERTIFICATE_GRACE" || input.eligibility?.reason_code === "CERTIFICATE_STANDBY") {
    add("certificate_expiry", input.eligibility.reason_code === "CERTIFICATE_GRACE" ? "Certificato nel periodo di tolleranza" : "Certificato scaduto",
      input.eligibility.human_message, input.eligibility.reason_code === "CERTIFICATE_STANDBY" ? "Accumulo punti sospeso." : "Occorre un nuovo certificato per evitare lo stand-by.", "certificate_history");
  }
  if (membership?.status === "suspended" && membership.suspension_reason !== VOLUNTARY_MOVIBACK_EXIT) {
    issues.push({ key: "review_required", title: "Sospensione da verificare", cause: membership.suspension_reason ?? "Motivo non registrato", consequence: "Nessuna riattivazione diretta disponibile.", action: null });
  }
  return issues;
}
