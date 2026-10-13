export const MOVIBACK_AGREEMENT_STATUSES = ["draft", "active", "suspended", "expired", "revoked"] as const;

export type AgreementInput = {
  name: string;
  slug: string;
  status: (typeof MOVIBACK_AGREEMENT_STATUSES)[number];
  multiplier: number;
  validFrom: string;
  validUntil: string | null;
};

export function parseAgreementInput(body: Record<string, unknown>): AgreementInput {
  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const status = String(body.status ?? "draft") as AgreementInput["status"];
  const multiplier = Number(body.multiplier);
  const validFrom = String(body.valid_from ?? "").trim();
  const validUntil = String(body.valid_until ?? "").trim() || null;
  const fromTime = Date.parse(validFrom);
  const untilTime = validUntil ? Date.parse(validUntil) : null;
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Nome e slug validi sono obbligatori");
  if (!MOVIBACK_AGREEMENT_STATUSES.includes(status)) throw new Error("Stato convenzione non valido");
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error("Moltiplicatore non valido");
  if (!Number.isFinite(fromTime) || (untilTime !== null && (!Number.isFinite(untilTime) || untilTime <= fromTime))) throw new Error("Intervallo di validità non valido");
  return { name, slug, status, multiplier, validFrom: new Date(fromTime).toISOString(), validUntil: untilTime === null ? null : new Date(untilTime).toISOString() };
}

export function safeDatabaseError(error: { message?: string; code?: string } | null) {
  const message = error?.message ?? "Operazione non riuscita";
  if (error?.code === "23505") return "Slug, codice o operazione già esistente";
  if (error?.code === "23514") return "Dati non compatibili con i vincoli della convenzione";
  const known = message.match(/MOVIBACK_[A-Z0-9_]+/)?.[0];
  return known ?? "Operazione convenzione non riuscita";
}
