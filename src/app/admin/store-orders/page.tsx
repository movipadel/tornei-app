"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Euro,
  FileSpreadsheet,
  Loader2,
  MapPin,
  PackageCheck,
  Search,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import {
  canSafelyCancel,
  operationalConflictMessage,
  operationalStatusLabel,
  resolveOperationalStatus,
  resolveOperationalView,
  resolveOrderSource,
  resolvePrimaryAction,
  visibleVariant,
  type FulfillmentAction,
  type OperationalStatus,
  type OperationalView,
  type RedemptionStatus,
  type StoreOrderSource,
  type StoreOrderStatus,
} from "@/lib/storeOrderOperational";

type OrderItem = {
  id: string;
  product_name: string | null;
  custom_product_name: string | null;
  custom_variant: string | null;
  color_name: string | null;
  size_label: string | null;
  quantity: number;
  total_euro: number;
  total_points: number;
};

type StoreOrder = {
  id: string;
  user_id: string | null;
  status: StoreOrderStatus | string;
  pickup_club: string;
  payment_mode: string;
  total_euro: number;
  total_points: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string | null;
  is_paid: boolean;
  order_type: string;
  related_redemption_id: string | null;
  special_title: string | null;
  special_notes: string | null;
  supplier_paid: boolean;
  supplier_payment_notes: string | null;
  store_order_items: OrderItem[];
  reward_redemption: {
    id: string;
    status: RedemptionStatus | string;
    fulfillment_type: string | null;
  } | null;
};

type CommandResponse = {
  data?: {
    source?: StoreOrderSource;
    operational_status?: string;
    customer_notification_created?: boolean;
    message?: string;
  };
  error?: string;
  code?: string;
};

const CLUBS = ["all", "CENTALLO", "COSTIGLIOLE", "MANTA", "SALUZZO", "REVELLO"];
const VIEWS: Array<{ value: OperationalView; label: string }> = [
  { value: "preparing", label: "Da preparare" },
  { value: "ready", label: "Pronti" },
  { value: "history", label: "Storico" },
];
const ORIGINS: Array<{ value: "all" | StoreOrderSource; label: string }> = [
  { value: "all", label: "Tutti" },
  { value: "STORE", label: "Store" },
  { value: "MOVIBACK", label: "MoviBack" },
];

