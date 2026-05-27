"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
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

const STATUSES = [
  { value: "all", label: "Tutti" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confermati" },
  { value: "ordered_to_supplier", label: "Fornitore" },
  { value: "ready", label: "Pronti" },
  { value: "delivered", label: "Consegnati" },
  { value: "cancelled", label: "Annullati" },
];

const CLUBS = ["all", "CENTALLO", "COSTIGLIOLE", "MANTA", "SALUZZO", "REVELLO"];

export default function AdminStoreOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [club, setClub] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [canAccessEconomics, setCanAccessEconomics] = useState(false);

  async function load() {
    try {
      setLoading(true);

      const res = await fetch(`/api/admin/store-orders?status=${status}&club=${club}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore caricamento ordini");

      setOrders(json.data ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status, club]);

  useEffect(() => {
  async function checkEconomicsAccess() {
    try {
      const res = await fetch("/api/admin/store/economics/access", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      setCanAccessEconomics(Boolean(json.allowed));
    } catch {
      setCanAccessEconomics(false);
    }
  }

  checkEconomicsAccess();
}, []);

  const filteredOrders = useMemo(() => {
  const base = showClosed
    ? orders
    : orders.filter((o) => !(o.status === "delivered" && o.is_paid));

  const q = search.trim().toLowerCase();
  if (!q) return base;

  return base.filter((o) => {
    const haystack = [
      o.customer_name,
      o.customer_phone,
      o.customer_email,
      o.pickup_club,
      o.status,
      o.order_type,
o.special_title,
o.special_notes,
      o.status === "delivered" && o.is_paid ? "chiuso" : "",
      ...(o.store_order_items ?? []).map((i: any) => i.product_name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });
}, [orders, search, showClosed]);

  const pendingOrders = orders.filter((o) => o.status === "pending");

  const pendingSelectedIds = selectedIds.filter((id) =>
    pendingOrders.some((o) => o.id === id)
  );

  const totalToCollect = orders
    .filter((o) => o.status !== "cancelled" && !o.is_paid)
    .reduce((sum, o) => sum + Number(o.total_euro || 0), 0);

  const kpi = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    ready: orders.filter((o) => o.status === "ready").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    toCollect: totalToCollect,
  };

  async function updateStatus(orderId: string, newStatus: string) {
    try {
      setSavingId(orderId);

      const res = await fetch("/api/admin/store-orders/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, status: newStatus }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore cambio stato");

      toast.success("Stato aggiornato");
      await load();

      setSelected((prev: any) => (prev?.id === orderId ? { ...prev, status: newStatus } : prev));

      if (newStatus !== "pending") {
        setSelectedIds((prev) => prev.filter((id) => id !== orderId));
      }
    } catch (e: any) {
      toast.error(e?.message || "Errore");
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

      setSelected((prev: any) =>
        prev?.id === orderId ? { ...prev, is_paid: isPaid } : prev
      );
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSavingId(null);
    }
  }

  async function exportPendingSummary() {
    if (pendingSelectedIds.length === 0) {
      toast.error("Seleziona almeno un ordine pending");
      return;
    }

    try {
      setExporting(true);

      const res = await fetch("/api/admin/store-orders/export-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: pendingSelectedIds }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Errore export");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `riepilogo-store-movi-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);

      toast.success("Riepilogo creato. Ordini passati a confermati.");
      setSelectedIds([]);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Errore export");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={pageStyle} className="admin-orders-page">
      <div style={{ maxWidth: 1180, margin: "0 auto", color: "white" }} className="admin-orders-shell">
        <header style={{ marginBottom: 22 }}>
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <ShoppingBag className="w-7 h-7" style={{ color: "#f59e0b" }} />
      <h1 style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.9 }}>
        Ordini Store MOVI
      </h1>
    </div>

    {canAccessEconomics ? (
      <a href="/admin/store/economica" style={economicsButton}>
        <BarChart3 className="w-4 h-4" />
        Economica
      </a>
    ) : null}
  </div>

  <p style={muted}>Gestione ordini, stati, ritiri club e dati cliente.</p>
</header>

        <section style={gridKpi} className="admin-orders-kpi">
          <Kpi icon={<ShoppingBag />} label="Ordini" value={kpi.total} />
          <Kpi icon={<Clock />} label="Pending" value={kpi.pending} tone="#fbbf24" />
          <Kpi icon={<PackageCheck />} label="Pronti" value={kpi.ready} tone="#93c5fd" />
          <Kpi icon={<CheckCircle2 />} label="Consegnati" value={kpi.delivered} tone="#86efac" />
          <Kpi
            icon={<Euro />}
            label="Da incassare"
            value={`€${kpi.toCollect.toFixed(2)}`}
            tone="#fbbf24"
          />
        </section>

        <section style={cardStyle} className="admin-orders-filters-card">
          <div style={filtersGrid} className="admin-orders-filters-grid">
            <div style={searchBox}>
              <Search className="w-4 h-4" style={{ color: "rgba(255,255,255,0.55)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca cliente, telefono, prodotto..."
                style={searchInput}
              />
            </div>

            <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value} style={optionStyle}>
                  {s.label}
                </option>
              ))}
            </select>

            <select value={club} onChange={(e) => setClub(e.target.value)} style={selectStyle}>
              {CLUBS.map((c) => (
                <option key={c} value={c} style={optionStyle}>
                  {c === "all" ? "Tutti i club" : c}
                </option>
              ))}
            </select>
          </div>
          <label
          className="admin-orders-show-closed"
  style={{
    marginTop: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: 850,
    borderRadius: 999,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "8px 11px",
  }}
