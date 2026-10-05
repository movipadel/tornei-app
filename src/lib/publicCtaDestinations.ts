export type CtaDestinationGroup =
  | "movi_pages"
  | "personal"
  | "specific_content"
  | "information"
  | "links";

export type CtaAuthRequirement = "public" | "user";
export type CtaAvailability = "enabled" | "future";

export type StaticCtaDestinationKey =
  | "home"
  | "tournaments"
  | "circuits"
  | "monday_league"
  | "moviback"
  | "partners"
  | "moviback_rules"
  | "store"
  | "booking"
  | "play"
  | "training"
  | "contact"
  | "moviback_rewards"
  | "requests"
  | "activities"
  | "profile"
  | "privacy"
  | "terms"
  | "cookies";

export type DynamicCtaDestinationKey = "tournament" | "circuit" | "padelleria_content" | "partner";
export type CtaCatalogKey = StaticCtaDestinationKey | DynamicCtaDestinationKey;

export type StaticCtaDestination = {
  key: StaticCtaDestinationKey;
  kind: "static";
  group: Exclude<CtaDestinationGroup, "specific_content" | "links">;
  label: string;
  href: string;
  availability: CtaAvailability;
  auth: CtaAuthRequirement;
  suggestedLabel?: string;
};

export type DynamicCtaDestination = {
  key: DynamicCtaDestinationKey;
  kind: "dynamic";
  group: "specific_content";
  label: string;
  selectorLabel: string;
  availability: CtaAvailability;
  auth: CtaAuthRequirement;
  suggestedLabel?: string;
};

export type CtaEditorSelection =
  | { mode: "none" }
  | { mode: "catalog"; key: StaticCtaDestinationKey }
  | { mode: "catalog"; key: "tournament"; params: { tournamentId: string } }
  | { mode: "catalog"; key: "circuit"; params: { slug: string } }
  | { mode: "catalog"; key: "padelleria_content"; params: { contentId: string } }
  | { mode: "catalog"; key: "partner"; params: { slug: string } }
  | { mode: "external"; url: string }
  | { mode: "custom_internal"; path: string }
  | { mode: "legacy"; rawValue: string };

export const CTA_DESTINATION_GROUP_LABELS: Record<CtaDestinationGroup, string> = {
  movi_pages: "Pagine MOVI",
  personal: "Area personale",
  specific_content: "Contenuti specifici",
  information: "Informazioni",
  links: "Collegamenti",
};

export const STATIC_CTA_DESTINATIONS: readonly StaticCtaDestination[] = [
  { key: "home", kind: "static", group: "movi_pages", label: "Home", href: "/", availability: "enabled", auth: "public" },
  { key: "tournaments", kind: "static", group: "movi_pages", label: "Tornei", href: "/tornei", availability: "enabled", auth: "public", suggestedLabel: "Scopri i tornei" },
  { key: "circuits", kind: "static", group: "movi_pages", label: "Circuiti", href: "/#circuiti", availability: "enabled", auth: "public", suggestedLabel: "Scopri i circuiti" },
  { key: "monday_league", kind: "static", group: "movi_pages", label: "Monday League", href: "/monday-league", availability: "enabled", auth: "public" },
  { key: "moviback", kind: "static", group: "movi_pages", label: "MoviBack", href: "/moviback", availability: "enabled", auth: "public" },
  { key: "partners", kind: "static", group: "movi_pages", label: "Partner", href: "/partner", availability: "enabled", auth: "public", suggestedLabel: "Scopri i Partner" },
  { key: "moviback_rules", kind: "static", group: "movi_pages", label: "Regolamento MoviBack", href: "/moviback/regolamento", availability: "enabled", auth: "public" },
  { key: "store", kind: "static", group: "movi_pages", label: "Store MOVI", href: "/store", availability: "enabled", auth: "public" },
  { key: "booking", kind: "static", group: "movi_pages", label: "Prenota", href: "/prenota", availability: "enabled", auth: "public" },
  { key: "play", kind: "static", group: "movi_pages", label: "Gioca", href: "/richieste/gioca", availability: "enabled", auth: "user" },
  { key: "training", kind: "static", group: "movi_pages", label: "Allenati", href: "/richieste/allenati", availability: "enabled", auth: "user" },
  { key: "contact", kind: "static", group: "movi_pages", label: "Contattaci", href: "/contatti", availability: "enabled", auth: "public", suggestedLabel: "Contattaci" },
  { key: "moviback_rewards", kind: "static", group: "personal", label: "Premi MoviBack", href: "/moviback/premi", availability: "enabled", auth: "user" },
  { key: "requests", kind: "static", group: "personal", label: "Le mie richieste", href: "/richieste", availability: "enabled", auth: "user" },
  { key: "activities", kind: "static", group: "personal", label: "Le mie attività", href: "/le-mie-attivita", availability: "enabled", auth: "user" },
  { key: "profile", kind: "static", group: "personal", label: "Profilo", href: "/profilo", availability: "enabled", auth: "user" },
  { key: "privacy", kind: "static", group: "information", label: "Privacy", href: "/privacy", availability: "enabled", auth: "public" },
  { key: "terms", kind: "static", group: "information", label: "Termini", href: "/termini", availability: "enabled", auth: "public" },
  { key: "cookies", kind: "static", group: "information", label: "Cookie", href: "/cookie", availability: "enabled", auth: "public" },
] as const;

