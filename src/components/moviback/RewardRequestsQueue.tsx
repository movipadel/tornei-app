"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageCheck,
  RefreshCw,
  Store,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import type { MovibackFulfillmentType } from "@/lib/movibackContracts";
import {
  actionLabel,
  fulfillmentLabel,
  needsReason,
  safeAvailableActions,
  STAFF_QUEUE_FILTERS,
  statusLabel,
  storeVariantText,
  type StaffQueueAction,
  type StaffQueueScope,
} from "@/lib/movibackStaffQueue";

type QueueItem = {
  id: string;
  status: string;
  fulfillment_type: MovibackFulfillmentType | null;
  points_cost: number;
  requested_at: string;
  processing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  terminal_reason: string | null;
  notes: string | null;
  reward: {
    id: string;
    name: string;
    description: string | null;
    image_path: string | null;
  } | null;
  membership: {
    id: string;
    membership_code: string;
    user: {
      id: string;
      full_name: string;
      phone: string | null;
      email: string | null;
    } | null;
  } | null;
  qr_deliverable: boolean;
  available_actions: string[];
  historical: boolean;
  store_fulfillment: {
    id: string;
    status: string;
    special_title: string | null;
    special_notes: string | null;
    created_at: string;
    confirmed_at: string | null;
    ordered_to_supplier_at: string | null;
    ready_at: string | null;
    delivered_at: string | null;
    store_order_items: Array<{
      id: string;
      product_name: string | null;
      color_name: string | null;
      size_label: string | null;
      custom_product_name: string | null;
      custom_variant: string | null;
      quantity: number;
    }>;
  } | null;
};

type QueueResponse = {
  data?: QueueItem[];
  page?: { has_more: boolean; next_offset: number | null };
  error?: string;
  code?: string;
};

const PAGE_SIZE = 100;

