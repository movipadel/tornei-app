import type { MovibackFulfillmentType } from "@/lib/movibackContracts";

export type StaffQueueScope =
  | "active"
  | "requested"
  | "processing"
  | "ready"
  | "delivered"
  | "terminal"
  | "all";

export type StaffQueueAction =
  | "process"
  | "ready"
  | "deliver"
  | "cancel"
  | "reject";

export const STAFF_QUEUE_FILTERS: ReadonlyArray<{
  value: StaffQueueScope;
  label: string;
}> = [
  { value: "active", label: "Da gestire" },
  { value: "requested", label: "Richieste" },
  { value: "processing", label: "In lavorazione" },
  { value: "ready", label: "Pronte" },
  { value: "delivered", label: "Consegnate" },
  { value: "terminal", label: "Annullate / rifiutate" },
  { value: "all", label: "Tutte" },
];

const ACTIONS = new Set<StaffQueueAction>([
  "process",
  "ready",
  "deliver",
  "cancel",
  "reject",
]);

export function statusLabel(status: string) {
  return (
    {
      requested: "Richiesto",
      processing: "In lavorazione",
      ready: "Pronto",
      delivered: "Consegnato",
      cancelled: "Annullato",
      rejected: "Rifiutato",
    }[status] ?? "Da verificare"
  );
}

export function fulfillmentLabel(type: MovibackFulfillmentType | null) {
  if (type === "service") return "Servizio";
  if (type === "store_product") return "Prodotto Store";
  if (type === "custom_physical") return "Premio fisico personalizzato";
  if (type === "partner") return "Premio partner";
  return "Classificazione da verificare";
}

export function safeAvailableActions(
  values: string[],
  historical: boolean
): StaffQueueAction[] {
  if (historical) return [];
  return values.filter((value): value is StaffQueueAction =>
    ACTIONS.has(value as StaffQueueAction)
  );
}

export function actionLabel(
  action: StaffQueueAction,
  fulfillmentType: MovibackFulfillmentType | null
) {
  if (action === "process") return "Prendi in carico";
  if (action === "ready") return "Segna come pronto";
  if (action === "deliver") {
    return fulfillmentType === "service" ? "Erogato" : "Consegnato";
  }
  if (action === "cancel") return "Annulla";
  return "Rifiuta";
}

export function needsReason(action: StaffQueueAction) {
  return action === "cancel" || action === "reject";
}

export function storeVariantText(item: {
  color_name?: string | null;
  size_label?: string | null;
  custom_variant?: string | null;
}) {
  const parts = [item.color_name, item.size_label, item.custom_variant]
    .map((value) => value?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Nessuna variante cliente";
}