export const DYNAMIC_CTA_DESTINATIONS: readonly DynamicCtaDestination[] = [
  { key: "tournament", kind: "dynamic", group: "specific_content", label: "Torneo specifico", selectorLabel: "Torneo", availability: "enabled", auth: "public", suggestedLabel: "Scopri il torneo" },
  { key: "circuit", kind: "dynamic", group: "specific_content", label: "Circuito specifico", selectorLabel: "Circuito", availability: "enabled", auth: "public", suggestedLabel: "Scopri il circuito" },
  { key: "padelleria_content", kind: "dynamic", group: "specific_content", label: "Contenuto Padelleria", selectorLabel: "Contenuto", availability: "enabled", auth: "public", suggestedLabel: "Scopri di più" },
  { key: "partner", kind: "dynamic", group: "specific_content", label: "Partner specifico", selectorLabel: "Partner", availability: "enabled", auth: "public", suggestedLabel: "Scopri il Partner" },
] as const;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`, "i");
const TOURNAMENT_RE = new RegExp(`^/tornei\\?tournament=(${UUID})$`, "i");
const PADELLERIA_RE = new RegExp(`^/padelleria/(${UUID})$`, "i");
const CIRCUIT_RE = /^\/circuiti\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const PARTNER_RE = /^\/partner\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const CONTROL_OR_SPACE_OR_BACKSLASH_RE = /[\u0000-\u0020\\]/;

const RESERVED_INTERNAL_PATHS = [
  "/admin", "/staff", "/api", "/auth", "/dev", "/riscatto-premio",
  "/accedi", "/registrati", "/attiva-account", "/accesso-precedente",
  "/password-dimenticata", "/reset-password",
] as const;

export function isCtaUuid(value: string) {
  return UUID_RE.test(value);
}

export function isCtaSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 120;
}

export function buildTournamentCtaHref(tournamentId: string) {
  if (!isCtaUuid(tournamentId)) throw new Error("ID torneo non valido");
  return `/tornei?tournament=${tournamentId}`;
}

export function buildCircuitCtaHref(slug: string) {
  if (!isCtaSlug(slug)) throw new Error("Slug circuito non valido");
  return `/circuiti/${slug}`;
}

export function buildPadelleriaCtaHref(contentId: string) {
  if (!isCtaUuid(contentId)) throw new Error("ID contenuto non valido");
  return `/padelleria/${contentId}`;
}

export function buildPartnerCtaHref(slug: string) {
  if (!isCtaSlug(slug)) throw new Error("Slug Partner non valido");
  return `/partner/${slug}`;
}

export function canonicalizeExternalCtaUrl(value: string) {
  if (CONTROL_OR_SPACE_OR_BACKSLASH_RE.test(value)) throw new Error("Inserisci un URL HTTPS valido");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Inserisci un URL HTTPS valido"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Sono ammessi solo URL HTTPS senza credenziali");
  return url.toString();
}

export type InternalPathValidation = { ok: true } | { ok: false; error: string };

export function validateCustomInternalPath(value: string): InternalPathValidation {
  if (!value || CONTROL_OR_SPACE_OR_BACKSLASH_RE.test(value) || !/^\/[^/]/.test(value)) {
    return { ok: false, error: "Usa un percorso interno che inizi con una sola /" };
  }
  if (/%(?:2f|5c|00|0a|0d)/i.test(value)) return { ok: false, error: "Il percorso contiene caratteri non consentiti" };
  let pathname: string;
  try {
    const parsed = new URL(value, "https://movi.invalid");
    pathname = decodeURIComponent(parsed.pathname).replace(/\/+$/, "") || "/";
  } catch {
    return { ok: false, error: "Percorso interno non valido" };
  }
  const lower = pathname.toLowerCase();
  if (RESERVED_INTERNAL_PATHS.some((reserved) => lower === reserved || lower.startsWith(`${reserved}/`))) {
    return { ok: false, error: "Questa destinazione è riservata e non può essere usata come CTA" };
  }
  return { ok: true };
}

function isSafeExternal(value: string) {
  try { canonicalizeExternalCtaUrl(value); return true; } catch { return false; }
}

export function matchCtaDestination(value: string | null | undefined): CtaEditorSelection {
  if (!value) return { mode: "none" };
  const staticDestination = STATIC_CTA_DESTINATIONS.find((destination) => destination.href === value);
  if (staticDestination) return { mode: "catalog", key: staticDestination.key };

  const tournament = value.match(TOURNAMENT_RE);
  if (tournament) return { mode: "catalog", key: "tournament", params: { tournamentId: tournament[1] } };
  const circuit = value.match(CIRCUIT_RE);
  if (circuit) return { mode: "catalog", key: "circuit", params: { slug: circuit[1] } };
  const content = value.match(PADELLERIA_RE);
  if (content) return { mode: "catalog", key: "padelleria_content", params: { contentId: content[1] } };
  const partner = value.match(PARTNER_RE);
  if (partner) return { mode: "catalog", key: "partner", params: { slug: partner[1] } };

  if (isSafeExternal(value)) return { mode: "external", url: value };
  if (validateCustomInternalPath(value).ok) return { mode: "custom_internal", path: value };
  return { mode: "legacy", rawValue: value };
}

export function selectionChoice(selection: CtaEditorSelection) {
  if (selection.mode === "none" || selection.mode === "external" || selection.mode === "custom_internal" || selection.mode === "legacy") return selection.mode;
  return `${selection.key === "tournament" || selection.key === "circuit" || selection.key === "padelleria_content" || selection.key === "partner" ? "dynamic" : "static"}:${selection.key}`;
}

export function destinationSuggestion(key: CtaCatalogKey) {
  return [...STATIC_CTA_DESTINATIONS, ...DYNAMIC_CTA_DESTINATIONS].find((destination) => destination.key === key)?.suggestedLabel;
}

export function shouldApplyCtaLabelSuggestion(currentLabel: string | null | undefined, labelWasCustomized: boolean) {
  return !labelWasCustomized && !String(currentLabel ?? "").trim();
}

export function assertNotPadelleriaSelfLink(currentContentId: string | undefined, href: string | null | undefined) {
  if (currentContentId && href === buildPadelleriaCtaHref(currentContentId)) throw new Error("Un contenuto Padelleria non può collegarsi a se stesso");
}

export type TournamentCtaOption = { id: string; name?: string | null; date?: string | null; category?: string | null; type?: string | null };
export type CircuitCtaOption = { id: string; name?: string | null; slug?: string | null; status?: string | null };
export type PadelleriaCtaOption = { id: string; title?: string | null; kind?: string | null; status?: string | null; occurred_at?: string | null; published_at?: string | null; visible_from?: string | null; visible_until?: string | null; deleted_at?: string | null };
export type PartnerCtaOption = { id: string; name?: string | null; slug?: string | null; category?: string | null; status?: string | null; valid_from?: string | null; valid_until?: string | null; deleted_at?: string | null };

export function filterTournamentCtaOptions<T extends TournamentCtaOption>(items: T[], todayRome: string) {
  return items.filter((item) => isCtaUuid(item.id) && typeof item.date === "string" && item.date >= todayRome);
}

export function filterCircuitCtaOptions<T extends CircuitCtaOption>(items: T[]) {
  return items.filter((item) => isCtaUuid(item.id) && Boolean(item.slug && isCtaSlug(item.slug)) && (item.status === "active" || item.status === "closed"));
}

export function filterPadelleriaCtaOptions<T extends PadelleriaCtaOption>(items: T[], currentContentId?: string, now = Date.now()) {
  return items.filter((item) => {
    if (!isCtaUuid(item.id) || item.id === currentContentId || item.deleted_at || item.status !== "published") return false;
    if (item.kind === "e_successo") return true;
    return (!item.visible_from || Date.parse(item.visible_from) <= now) && (!item.visible_until || now <= Date.parse(item.visible_until));
  });
}

export function filterPartnerCtaOptions<T extends PartnerCtaOption>(items: T[], now = Date.now()) {
  return items.filter((item) => isCtaUuid(item.id) && Boolean(item.slug && isCtaSlug(item.slug)) && item.status === "active" && !item.deleted_at && (!item.valid_from || Date.parse(item.valid_from) <= now) && (!item.valid_until || now <= Date.parse(item.valid_until)));
}

export function includePreservedOption<T extends { value: string; label: string }>(options: T[], value: string, label: string): Array<T | { value: string; label: string }> {
  if (!value || options.some((option) => option.value === value)) return options;
  return [{ value, label }, ...options];
}
