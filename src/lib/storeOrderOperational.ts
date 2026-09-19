export type StoreOrderStatus =
  | "pending"
  | "confirmed"
  | "ordered_to_supplier"
  | "ready"
  | "delivered"
  | "cancelled";

export type RedemptionStatus =
  | "requested"
  | "processing"
  | "ready"
  | "delivered"
  | "cancelled"
  | "rejected"
  | "approved";

export type StoreOrderSource = "STORE" | "MOVIBACK" | "CONFLICT";
export type OperationalStatus =
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled"
  | "conflict";
export type OperationalView = "preparing" | "ready" | "history";
export type FulfillmentAction = "ready" | "deliver" | "cancel";

export type RewardRedemptionProjection = {
  id: string;
  status: RedemptionStatus | string;
  fulfillment_type: string | null;
};

export type OperationalOrderShape = {
  status: StoreOrderStatus | string;
  order_type: string | null;
  related_redemption_id: string | null;
  reward_redemption?: RewardRedemptionProjection | null;
};

const PREPARING_ORDER_STATES = new Set([
  "pending",
  "confirmed",
  "ordered_to_supplier",
]);
const PREPARING_REDEMPTION_STATES = new Set(["requested", "processing"]);

export function resolveOrderSource(order: OperationalOrderShape): StoreOrderSource {
  if (order.order_type === "catalog" && !order.related_redemption_id) return "STORE";
  if (
    order.order_type === "reward_redemption" &&
    order.related_redemption_id &&
    order.reward_redemption?.id === order.related_redemption_id &&
    ["store_product", "custom_physical"].includes(
      String(order.reward_redemption.fulfillment_type)
    )
  ) {
    return "MOVIBACK";
  }
  return "CONFLICT";
}

export function resolveOperationalStatus(order: OperationalOrderShape): OperationalStatus {
  const source = resolveOrderSource(order);
  if (source === "CONFLICT") return "conflict";

  if (source === "STORE") {
    if (PREPARING_ORDER_STATES.has(order.status)) return "preparing";
    if (order.status === "ready") return "ready";
    if (order.status === "delivered") return "delivered";
    if (order.status === "cancelled") return "cancelled";
    return "conflict";
  }

  const redemptionStatus = order.reward_redemption?.status;
  if (
    PREPARING_ORDER_STATES.has(order.status) &&
    redemptionStatus &&
    PREPARING_REDEMPTION_STATES.has(redemptionStatus)
  ) {
    return "preparing";
  }
  if (order.status === "ready" && redemptionStatus === "ready") return "ready";
  if (order.status === "delivered" && redemptionStatus === "delivered") {
    return "delivered";
  }
  if (
    order.status === "cancelled" &&
    (redemptionStatus === "cancelled" || redemptionStatus === "rejected")
  ) {
    return "cancelled";
  }
  return "conflict";
}

export function resolveOperationalView(order: OperationalOrderShape): OperationalView {
  const status = resolveOperationalStatus(order);
  if (status === "ready") return "ready";
  if (status === "delivered" || status === "cancelled") return "history";
  return "preparing";
}

export function resolvePrimaryAction(
  order: OperationalOrderShape
): Exclude<FulfillmentAction, "cancel"> | null {
  const status = resolveOperationalStatus(order);
  if (status === "preparing") return "ready";
  if (status === "ready") return "deliver";
  return null;
}

export function canSafelyCancel(order: OperationalOrderShape) {
  return (
    resolveOrderSource(order) === "MOVIBACK" &&
    resolveOperationalStatus(order) === "preparing" &&
    order.status === "pending"
  );
}

export function operationalStatusLabel(status: OperationalStatus) {
  if (status === "preparing") return "Da preparare";
  if (status === "ready") return "Pronto";
  if (status === "delivered") return "Consegnato";
  if (status === "cancelled") return "Annullato";
  return "Da verificare";
}

export function operationalConflictMessage() {
  return "Lo stato storico dell'ordine non è coerente. Nessuna modifica è stata eseguita.";
}

export function visibleVariant(input: {
  custom_variant?: string | null;
  color_name?: string | null;
  size_label?: string | null;
}) {
  if (input.custom_variant?.trim()) return input.custom_variant.trim();
  return [input.color_name, input.size_label]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" · ");
}