>
  <input
    type="checkbox"
    checked={showClosed}
    onChange={(e) => setShowClosed(e.target.checked)}
  />
  Mostra ordini chiusi
</label>
        </section>

        <section style={{ ...cardStyle, marginTop: 14 }} className="admin-orders-supplier-card">
          <div style={supplierActionRow} className="admin-orders-supplier-row">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FileSpreadsheet className="w-5 h-5" style={{ color: "#fbbf24" }} />
                <h2 style={{ fontSize: 18, fontWeight: 950, margin: 0 }}>
                  Riepilogo fornitore
                </h2>
              </div>
              <div style={{ ...muted, marginTop: 6 }}>
                Seleziona ordini pending, genera CSV per Excel e passa gli ordini a confermati.
              </div>
            </div>

            <button
              type="button"
              className="admin-orders-export-button"
              onClick={exportPendingSummary}
              disabled={exporting || pendingSelectedIds.length === 0}
              style={{
                minHeight: 46,
                border: 0,
                borderRadius: 18,
                padding: "0 14px",
                background:
                  pendingSelectedIds.length === 0
                    ? "rgba(255,255,255,0.08)"
                    : "linear-gradient(135deg,#f59e0b,#fbbf24)",
                color: pendingSelectedIds.length === 0 ? "rgba(255,255,255,0.45)" : "#111827",
                fontWeight: 950,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: pendingSelectedIds.length === 0 ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Genera Excel ({pendingSelectedIds.length})
            </button>
          </div>
        </section>

        <section style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {loading ? (
            <div style={{ ...cardStyle, textAlign: "center", padding: 46 }}>
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={emptyRow}>Nessun ordine trovato.</div>
          ) : (
            filteredOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                saving={savingId === order.id}
                selected={selectedIds.includes(order.id)}
                onToggleSelect={() =>
                  setSelectedIds((prev) =>
                    prev.includes(order.id)
                      ? prev.filter((id) => id !== order.id)
                      : [...prev, order.id]
                  )
                }
                onTogglePaid={(isPaid: boolean) => togglePaid(order.id, isPaid)}
                onOpen={() => setSelected(order)}
                onStatus={(newStatus: string) => updateStatus(order.id, newStatus)}
              />
            ))
          )}
        </section>

        {selected ? (
          <OrderModal
            order={selected}
            saving={savingId === selected.id}
            onClose={() => setSelected(null)}
            onStatus={(newStatus: string) => updateStatus(selected.id, newStatus)}
            onTogglePaid={(isPaid: boolean) => togglePaid(selected.id, isPaid)}
          />
        ) : null}
                <style jsx global>{`
          @media (max-width: 760px) {
            .admin-orders-page {
              padding: 18px 12px 34px !important;
            }

            .admin-orders-kpi {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 10px !important;
            }

            .admin-orders-filters-grid {
              grid-template-columns: 1fr !important;
            }

            .admin-orders-show-closed {
              width: 100% !important;
              justify-content: center !important;
            }

            .admin-orders-supplier-row {
              flex-direction: column !important;
              align-items: stretch !important;
            }

            .admin-orders-export-button {
              width: 100% !important;
            }

            .admin-orders-checks-row {
              align-items: stretch !important;
            }

            .admin-orders-checks-row label,
            .admin-orders-checks-row span {
              width: 100% !important;
              justify-content: center !important;
            }

            .admin-orders-main-head {
              flex-direction: column !important;
              align-items: flex-start !important;
            }

            .admin-orders-info-grid {
              grid-template-columns: 1fr !important;
            }

            .admin-orders-item-preview {
              flex-direction: column !important;
              align-items: flex-start !important;
            }

            .admin-orders-status-bar {
              grid-template-columns: 1fr !important;
            }

            .admin-orders-modal-overlay {
              padding: 0 !important;
              align-items: flex-end !important;
            }

            .admin-orders-modal-card {
              max-height: 92dvh !important;
              border-radius: 26px 26px 0 0 !important;
              padding: 16px !important;
            }

            .admin-orders-modal-head {
              flex-direction: column !important;
              align-items: flex-start !important;
              padding-right: 48px !important;
            }

            .admin-orders-modal-item-row {
              flex-direction: column !important;
              align-items: stretch !important;
            }

            .admin-orders-modal-item-row > div:last-child {
              text-align: left !important;
            }
          }

          @media (max-width: 430px) {
            .admin-orders-kpi {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  onOpen,
  onStatus,
  saving,
  selected,
  onToggleSelect,
  onTogglePaid,
}: any) {
  const items = order.store_order_items ?? [];

  return (
    <div style={orderCard} className="admin-orders-card">
      <div style={orderChecksRow} className="admin-orders-checks-row">
        {order.status === "pending" ? (
          <label onClick={(e) => e.stopPropagation()} style={supplierCheckLabel}>
            <input type="checkbox" checked={selected} onChange={onToggleSelect} />
            Riepilogo fornitore
          </label>
        ) : null}

        {order.status !== "pending" ? (
          <label onClick={(e) => e.stopPropagation()} style={paidCheckLabel}>
            <input
              type="checkbox"
              checked={Boolean(order.is_paid)}
              disabled={saving}
              onChange={(e) => onTogglePaid(e.target.checked)}
            />
            Pagato
          </label>
        ) : null}

        {order.status === "delivered" && order.is_paid ? (
          <span style={closedBadge}>Chiuso</span>
        ) : null}
      </div>

      <button type="button" onClick={onOpen} style={orderMainButton}>
        <div
  style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
  className="admin-orders-main-head"
>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <User className="w-4 h-4" style={{ color: "#fbbf24" }} />
              <div style={{ fontSize: 17, fontWeight: 950 }}>
                {order.customer_name || "Cliente"}
              </div>
            </div>

            <div style={{ ...muted, marginTop: 5 }}>
              {order.customer_phone || "Telefono non indicato"} ·{" "}
              {order.customer_email || "Email non indicata"}
            </div>
            {order.order_type === "reward_redemption" ? (
  <div style={{ marginTop: 8 }}>
    <span style={rewardOrderBadge}>Premio MoviBack</span>
  </div>
) : order.order_type === "special" ? (
  <div style={{ marginTop: 8 }}>
    <span style={specialOrderBadge}>Ordine speciale</span>
  </div>
) : null}
          </div>

          <StatusBadge status={order.status} />
        </div>

        <div style={orderInfoGrid} className="admin-orders-info-grid">
          <SmallInfo icon={<MapPin />} text={order.pickup_club} />
          <SmallInfo icon={<Euro />} text={`€${Number(order.total_euro || 0).toFixed(2)}`} />
          <SmallInfo icon={<CalendarDays />} text={formatDate(order.created_at)} />
        </div>
      </button>

      <div style={statusBar} className="admin-orders-status-bar">
        <select
          value={order.status}
          disabled={saving}
          onChange={(e) => onStatus(e.target.value)}
          style={statusSelect}
        >
          {STATUSES.filter((s) => s.value !== "all").map((s) => (
            <option key={s.value} value={s.value} style={optionStyle}>
              {s.label}
            </option>
          ))}
        </select>

        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#fbbf24" }} />
        ) : null}
      </div>
    </div>
  );
}

function OrderModal({ order, onClose, onStatus, onTogglePaid, saving }: any) {
  const items = order.store_order_items ?? [];

  return (
    <div style={modalOverlay} className="admin-orders-modal-overlay" onClick={onClose}>
      <div style={modalCard} className="admin-orders-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={closeButton}>
          <X className="w-5 h-5" />
        </button>

        <div
  style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingRight: 44 }}
  className="admin-orders-modal-head"
>
          <div>
            <div style={{ fontSize: 23, fontWeight: 950 }}>Dettaglio ordine</div>
            <div style={{ ...muted, marginTop: 4 }}>{order.id}</div>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div style={{ ...detailBox, marginTop: 16 }}>
          <h3 style={sectionTitle}>Cliente</h3>
          <DetailLine label="Nome" value={order.customer_name} />
          <DetailLine label="Telefono" value={order.customer_phone} />
          <DetailLine label="Email" value={order.customer_email} />
        </div>

        <div style={detailBox}>
          <h3 style={sectionTitle}>Ordine</h3>
          {order.order_type && order.order_type !== "catalog" ? (
  <>
    <DetailLine
      label="Tipo ordine"
      value={
        order.order_type === "reward_redemption"
          ? "Premio MoviBack"
          : "Ordine speciale"
      }
    />
    <DetailLine label="Titolo speciale" value={order.special_title} />
  </>
) : null}
          <DetailLine label="Club ritiro" value={order.pickup_club} />
          <DetailLine label="Pagamento" value={order.payment_mode} />
          <DetailLine label="Totale euro" value={`€${Number(order.total_euro || 0).toFixed(2)}`} />
          <DetailLine label="Punti usati" value={`${Number(order.total_points || 0)} pt`} />
          <DetailLine label="Pagamento incassato" value={order.is_paid ? "Sì" : "No"} />
          {order.status === "delivered" && order.is_paid ? (
            <DetailLine label="Stato operativo" value="Chiuso" />
          ) : null}
          <DetailLine label="Data" value={formatDate(order.created_at)} />
        </div>

        {order.notes ? (
          <div style={detailBox}>
            <h3 style={sectionTitle}>Note cliente</h3>
            <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 650 }}>{order.notes}</div>
          </div>
        ) : null}

        <div style={detailBox}>
          <h3 style={sectionTitle}>Prodotti</h3>
          <div style={{ display: "grid", gap: 9 }}>
            {items.map((i: any) => (
              <div key={i.id} style={modalItemRow} className="admin-orders-modal-item-row">
                <div>
                  <div style={{ fontWeight: 950 }}>
  {i.custom_product_name || i.product_name}
</div>
                  <div style={muted}>
                    {i.custom_variant || i.color_name || ""}
{i.size_label ? ` / ${i.size_label}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 950 }}>x{i.quantity}</div>
                  <div style={muted}>€{Number(i.total_euro || 0).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={detailBox}>
          <h3 style={sectionTitle}>Cambia stato</h3>
          <select
            value={order.status}
            disabled={saving}
            onChange={(e) => onStatus(e.target.value)}
            style={selectStyle}
          >
            {STATUSES.filter((s) => s.value !== "all").map((s) => (
              <option key={s.value} value={s.value} style={optionStyle}>
                {s.label}
              </option>
            ))}
          </select>

          {order.status !== "pending" ? (
            <label style={{ ...paidCheckLabel, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={Boolean(order.is_paid)}
                disabled={saving}
                onChange={(e) => onTogglePaid(e.target.checked)}
              />
              Ordine pagato
            </label>
          ) : null}

          {order.status === "delivered" && order.is_paid ? (
            <div style={{ marginTop: 10 }}>
              <span style={closedBadge}>Chiuso</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, tone = "#ffffff" }: any) {
  return (
    <div style={cardStyle}>
      <div style={{ color: tone }}>{icon}</div>
      <div style={{ marginTop: 12, fontSize: 25, fontWeight: 950 }}>{value}</div>
      <div style={muted}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta: Record<string, { label: string; bg: string; color: string; border: string }> = {
    pending: {
      label: "Pending",
      bg: "rgba(251,191,36,0.14)",
      color: "#fbbf24",
      border: "rgba(251,191,36,0.26)",
    },
    confirmed: {
      label: "Confermato",
      bg: "rgba(45,212,191,0.13)",
      color: "#2dd4bf",
      border: "rgba(45,212,191,0.25)",
    },
    ordered_to_supplier: {
      label: "Fornitore",
      bg: "rgba(196,181,253,0.13)",
      color: "#c4b5fd",
      border: "rgba(196,181,253,0.25)",
    },
    ready: {
      label: "Pronto",
      bg: "rgba(147,197,253,0.13)",
      color: "#93c5fd",
      border: "rgba(147,197,253,0.25)",
    },
    delivered: {
      label: "Consegnato",
      bg: "rgba(134,239,172,0.13)",
      color: "#86efac",
      border: "rgba(134,239,172,0.25)",
    },
    cancelled: {
      label: "Annullato",
      bg: "rgba(248,113,113,0.13)",
      color: "#f87171",
      border: "rgba(248,113,113,0.25)",
    },
  };

  const m = meta[status] ?? meta.pending;

  return (
    <span
      style={{
        borderRadius: 999,
        padding: "7px 10px",
        background: m.bg,
        color: m.color,
        border: `1px solid ${m.border}`,
        fontSize: 12,
        fontWeight: 950,
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
}

function SmallInfo({ icon, text }: any) {
  return (
    <div style={smallInfo}>
      <span style={{ color: "#fbbf24", display: "inline-flex" }}>{icon}</span>
      <span>{text || "-"}</span>
    </div>
  );
}

function DetailLine({ label, value }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
      <span style={muted}>{label}</span>
      <span style={{ fontWeight: 900, textAlign: "right" }}>{value || "-"}</span>
    </div>
  );
}

function formatDate(date?: string) {
  if (!date) return "-";
  return new Date(date).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
  padding: "24px 16px 44px",
};

const cardStyle: React.CSSProperties = {
  borderRadius: 26,
  padding: 18,
  background: "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

const gridKpi: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 14,
};

const filtersGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 180px 180px",
  gap: 10,
};

const supplierActionRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const searchBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  minHeight: 46,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.055)",
  padding: "0 13px",
};

const searchInput: React.CSSProperties = {
  width: "100%",
  border: 0,
  outline: "none",
  background: "transparent",
  color: "white",
  fontWeight: 750,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.055)",
  color: "white",
  padding: "0 13px",
  outline: "none",
  fontWeight: 850,
};

const optionStyle: React.CSSProperties = {
  color: "#0f172a",
  background: "#ffffff",
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 650,
};

const orderCard: React.CSSProperties = {
  ...cardStyle,
  padding: 0,
  overflow: "hidden",
};

const orderChecksRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "12px 16px 0",
};

const checkLabel: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  color: "rgba(255,255,255,0.75)",
  fontSize: 13,
  fontWeight: 850,
  borderRadius: 999,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  padding: "8px 11px",
};