export default function AdminStoreOrdersPage() {
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [view, setView] = useState<OperationalView>("preparing");
  const [origin, setOrigin] = useState<"all" | StoreOrderSource>("all");
  const [club, setClub] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StoreOrder | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [canAccessEconomics, setCanAccessEconomics] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/store-orders?status=all&club=${club}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore caricamento ordini");
      const rows = (json.data ?? []) as StoreOrder[];
      setOrders(rows);
      setSelected((current) =>
        current ? rows.find((order) => order.id === current.id) ?? null : null
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Errore caricamento ordini");
    } finally {
      setLoading(false);
    }
  }, [club]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    async function checkEconomicsAccess() {
      try {
        const res = await fetch("/api/admin/store/economics/access", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        setCanAccessEconomics(Boolean(json.allowed));
      } catch {
        setCanAccessEconomics(false);
      }
    }
    void checkEconomicsAccess();
  }, []);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((order) => resolveOperationalView(order) === view)
      .filter((order) => origin === "all" || resolveOrderSource(order) === origin)
      .filter((order) => {
        if (!q) return true;
        const haystack = [
          order.customer_name,
          order.customer_phone,
          order.pickup_club,
          order.id,
          order.related_redemption_id,
          ...order.store_order_items.flatMap((item) => [
            item.custom_product_name,
            item.product_name,
            visibleVariant(item),
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const delta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return view === "history" ? -delta : delta;
      });
  }, [orders, origin, search, view]);

  const supplierOrders = orders.filter(
    (order) => resolveOrderSource(order) === "STORE" && order.status === "pending"
  );
  const supplierSelectedIds = selectedIds.filter((id) =>
    supplierOrders.some((order) => order.id === id)
  );

  const counts = {
    preparing: orders.filter((order) => resolveOperationalView(order) === "preparing").length,
    ready: orders.filter((order) => resolveOperationalView(order) === "ready").length,
    history: orders.filter((order) => resolveOperationalView(order) === "history").length,
    conflict: orders.filter((order) => resolveOperationalStatus(order) === "conflict").length,
  };

  async function runCommand(order: StoreOrder, action: FulfillmentAction) {
    if (action === "cancel") {
      const confirmed = window.confirm("Annullare questa richiesta premio?");
      if (!confirmed) return;
    }

    try {
      setSavingId(order.id);
      const res = await fetch(`/api/admin/store-orders/${order.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          ...(action === "cancel" ? { reason: "Annullamento operatore" } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as CommandResponse;
      if (!res.ok) {
        if (json.code?.startsWith("PF08_")) {
          throw new Error(
            json.error || "Ordine da verificare. Nessuna modifica è stata eseguita."
          );
        }
        throw new Error(json.error || "Operazione non riuscita");
      }

      if (
        action === "ready" &&
        json.data?.source === "MOVIBACK" &&
        json.data.customer_notification_created
      ) {
        toast.success("Premio pronto. Notifica cliente registrata.");
      } else if (action === "ready") {
        toast.success("Ordine segnato pronto");
      } else if (action === "deliver") {
        toast.success(json.data?.source === "MOVIBACK" ? "Premio consegnato" : "Ordine consegnato");
      } else {
        toast.success("Richiesta annullata");
      }

      setSelectedIds((current) => current.filter((id) => id !== order.id));
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Operazione non riuscita");
    } finally {
      setSavingId(null);
    }
  }

  async function togglePaid(orderId: string, isPaid: boolean) {
    try {
      setSavingId(orderId);
      const res = await fetch("/api/admin/store-orders/toggle-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, is_paid: isPaid }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore aggiornamento pagamento");
      toast.success(isPaid ? "Ordine segnato come pagato" : "Pagamento rimosso");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Errore aggiornamento pagamento");
    } finally {
      setSavingId(null);
    }
  }

  async function exportPendingSummary() {
    if (supplierSelectedIds.length === 0) {
      toast.error("Seleziona almeno un ordine Store da preparare");
      return;
    }
    try {
      setExporting(true);
      const res = await fetch("/api/admin/store-orders/export-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: supplierSelectedIds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Errore export");
      }
      const url = window.URL.createObjectURL(await res.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `riepilogo-store-movi-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Riepilogo creato per gli ordini Store selezionati");
      setSelectedIds([]);
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Errore export");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={pageStyle} className="admin-orders-page">
      <div style={{ maxWidth: 1080, margin: "0 auto", color: "white" }}>
        <header style={{ marginBottom: 18 }}>
          <div className="admin-orders-heading">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ShoppingBag className="w-7 h-7" style={{ color: "#f59e0b" }} />
                <h1 style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.9, margin: 0 }}>
                  Ordini Store
                </h1>
              </div>
              <p style={{ ...muted, margin: "7px 0 0" }}>
                Prepara e consegna ordini Store e premi fisici MoviBack.
              </p>
            </div>
            {canAccessEconomics ? (
              <a href="/admin/store/economica" style={economicsButton}>
                <BarChart3 className="w-4 h-4" /> Economica
              </a>
            ) : null}
          </div>
        </header>

        <section style={gridKpi} className="admin-orders-kpi">
          <Kpi icon={<Clock3 />} label="Da preparare" value={counts.preparing} tone="#fbbf24" />
          <Kpi icon={<PackageCheck />} label="Pronti" value={counts.ready} tone="#93c5fd" />
          <Kpi icon={<CheckCircle2 />} label="Storico" value={counts.history} tone="#86efac" />
          <Kpi icon={<AlertTriangle />} label="Da verificare" value={counts.conflict} tone="#f87171" />
        </section>

        <section style={filtersCard}>
          <div style={segmentedControl} className="admin-orders-segments">
            {VIEWS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setView(item.value)}
                style={segmentButton(view === item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div style={filterRow} className="admin-orders-filter-row">
            <div style={searchBox}>
              <Search className="w-4 h-4" style={{ color: "rgba(255,255,255,0.55)" }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cerca cliente o prodotto"
                style={searchInput}
              />
            </div>
            <select value={origin} onChange={(event) => setOrigin(event.target.value as typeof origin)} style={selectStyle}>
              {ORIGINS.map((item) => (
                <option key={item.value} value={item.value} style={optionStyle}>
                  {item.label}
                </option>
              ))}
            </select>
            <select value={club} onChange={(event) => setClub(event.target.value)} style={selectStyle}>
              {CLUBS.map((item) => (
                <option key={item} value={item} style={optionStyle}>
                  {item === "all" ? "Tutti i club" : item}
                </option>
              ))}
            </select>
          </div>
        </section>

        {view === "preparing" ? (
          <details style={supplierDetails}>
            <summary style={supplierSummary}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <FileSpreadsheet className="w-4 h-4" /> Riepilogo fornitore Store
              </span>
              <span style={muted}>Strumento secondario</span>
            </summary>
            <div className="admin-orders-supplier-content" style={supplierContent}>
              <div style={muted}>
                Include esclusivamente ordini STORE ancora pending. I premi MoviBack sono esclusi.
              </div>
              <button
                type="button"
                onClick={exportPendingSummary}
                disabled={exporting || supplierSelectedIds.length === 0}
                style={secondaryButton(supplierSelectedIds.length > 0)}
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Genera CSV ({supplierSelectedIds.length})
              </button>
            </div>
          </details>
        ) : null}

        <section style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {loading ? (
            <div style={{ ...cardStyle, display: "flex", justifyContent: "center", padding: 46 }}>
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={emptyRow}>Nessun ordine in questa vista.</div>
          ) : (
            filteredOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                view={view}
                saving={savingId === order.id}
                supplierSelected={selectedIds.includes(order.id)}
                onToggleSupplier={() =>
                  setSelectedIds((current) =>
                    current.includes(order.id)
                      ? current.filter((id) => id !== order.id)
                      : [...current, order.id]
                  )
                }
                onOpen={() => setSelected(order)}
                onCommand={(action) => void runCommand(order, action)}
              />
            ))
          )}
        </section>

        {selected ? (
          <OrderModal
            order={selected}
            saving={savingId === selected.id}
            onClose={() => setSelected(null)}
            onTogglePaid={(isPaid) => void togglePaid(selected.id, isPaid)}
          />
        ) : null}

        <style jsx global>{`
          .admin-orders-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
          @media (max-width: 760px) {
            .admin-orders-page { padding: 18px 12px 34px !important; }
            .admin-orders-kpi { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
            .admin-orders-segments { grid-template-columns: 1fr !important; }
            .admin-orders-filter-row { grid-template-columns: 1fr !important; }
            .admin-orders-card-head { align-items: flex-start !important; }
            .admin-orders-primary-grid { grid-template-columns: 1fr !important; }
            .admin-orders-card-actions { flex-direction: column !important; align-items: stretch !important; }
            .admin-orders-card-actions button { width: 100% !important; }
            .admin-orders-supplier-content { align-items: stretch !important; flex-direction: column !important; }
            .admin-orders-modal-overlay { padding: 0 !important; }
            .admin-orders-modal-card { max-height: 92dvh !important; border-radius: 26px 26px 0 0 !important; }
            .admin-orders-modal-item { flex-direction: column !important; }
          }
          @media (max-width: 430px) {
            .admin-orders-kpi { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  view,
  saving,
  supplierSelected,
  onToggleSupplier,
  onOpen,
  onCommand,
}: {
  order: StoreOrder;
  view: OperationalView;
  saving: boolean;
  supplierSelected: boolean;
  onToggleSupplier: () => void;
  onOpen: () => void;
  onCommand: (action: FulfillmentAction) => void;
}) {
  const source = resolveOrderSource(order);
  const status = resolveOperationalStatus(order);
  const primaryAction = resolvePrimaryAction(order);
  const canCancel = canSafelyCancel(order);
  const firstItem = order.store_order_items[0];
  const productName = firstItem?.custom_product_name || firstItem?.product_name || order.special_title || "Prodotto";
  const variant = firstItem ? visibleVariant(firstItem) : "";
  const supplierEligible = source === "STORE" && order.status === "pending" && view === "preparing";

  return (
    <article style={orderCard}>
      <div style={cardBody}>
        <div className="admin-orders-card-head" style={cardHead}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <OriginBadge source={source} />
              <StatusBadge status={status} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 13 }}>
              <User className="w-4 h-4" style={{ color: "#fbbf24", flexShrink: 0 }} />
              <strong style={{ fontSize: 18 }}>{order.customer_name || "Cliente"}</strong>
            </div>
          </div>
          <button type="button" onClick={onOpen} style={detailsButton}>
            Dettagli <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div style={{ marginTop: 15 }}>
          <div style={{ fontSize: 17, fontWeight: 950 }}>{productName}</div>
          {variant ? <div style={{ ...muted, marginTop: 4 }}>{variant}</div> : null}
          {order.store_order_items.length > 1 ? (
            <div style={{ ...muted, marginTop: 4 }}>+ altri {order.store_order_items.length - 1} prodotti</div>
          ) : null}
        </div>

        <div className="admin-orders-primary-grid" style={primaryGrid}>
          <Info icon={<MapPin />} text={order.pickup_club} />
          <Info icon={<CalendarDays />} text={formatDate(order.created_at)} />
          {source === "MOVIBACK" ? (
            <Info icon={<ShoppingBag />} text={`${Number(order.total_points || 0)} punti`} />
          ) : source === "STORE" ? (
            <Info icon={<Euro />} text={`€${Number(order.total_euro || 0).toFixed(2)}`} />
          ) : null}
        </div>

        {status === "conflict" ? (
          <div style={conflictBox}>
            <AlertTriangle className="w-4 h-4" style={{ flexShrink: 0 }} />
            <span>{operationalConflictMessage()}</span>
          </div>
        ) : null}

        {supplierEligible ? (
          <label style={supplierCheck}>
            <input type="checkbox" checked={supplierSelected} onChange={onToggleSupplier} />
            Includi nel riepilogo fornitore
          </label>
        ) : null}
      </div>

      {view !== "history" && (primaryAction || canCancel) ? (
        <div className="admin-orders-card-actions" style={cardActions}>
          {primaryAction ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => onCommand(primaryAction)}
              style={primaryButton}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : primaryAction === "ready" ? <PackageCheck className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {primaryAction === "ready" ? "Segna pronto" : "Consegna"}
            </button>
          ) : null}
          {canCancel ? (
            <button type="button" disabled={saving} onClick={() => onCommand("cancel")} style={dangerLinkButton}>
              Annulla
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function OrderModal({
  order,
  saving,
  onClose,
  onTogglePaid,
}: {
  order: StoreOrder;
  saving: boolean;
  onClose: () => void;
  onTogglePaid: (isPaid: boolean) => void;
}) {
  const source = resolveOrderSource(order);
  const status = resolveOperationalStatus(order);

  return (
    <div style={modalOverlay} className="admin-orders-modal-overlay" onClick={onClose}>
      <div style={modalCard} className="admin-orders-modal-card" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} style={closeButton} aria-label="Chiudi">
          <X className="w-5 h-5" />
        </button>
        <div style={{ paddingRight: 48 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <OriginBadge source={source} />
            <StatusBadge status={status} />
          </div>
          <h2 style={{ fontSize: 23, fontWeight: 950, margin: "14px 0 0" }}>Dettagli ordine</h2>
        </div>

        {status === "conflict" ? <div style={conflictBox}>{operationalConflictMessage()}</div> : null}

        <DetailBox title="Cliente">
          <DetailLine label="Nome" value={order.customer_name} />
          <DetailLine label="Telefono" value={order.customer_phone} />
          <DetailLine label="Email" value={order.customer_email} />
        </DetailBox>

        <DetailBox title="Prodotti">
          <div style={{ display: "grid", gap: 9 }}>
            {order.store_order_items.map((item) => {
              const variant = visibleVariant(item);
              return (
                <div key={item.id} style={modalItemRow} className="admin-orders-modal-item">
                  <div>
                    <div style={{ fontWeight: 950 }}>{item.custom_product_name || item.product_name}</div>
                    {variant ? <div style={muted}>{variant}</div> : null}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong>x{item.quantity}</strong>
                    {source === "STORE" ? <div style={muted}>€{Number(item.total_euro || 0).toFixed(2)}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </DetailBox>

        <DetailBox title="Ritiro e riferimenti">
          <DetailLine label="Club" value={order.pickup_club} />
          <DetailLine label="Data" value={formatDate(order.created_at)} />
          <DetailLine label="ID ordine" value={order.id} />
          {source === "MOVIBACK" ? <DetailLine label="ID richiesta premio" value={order.related_redemption_id} /> : null}
        </DetailBox>

        {source === "STORE" ? (
          <DetailBox title="Pagamento e amministrazione">
            <DetailLine label="Modalità" value={order.payment_mode} />
            <DetailLine label="Totale" value={`€${Number(order.total_euro || 0).toFixed(2)}`} />
            <label style={{ ...supplierCheck, marginTop: 12 }}>
              <input
                type="checkbox"
                checked={Boolean(order.is_paid)}
                disabled={saving}
                onChange={(event) => onTogglePaid(event.target.checked)}
              />
              Pagamento incassato
            </label>
          </DetailBox>
        ) : source === "MOVIBACK" ? (
          <DetailBox title="MoviBack">
            <DetailLine label="Punti utilizzati" value={`${Number(order.total_points || 0)} punti`} />
            <DetailLine label="Tipo" value="Premio fisico" />
          </DetailBox>
        ) : (
          <DetailBox title="Informazioni tecniche">
            <DetailLine label="Tipo ordine" value={order.order_type} />
            <DetailLine label="Stato ordine" value={order.status} />
            <DetailLine label="Stato richiesta" value={order.reward_redemption?.status} />
          </DetailBox>
        )}

        {order.notes || order.admin_notes || order.special_notes ? (
          <DetailBox title="Note">
            <div style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.5 }}>
              {order.notes || order.admin_notes || order.special_notes}
            </div>
          </DetailBox>
        ) : null}
      </div>
    </div>
  );
}

function OriginBadge({ source }: { source: StoreOrderSource }) {
  const meta =
    source === "STORE"
      ? { label: "STORE", color: "#7dd3fc", bg: "rgba(56,189,248,.13)", border: "rgba(56,189,248,.28)" }
      : source === "MOVIBACK"
        ? { label: "MOVIBACK", color: "#fbbf24", bg: "rgba(245,158,11,.14)", border: "rgba(245,158,11,.30)" }
        : { label: "DA VERIFICARE", color: "#fca5a5", bg: "rgba(248,113,113,.13)", border: "rgba(248,113,113,.28)" };
  return <span style={{ ...pillBase, color: meta.color, background: meta.bg, borderColor: meta.border }}>{meta.label}</span>;
}

function StatusBadge({ status }: { status: OperationalStatus }) {
  const tone =
    status === "ready"
      ? { color: "#93c5fd", bg: "rgba(147,197,253,.13)", border: "rgba(147,197,253,.25)" }
      : status === "delivered"
        ? { color: "#86efac", bg: "rgba(134,239,172,.13)", border: "rgba(134,239,172,.25)" }
        : status === "cancelled" || status === "conflict"
          ? { color: "#fca5a5", bg: "rgba(248,113,113,.13)", border: "rgba(248,113,113,.25)" }
          : { color: "#fde68a", bg: "rgba(251,191,36,.13)", border: "rgba(251,191,36,.25)" };
  return <span style={{ ...pillBase, color: tone.color, background: tone.bg, borderColor: tone.border }}>{operationalStatusLabel(status)}</span>;
}

function Kpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ color: tone }}>{icon}</div>
      <div style={{ marginTop: 10, fontSize: 25, fontWeight: 950 }}>{value}</div>
      <div style={muted}>{label}</div>
    </div>
  );
}

function Info({ icon, text }: { icon: ReactNode; text: string }) {
  return <div style={infoBox}><span style={{ color: "#fbbf24", display: "inline-flex" }}>{icon}</span><span>{text || "-"}</span></div>;
}

function DetailBox({ title, children }: { title: string; children: ReactNode }) {
  return <section style={detailBox}><h3 style={sectionTitle}>{title}</h3>{children}</section>;
}

function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  return <div style={detailLine}><span style={muted}>{label}</span><span style={{ fontWeight: 850, textAlign: "right", overflowWrap: "anywhere" }}>{value || "-"}</span></div>;
}

function formatDate(date?: string | null) {
  if (!date) return "-";
  return new Date(date).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const pageStyle: React.CSSProperties = { minHeight: "100dvh", background: "linear-gradient(180deg,#030712 0%,#07111f 42%,#0f172a 100%)", padding: "24px 16px 44px" };
const cardStyle: React.CSSProperties = { borderRadius: 24, padding: 17, background: "linear-gradient(135deg,rgba(255,255,255,.075),rgba(255,255,255,.035))", border: "1px solid rgba(255,255,255,.09)", boxShadow: "0 18px 42px rgba(0,0,0,.20)", backdropFilter: "blur(14px)" };
const muted: React.CSSProperties = { color: "rgba(255,255,255,.58)", fontSize: 13, fontWeight: 650 };
const gridKpi: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: 14 };
const filtersCard: React.CSSProperties = { ...cardStyle, display: "grid", gap: 12 };
const segmentedControl: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7, padding: 5, borderRadius: 18, background: "rgba(3,7,18,.46)" };
const segmentButton = (active: boolean): React.CSSProperties => ({ minHeight: 43, border: active ? "1px solid rgba(251,191,36,.38)" : "1px solid transparent", borderRadius: 14, background: active ? "rgba(251,191,36,.15)" : "transparent", color: active ? "#fde68a" : "rgba(255,255,255,.65)", fontWeight: 900, cursor: "pointer" });
const filterRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 170px 180px", gap: 9 };
const searchBox: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, minHeight: 46, borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.055)", padding: "0 13px" };
const searchInput: React.CSSProperties = { width: "100%", border: 0, outline: "none", background: "transparent", color: "white", fontWeight: 750 };
const selectStyle: React.CSSProperties = { width: "100%", minHeight: 46, borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.055)", color: "white", padding: "0 13px", outline: "none", fontWeight: 850 };
const optionStyle: React.CSSProperties = { color: "#0f172a", background: "white" };
const supplierDetails: React.CSSProperties = { ...cardStyle, marginTop: 12, padding: 14 };
const supplierSummary: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, color: "#fde68a", fontWeight: 900, cursor: "pointer" };
const supplierContent: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 14 };
const secondaryButton = (enabled: boolean): React.CSSProperties => ({ minHeight: 42, border: `1px solid ${enabled ? "rgba(251,191,36,.30)" : "rgba(255,255,255,.08)"}`, borderRadius: 14, padding: "0 14px", background: enabled ? "rgba(251,191,36,.14)" : "rgba(255,255,255,.04)", color: enabled ? "#fde68a" : "rgba(255,255,255,.35)", fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: enabled ? "pointer" : "not-allowed" });
const emptyRow: React.CSSProperties = { ...cardStyle, color: "rgba(255,255,255,.58)", fontSize: 14, fontWeight: 750, textAlign: "center" };
const orderCard: React.CSSProperties = { ...cardStyle, padding: 0, overflow: "hidden" };
const cardBody: React.CSSProperties = { padding: 17 };
const cardHead: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 };
const primaryGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginTop: 14 };
const infoBox: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7, borderRadius: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.07)", padding: "9px 10px", color: "rgba(255,255,255,.78)", fontSize: 13, fontWeight: 800 };
const pillBase: React.CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, borderWidth: 1, borderStyle: "solid", padding: "6px 9px", fontSize: 11, fontWeight: 950, letterSpacing: ".04em", whiteSpace: "nowrap" };
const detailsButton: React.CSSProperties = { minHeight: 38, borderRadius: 999, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.055)", color: "rgba(255,255,255,.78)", padding: "0 11px", fontWeight: 850, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" };
const conflictBox: React.CSSProperties = { display: "flex", gap: 9, alignItems: "flex-start", marginTop: 13, padding: 11, borderRadius: 14, background: "rgba(248,113,113,.10)", border: "1px solid rgba(248,113,113,.22)", color: "#fecaca", fontSize: 13, fontWeight: 750, lineHeight: 1.4 };
const supplierCheck: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, marginTop: 13, color: "rgba(255,255,255,.70)", fontSize: 13, fontWeight: 800 };
const cardActions: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "13px 17px 17px", borderTop: "1px solid rgba(255,255,255,.07)" };
const primaryButton: React.CSSProperties = { minHeight: 48, flex: 1, border: 0, borderRadius: 16, background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#111827", fontWeight: 950, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" };
const dangerLinkButton: React.CSSProperties = { minHeight: 44, border: "1px solid rgba(248,113,113,.22)", borderRadius: 14, background: "rgba(248,113,113,.08)", color: "#fca5a5", padding: "0 14px", fontWeight: 850, cursor: "pointer" };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 90, background: "rgba(3,7,18,.72)", backdropFilter: "blur(10px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 14 };
const modalCard: React.CSSProperties = { width: "100%", maxWidth: 620, maxHeight: "92dvh", overflow: "auto", borderRadius: 28, background: "linear-gradient(180deg,rgba(15,23,42,.98),rgba(3,7,18,.98))", border: "1px solid rgba(255,255,255,.10)", boxShadow: "0 26px 70px rgba(0,0,0,.45)", padding: 18, color: "white", position: "relative" };
const closeButton: React.CSSProperties = { position: "absolute", right: 14, top: 14, width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(255,255,255,.12)", background: "rgba(3,7,18,.58)", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const detailBox: React.CSSProperties = { marginTop: 12, borderRadius: 19, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", padding: 14 };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 950, margin: "0 0 10px", color: "#fbbf24" };
const detailLine: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, marginTop: 8 };
const modalItemRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, borderRadius: 14, background: "rgba(255,255,255,.045)", padding: 11 };
const economicsButton: React.CSSProperties = { minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 999, padding: "9px 13px", background: "rgba(16,185,129,.13)", border: "1px solid rgba(16,185,129,.24)", color: "#a7f3d0", fontSize: 13, fontWeight: 950, textDecoration: "none" };