export function RewardRequestsQueue() {
  const [scope, setScope] = useState<StaffQueueScope>("active");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRequests = useRef(new Set<string>());

  const load = useCallback(
    async (offset = 0) => {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          scope,
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        const response = await fetch(
          `/api/admin/moviback/redemptions?${query.toString()}`,
          { cache: "no-store" }
        );
        const body = (await response.json().catch(() => ({}))) as QueueResponse;
        if (!response.ok) {
          console.warn("MoviBack staff queue load failed", {
            status: response.status,
            code: body.code,
          });
          throw new Error(body.error || "Impossibile caricare le richieste premio");
        }
        const rows = body.data ?? [];
        setItems((current) => (offset === 0 ? rows : mergeRows(current, rows)));
        setNextOffset(body.page?.has_more ? body.page.next_offset ?? null : null);
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "Impossibile caricare le richieste premio";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [scope]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  async function runAction(item: QueueItem, action: StaffQueueAction) {
    const requestKey = `${item.id}:${action}`;
    if (activeRequests.current.has(requestKey)) return;

    let reason: string | undefined;
    if (needsReason(action)) {
      reason = window.prompt(
        action === "reject"
          ? "Motivo del rifiuto (visibile nella pratica):"
          : "Motivo dell’annullamento (visibile nella pratica):"
      )?.trim();
      if (!reason) return;
    } else {
      const confirmed = window.confirm(
        `Confermi l’azione “${actionLabel(action, item.fulfillment_type)}” per ${item.reward?.name || "questo premio"}?`
      );
      if (!confirmed) return;
    }

    activeRequests.current.add(requestKey);
    setBusyId(item.id);
    const storageKey = `pf08:staff-lifecycle:${requestKey}`;
    const idempotencyKey =
      window.sessionStorage.getItem(storageKey) ?? window.crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, idempotencyKey);

    try {
      const response = await fetch(
        `/api/admin/moviback/redemptions/${item.id}/transition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            idempotency_key: idempotencyKey,
            reason,
          }),
        }
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        console.warn("MoviBack lifecycle command failed", {
          status: response.status,
          code: body.code,
          action,
        });
        throw new Error(body.error || "Operazione non riuscita");
      }
      window.sessionStorage.removeItem(storageKey);
      toast.success("Richiesta aggiornata");
      await load(0);
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Operazione non riuscita"
      );
    } finally {
      activeRequests.current.delete(requestKey);
      setBusyId(null);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 1080, margin: "0 auto", color: "white" }}>
        <header style={headerStyle}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <PackageCheck size={29} style={{ color: "#f59e0b" }} />
              <h1 style={{ fontSize: 29, fontWeight: 950, letterSpacing: -0.8 }}>
                Richieste premio
              </h1>
            </div>
            <p style={mutedStyle}>
              Coda operativa MoviBack: prendi in carico, prepara e consegna.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(0)}
            disabled={loading || busyId !== null}
            style={secondaryButton}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Aggiorna
          </button>
        </header>

        <nav aria-label="Filtri richieste premio" style={filtersStyle}>
          {STAFF_QUEUE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={scope === filter.value}
              onClick={() => setScope(filter.value)}
              style={scope === filter.value ? activeFilterButton : filterButton}
            >
              {filter.label}
            </button>
          ))}
        </nav>

        {loading ? (
          <div style={centerStyle}>
            <Loader2 className="animate-spin" />
            Caricamento richieste…
          </div>
        ) : error && items.length === 0 ? (
          <div style={warningStyle}>
            <AlertTriangle size={20} />
            <div>
              <strong>Caricamento non riuscito</strong>
              <div style={mutedStyle}>{error}</div>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div style={emptyStyle}>Nessuna richiesta in questo filtro.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {items.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onAction={runAction}
              />
            ))}
          </div>
        )}

        {nextOffset !== null ? (
          <button
            type="button"
            onClick={() => void load(nextOffset)}
            disabled={loadingMore}
            style={{ ...secondaryButton, margin: "18px auto 0" }}
          >
            {loadingMore ? <Loader2 size={16} className="animate-spin" /> : null}
            Carica altre richieste
          </button>
        ) : null}
      </div>
    </main>
  );
}

function QueueCard({
  item,
  busy,
  onAction,
}: {
  item: QueueItem;
  busy: boolean;
  onAction: (item: QueueItem, action: StaffQueueAction) => Promise<void>;
}) {
  const actions = safeAvailableActions(item.available_actions, item.historical);
  const user = item.membership?.user;
  const storeItems = item.store_fulfillment?.store_order_items ?? [];

  return (
    <article style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserRound size={17} style={{ color: "#fbbf24" }} />
            <strong style={{ fontSize: 18 }}>{user?.full_name || "Cliente MoviBack"}</strong>
          </div>
          <div style={{ marginTop: 5, fontSize: 21, fontWeight: 950 }}>
            {item.reward?.name || "Premio da verificare"}
          </div>
          <div style={mutedStyle}>
            {item.points_cost} punti · {fulfillmentLabel(item.fulfillment_type)}
          </div>
        </div>
        <span style={statusPill(item.status)}>{statusLabel(item.status)}</span>
      </div>

      <div style={timelineStyle}>
        <Time label="Richiesto" value={item.requested_at} />
        <Time label="In lavorazione" value={item.processing_at} />
        <Time label="Pronto" value={item.ready_at} />
        <Time label="Consegnato" value={item.delivered_at} />
      </div>

      {item.fulfillment_type === "service" ? (
        <div style={contextStyle}>
          <CheckCircle2 size={18} style={{ color: "#86efac" }} />
          <div>
            <strong>Servizio</strong>
            <div style={mutedStyle}>Nessuna gestione ordine Store richiesta.</div>
          </div>
        </div>
      ) : item.store_fulfillment ? (
        <div style={contextStyle}>
          <Store size={18} style={{ color: "#93c5fd" }} />
          <div style={{ minWidth: 0 }}>
            <strong>
              Ordine Store · {storeOrderStatus(item.store_fulfillment.status)}
            </strong>
            {storeItems.length > 0 ? (
              <div style={{ display: "grid", gap: 4, marginTop: 5 }}>
                {storeItems.map((orderItem) => (
                  <div key={orderItem.id} style={mutedStyle}>
                    {orderItem.product_name ||
                      orderItem.custom_product_name ||
                      item.store_fulfillment?.special_title ||
                      "Premio fisico"}
                    {" · "}
                    {storeVariantText(orderItem)}
                    {orderItem.quantity > 1 ? ` · q.tà ${orderItem.quantity}` : ""}
                  </div>
                ))}
              </div>
            ) : (
              <div style={mutedStyle}>Dettaglio di evasione da verificare.</div>
            )}
          </div>
        </div>
      ) : item.fulfillment_type !== null ? (
        <div style={contextStyle}>
          <PackageCheck size={18} style={{ color: "#fbbf24" }} />
          <div>
            <strong>{fulfillmentLabel(item.fulfillment_type)}</strong>
            <div style={mutedStyle}>Contesto operativo disponibile nella richiesta.</div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <span style={item.qr_deliverable ? readyPill : quietPill}>
          QR {item.qr_deliverable ? "utilizzabile" : "non ancora utilizzabile"}
        </span>
        {item.terminal_reason ? (
          <span style={quietPill}>Motivo: {item.terminal_reason}</span>
        ) : null}
      </div>

      {item.historical || item.available_actions.includes("manual_review") ? (
        <div style={{ ...warningStyle, marginTop: 13 }}>
          <AlertTriangle size={18} />
          <div>
            <strong>Richiesta legacy — verifica manuale necessaria</strong>
            <div style={mutedStyle}>
              Le azioni automatiche sono disabilitate per proteggere punti, stock e ordine.
            </div>
          </div>
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div style={actionsStyle}>
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => void onAction(item, action)}
              style={action === "reject" || action === "cancel" ? dangerButton : primaryButton}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {actionLabel(action, item.fulfillment_type)}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Time({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 850 }}>
        {label}
      </div>
      <div style={{ marginTop: 2, fontSize: 12, fontWeight: 750 }}>
        {value ? new Date(value).toLocaleString("it-IT") : "—"}
      </div>
    </div>
  );
}

function mergeRows(current: QueueItem[], incoming: QueueItem[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return Array.from(byId.values());
}

function storeOrderStatus(status: string) {
  return (
    {
      requested: "Richiesto",
      confirmed: "Confermato",
      ordered_to_supplier: "Ordinato al fornitore",
      ready: "Pronto",
      delivered: "Consegnato",
      cancelled: "Annullato",
    }[status] ?? "Da verificare"
  );
}

function statusPill(status: string): React.CSSProperties {
  const color =
    status === "ready"
      ? "#86efac"
      : status === "requested"
        ? "#fbbf24"
        : status === "processing"
          ? "#93c5fd"
          : status === "delivered"
            ? "#c4b5fd"
            : "#fca5a5";
  return { ...quietPill, color, borderColor: `${color}44` };
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
  padding: "24px 16px 44px",
};
const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  marginBottom: 18,
};
const filtersStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  paddingBottom: 12,
  marginBottom: 8,
};
const filterButton: React.CSSProperties = {
  flexShrink: 0,
  minHeight: 38,
  borderRadius: 999,
  padding: "0 13px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.68)",
  fontWeight: 800,
  cursor: "pointer",
};
const activeFilterButton: React.CSSProperties = {
  ...filterButton,
  background: "rgba(245,158,11,0.18)",
  borderColor: "rgba(245,158,11,0.38)",
  color: "#fde68a",
};
const cardStyle: React.CSSProperties = {
  borderRadius: 25,
  padding: 17,
  background: "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
};
const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};
const timelineStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
  marginTop: 14,
  paddingTop: 13,
  borderTop: "1px solid rgba(255,255,255,0.08)",
};
const contextStyle: React.CSSProperties = {
  marginTop: 13,
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: 12,
  borderRadius: 17,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.07)",
};
const actionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 9,
  marginTop: 14,
};
const primaryButton: React.CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  border: 0,
  padding: "0 14px",
  background: "linear-gradient(135deg, #f59e0b, #fbbf24)",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
};
const dangerButton: React.CSSProperties = {
  ...primaryButton,
  background: "rgba(239,68,68,0.13)",
  border: "1px solid rgba(239,68,68,0.28)",
  color: "#fecaca",
};
const secondaryButton: React.CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.11)",
  padding: "0 14px",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  fontWeight: 850,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
};
const mutedStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 650,
  lineHeight: 1.4,
};
const quietPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.055)",
  color: "rgba(255,255,255,0.7)",
  fontSize: 12,
  fontWeight: 850,
};
const readyPill: React.CSSProperties = {
  ...quietPill,
  color: "#86efac",
  borderColor: "rgba(34,197,94,0.28)",
};
const warningStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: 13,
  borderRadius: 17,
  color: "#fde68a",
  background: "rgba(245,158,11,0.11)",
  border: "1px solid rgba(245,158,11,0.24)",
};
const emptyStyle: React.CSSProperties = {
  padding: 30,
  textAlign: "center",
  borderRadius: 22,
  color: "rgba(255,255,255,0.6)",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
};
const centerStyle: React.CSSProperties = {
  ...emptyStyle,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 9,
};