const supplierCheckLabel: React.CSSProperties = {
  ...checkLabel,
  background: "rgba(251,191,36,0.12)",
  border: "1px solid rgba(251,191,36,0.24)",
  color: "#fde68a",
};

const paidCheckLabel: React.CSSProperties = {
  ...checkLabel,
  background: "rgba(16,185,129,0.12)",
  border: "1px solid rgba(16,185,129,0.24)",
  color: "#a7f3d0",
};

const closedBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  background: "rgba(134,239,172,0.13)",
  border: "1px solid rgba(134,239,172,0.25)",
  color: "#86efac",
  fontSize: 12,
  fontWeight: 950,
  padding: "8px 11px",
};

const orderMainButton: React.CSSProperties = {
  width: "100%",
  border: 0,
  background: "transparent",
  color: "white",
  textAlign: "left",
  padding: 16,
  cursor: "pointer",
};

const orderInfoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 8,
  marginTop: 13,
};

const smallInfo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  borderRadius: 16,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  padding: "9px 10px",
  color: "rgba(255,255,255,0.78)",
  fontSize: 13,
  fontWeight: 800,
};

const itemPreview: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  borderRadius: 14,
  background: "rgba(255,255,255,0.045)",
  padding: "9px 10px",
};

const statusBar: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 26px",
  gap: 8,
  alignItems: "center",
  padding: "0 16px 16px",
};

