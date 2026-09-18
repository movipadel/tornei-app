export type MovibackFulfillmentType =
  | "service"
  | "store_product"
  | "custom_physical"
  | "partner";

export type MovibackRpcResult = {
  ok: boolean;
  created: boolean;
  replayed: boolean;
  should_notify_staff: boolean;
  data: {
    id: string;
    status: string;
    qr_token?: string | null;
    qr_deliverable: boolean;
    reward_id?: string;
    points_cost?: number;
    fulfillment_type?: MovibackFulfillmentType | null;
    store_order_id?: string | null;
    applied?: boolean;
  };
  notification?: MovibackNotificationContext | null;
};

export type MovibackNotificationContext = {
  reward_name?: string | null;
  points_cost?: number | null;
  fulfillment_type?: MovibackFulfillmentType | null;
  product_name?: string | null;
  variant_text?: string | null;
  fulfillment_notes?: string | null;
  initial_status?: string | null;
  action_required?: string | null;
  store_order_handling_required?: boolean | null;
};

export type MovibackApiError = {
  status: number;
  code: string;
  message: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

const ERROR_MAP: Record<string, Omit<MovibackApiError, "code">> = {
  PF08_MALFORMED_REQUEST: { status: 400, message: "Richiesta non valida" },
  PF08_INVALID_MEMBERSHIP: { status: 403, message: "MoviBack non disponibile" },
  PF08_MEMBERSHIP_NOT_APPROVED: { status: 403, message: "MoviBack non approvato" },
  PF08_MEMBERSHIP_AMBIGUOUS: { status: 409, message: "Profilo MoviBack da verificare" },
  PF08_INVALID_REWARD: { status: 404, message: "Premio non trovato" },
  PF08_INACTIVE_REWARD: { status: 409, message: "Premio non disponibile" },
  PF08_REWARD_OUT_OF_STOCK: { status: 409, message: "Premio esaurito" },
  PF08_INSUFFICIENT_POINTS: { status: 409, message: "Punti insufficienti" },
  PF08_FULFILLMENT_UNCLASSIFIED: {
    status: 409,
    message: "Premio temporaneamente non configurato",
  },
  PF08_INVALID_STORE_PRODUCT: {
    status: 409,
    message: "Prodotto premio non disponibile",
  },
  PF08_MISSING_REQUIRED_VARIANT: {
    status: 400,
    message: "Seleziona colore e taglia richiesti",
  },
  PF08_INVALID_STORE_VARIANT: {
    status: 400,
    message: "Variante non disponibile",
  },
  PF08_UNEXPECTED_VARIANT: {
    status: 400,
    message: "Questo premio non richiede una variante",
  },
  PF08_AMBIGUOUS_STORE_VARIANT: {
    status: 409,
    message: "Configurazione variante da verificare",
  },
  PF08_STORE_STOCK_AMBIGUOUS: {
    status: 409,
    message: "Configurazione stock da verificare",
  },
  PF08_INSUFFICIENT_STORE_STOCK: {
    status: 409,
    message: "Stock insufficiente per la variante scelta",
  },
  PF08_IDEMPOTENCY_CONFLICT: {
    status: 409,
    message: "La richiesta è già associata a un'altra operazione",
  },
  PF08_IDEMPOTENCY_INCOMPLETE: {
    status: 409,
    message: "Operazione in verifica: riprova tra poco",
  },
  PF08_INVALID_REDEMPTION: { status: 404, message: "Richiesta premio non trovata" },
  PF08_INVALID_REDEMPTION_TRANSITION: {
    status: 409,
    message: "Azione non disponibile per lo stato corrente",
  },
  PF08_FULFILLMENT_REQUIRED: {
    status: 409,
    message: "Gestione ordine necessaria prima di continuare",
  },
  PF08_FULFILLMENT_STATE_CONFLICT: {
    status: 409,
    message: "Stato ordine non compatibile con questa azione",
  },
  PF08_SUPPLIER_COMMITMENT_REQUIRES_ADMIN: {
    status: 409,
    message: "Operazione bloccata dopo l'impegno al fornitore: serve un amministratore",
  },
  PF08_LEGACY_FULFILLMENT_REQUIRES_ADMIN: {
    status: 409,
    message: "Richiesta storica da verificare manualmente",
  },
  PF08_LEGACY_REVERSAL_REQUIRES_ADMIN: {
    status: 409,
    message: "Storno storico da verificare manualmente",
  },
  PF08_LEDGER_INVARIANT: {
    status: 409,
    message: "Movimento punti da verificare manualmente",
  },
  PF08_RESERVATION_STATE_CONFLICT: {
    status: 409,
    message: "Prenotazione stock da verificare manualmente",
  },
  PF08_REVERSAL_STATE_CONFLICT: {
    status: 409,
    message: "Storno già elaborato o non coerente",
  },
};

export function mapMovibackRpcError(error: unknown): MovibackApiError {
  const raw =
    typeof error === "string"
      ? error
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  const code = raw.match(/PF08_[A-Z0-9_]+/)?.[0] ?? "MOVIBACK_OPERATION_FAILED";
  const mapped = ERROR_MAP[code];

  return mapped
    ? { code, ...mapped }
    : { status: 500, code, message: "Operazione MoviBack non riuscita" };
}

export function isQrDeliverable(status: string | null | undefined) {
  return status === "ready";
}

export function publicQrToken(
  status: string | null | undefined,
  token: string | null | undefined
) {
  return isQrDeliverable(status) ? token ?? null : null;
}

export function shouldScheduleStaffNotification(result: MovibackRpcResult) {
  return Boolean(
    result.created &&
      !result.replayed &&
      result.should_notify_staff &&
      result.notification
  );
}

function fulfillmentLabel(value?: MovibackFulfillmentType | null) {
  switch (value) {
    case "service":
      return "Servizio";
    case "store_product":
      return "Prodotto Store";
    case "custom_physical":
      return "Premio fisico personalizzato";
    case "partner":
      return "Partner";
    default:
      return "Da verificare";
  }
}

export function buildMovibackStaffTelegramMessage(input: {
  notification: MovibackNotificationContext;
  customerName?: string | null;
  customerPhone?: string | null;
}) {
  const { notification, customerName, customerPhone } = input;
  const serviceNote =
    notification.fulfillment_type === "service"
      ? "\nℹ️ Nessuna gestione ordine Store richiesta"
      : "";
  const product = notification.product_name
    ? `\n📦 Prodotto: ${notification.product_name}`
    : "";
  const variant = notification.variant_text
    ? `\n🎨 Variante: ${notification.variant_text}`
    : "";
  const notes = notification.fulfillment_notes
    ? `\n📝 Note: ${notification.fulfillment_notes}`
    : "";

  return (
    `🎁 NUOVA RICHIESTA PREMIO MOVIBACK\n\n` +
    `👤 Cliente: ${customerName || "Cliente MoviBack"}\n` +
    `📞 Telefono: ${customerPhone || "—"}\n` +
    `🏆 Premio: ${notification.reward_name || "Premio"}\n` +
    `⭐ Punti: ${notification.points_cost ?? "—"}\n` +
    `🧭 Tipo: ${fulfillmentLabel(notification.fulfillment_type)}\n` +
    `📍 Stato iniziale: ${notification.initial_status || "richiesto"}` +
    product +
    variant +
    notes +
    serviceNote +
    `\n\n➡️ ${notification.action_required || "Gestire la richiesta nell'applicazione"}` +
    `\n📋 Coda autorevole: Richieste premio. Telegram è solo un avviso.`
  );
}