const statusSelect: React.CSSProperties = {
  ...selectStyle,
  minHeight: 42,
};

const emptyRow: React.CSSProperties = {
  ...cardStyle,
  color: "rgba(255,255,255,0.58)",
  fontSize: 14,
  fontWeight: 750,
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 90,
  background: "rgba(3,7,18,0.72)",
  backdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 14,
};

const modalCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 620,
  maxHeight: "92dvh",
  overflow: "auto",
  borderRadius: 28,
  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(3,7,18,0.98))",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 26px 70px rgba(0,0,0,0.45)",
  padding: 18,
  color: "white",
  position: "relative",
};

const closeButton: React.CSSProperties = {
  position: "absolute",
  right: 14,
  top: 14,
  zIndex: 3,
  width: 40,
  height: 40,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(3,7,18,0.58)",
  color: "white",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const detailBox: React.CSSProperties = {
  marginTop: 12,
  borderRadius: 20,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  padding: 14,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  margin: "0 0 10px",
  color: "#fbbf24",
};

const modalItemRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  borderRadius: 16,
  background: "rgba(255,255,255,0.045)",
  padding: 12,
};

const economicsButton: React.CSSProperties = {
  minHeight: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  borderRadius: 999,
  padding: "9px 13px",
  background: "rgba(16,185,129,0.13)",
  border: "1px solid rgba(16,185,129,0.24)",
  color: "#a7f3d0",
  fontSize: 13,
  fontWeight: 950,
  textDecoration: "none",
  boxShadow: "0 14px 30px rgba(0,0,0,0.18)",
};

const rewardOrderBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  background: "rgba(245,158,11,0.14)",
  border: "1px solid rgba(245,158,11,0.28)",
  color: "#fbbf24",
  fontSize: 12,
  fontWeight: 950,
  padding: "7px 10px",
};

const specialOrderBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  background: "rgba(56,189,248,0.13)",
  border: "1px solid rgba(56,189,248,0.25)",
  color: "#7dd3fc",
  fontSize: 12,
  fontWeight: 950,
  padding: "7px 10px",
};