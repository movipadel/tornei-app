"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BadgeEuro,
  Building2,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Save,
  Store,
  Truck,
  UserRound,
  X,
} from "lucide-react";

const CLUBS = ["ALL", "CENTALLO", "COSTIGLIOLE", "MANTA", "SALUZZO", "REVELLO"];

type StoreOrder = {
  id: string;
  pickup_club: string | null;
  payment_mode: string | null;
  total_euro: number | null;
  total_points: number | null;
  points_used: number | null;
  residual_euro: number | null;
  status: string | null;
  is_paid: boolean;
  supplier_paid: boolean;
  supplier_paid_at: string | null;
  supplier_paid_by_type: "club" | "person" | null;
  supplier_paid_by_name: string | null;
  supplier_paid_by_club: string | null;
  supplier_payment_notes: string | null;
  created_at: string | null;
  store_order_items?: Array<{
    id: string;
    product_name: string;
    color_name: string | null;
    size_label: string | null;
    quantity: number;
    total_euro: number | null;
    total_points: number | null;
  }>;
};

type ApiData = {
  kpis: {
    orders_count: number;
    customer_paid_count: number;
    supplier_paid_count: number;
    supplier_unpaid_count: number;
    customer_total_euro: number;
    customer_collected_euro: number;
    customer_to_collect_euro: number;
    points_used: number;
  };
  by_club: any[];
  by_supplier_payer: any[];
  orders: StoreOrder[];
};

export default function StoreEconomicsPage() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);

  const [club, setClub] = useState("ALL");
  const [supplierPaid, setSupplierPaid] = useState("");

  const [modalOrder, setModalOrder] = useState<StoreOrder | null>(null);
  const [saving, setSaving] = useState(false);

  const [supplierForm, setSupplierForm] = useState({
    supplier_paid_by_type: "club" as "club" | "person",
    supplier_paid_by_name: "",
    supplier_paid_by_club: "",
    supplier_payment_notes: "",
  });

  async function loadData() {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (club !== "ALL") params.set("club", club);
      if (supplierPaid) params.set("supplier_paid", supplierPaid);

      const res = await fetch(`/api/admin/store-economics?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore caricamento economica");

      setData(json.data);
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [club, supplierPaid]);

  function openSupplierModal(order: StoreOrder) {
    setModalOrder(order);
    setSupplierForm({
      supplier_paid_by_type: order.supplier_paid_by_type ?? "club",
      supplier_paid_by_name: order.supplier_paid_by_name ?? "",
      supplier_paid_by_club: order.supplier_paid_by_club ?? order.pickup_club ?? "",
      supplier_payment_notes: order.supplier_payment_notes ?? "",
    });
  }

  async function saveSupplierPayment(order: StoreOrder, paid: boolean) {
    try {
      setSaving(true);

      const payload = paid
        ? {
            order_id: order.id,
            supplier_paid: true,
            ...supplierForm,
          }
        : {
            order_id: order.id,
            supplier_paid: false,
          };

      const res = await fetch("/api/admin/store-economics/supplier-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore pagamento fornitore");

      toast.success(paid ? "Pagamento fornitore registrato" : "Pagamento fornitore annullato");
      setModalOrder(null);
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  const kpis = data?.kpis;

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1180, margin: "0 auto", color: "white" }}>
        <header style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BadgeEuro className="w-7 h-7" style={{ color: "#fbbf24" }} />
            <h1 style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.9 }}>
              Economica Store
            </h1>
          </div>

          <p style={muted}>
            Controllo economico ordini e pagamento fornitore, separato dalla gestione ordini cliente.
          </p>
        </header>

        <section style={filtersCard}>
          <select value={club} onChange={(e) => setClub(e.target.value)} style={inputStyle}>
            {CLUBS.map((c) => (
              <option key={c} value={c} style={optionStyle}>
                {c === "ALL" ? "Tutti i club" : c}
              </option>
            ))}
          </select>

          <select
            value={supplierPaid}
            onChange={(e) => setSupplierPaid(e.target.value)}
            style={inputStyle}
          >
            <option value="" style={optionStyle}>
              Tutti i pagamenti fornitore
            </option>
            <option value="false" style={optionStyle}>
              Fornitore non pagato
            </option>
            <option value="true" style={optionStyle}>
              Fornitore pagato
            </option>
          </select>
        </section>

        {loading ? (
          <div style={cardStyle}>
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : (
          <>
            <section style={kpiGrid}>
              <Kpi icon={<Store />} label="Ordini validi" value={kpis?.orders_count ?? 0} />
              <Kpi
                icon={<CheckCircle2 />}
                label="Fornitore pagato"
                value={kpis?.supplier_paid_count ?? 0}
                tone="#86efac"
              />
              <Kpi
                icon={<Truck />}
                label="Fornitore da pagare"
                value={kpis?.supplier_unpaid_count ?? 0}
                tone="#fca5a5"
              />
              <Kpi
                icon={<BadgeEuro />}
                label="Incassato clienti"
                value={`€${Number(kpis?.customer_collected_euro ?? 0).toFixed(2)}`}
                tone="#fbbf24"
              />
            </section>

            <section style={twoCol}>
              <Card title="Riepilogo per club" icon={<Building2 className="w-5 h-5" />}>
                <div style={{ display: "grid", gap: 10 }}>
                  {(data?.by_club ?? []).map((row) => (
                    <div key={row.club} style={rowStyle}>
                      <div>
                        <div style={{ fontWeight: 950 }}>{row.club}</div>
                        <div style={muted}>
                          {row.orders_count} ordini · fornitore pagato {row.supplier_paid_count} · da pagare{" "}
                          {row.supplier_unpaid_count}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 950 }}>
                        €{Number(row.customer_total_euro ?? 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Chi ha pagato il fornitore" icon={<UserRound className="w-5 h-5" />}>
                <div style={{ display: "grid", gap: 10 }}>
                  {(data?.by_supplier_payer ?? []).length === 0 ? (
                    <div style={emptyRow}>Nessun pagamento fornitore registrato.</div>
                  ) : (
                    data!.by_supplier_payer.map((row, idx) => (
                      <div key={idx} style={rowStyle}>
                        <div>
                          <div style={{ fontWeight: 950 }}>{row.supplier_paid_by_name}</div>
                          <div style={muted}>
                            {row.supplier_paid_by_type === "club" ? "Club" : "Persona"}{" "}
                            {row.supplier_paid_by_club ? `· ${row.supplier_paid_by_club}` : ""}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 950 }}>
                          {row.orders_count} ordini
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </section>

            <section style={{ marginTop: 14 }}>
              <Card title="Ordini e pagamento fornitore" icon={<PackageCheck className="w-5 h-5" />}>
                <div style={{ display: "grid", gap: 10 }}>
                  {(data?.orders ?? []).map((order) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      onOpen={() => openSupplierModal(order)}
                    />
                  ))}

                  {(data?.orders ?? []).length === 0 ? (
                    <div style={emptyRow}>Nessun ordine trovato.</div>
                  ) : null}
                </div>
              </Card>
            </section>
          </>
        )}
      </div>

      {modalOrder ? (
        <div style={modalOverlay} onClick={() => setModalOrder(null)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <button style={closeButton} onClick={() => setModalOrder(null)}>
              <X className="w-5 h-5" />
            </button>

            <h2 style={{ fontSize: 22, fontWeight: 950 }}>Pagamento fornitore</h2>
            <p style={muted}>Ordine del {formatDate(modalOrder.created_at)} · {modalOrder.pickup_club}</p>

            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <Field label="Tipo pagante">
                <select
                  value={supplierForm.supplier_paid_by_type}
                  onChange={(e) =>
                    setSupplierForm({
                      ...supplierForm,
                      supplier_paid_by_type: e.target.value as "club" | "person",
                    })
                  }
                  style={inputStyle}
                >
                  <option value="club" style={optionStyle}>Club</option>
                  <option value="person" style={optionStyle}>Persona</option>
                </select>
              </Field>

              <Field label="Nome pagante">
                <input
                  value={supplierForm.supplier_paid_by_name}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, supplier_paid_by_name: e.target.value })
                  }
                  placeholder="Es. MOVI Centallo / Massimiliano"
                  style={inputStyle}
                />
              </Field>

              <Field label="Club collegato">
                <select
                  value={supplierForm.supplier_paid_by_club}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, supplier_paid_by_club: e.target.value })
                  }
                  style={inputStyle}
                >
                  <option value="" style={optionStyle}>Nessun club</option>
                  {CLUBS.filter((c) => c !== "ALL").map((c) => (
                    <option key={c} value={c} style={optionStyle}>{c}</option>
                  ))}
                </select>
              </Field>

              <Field label="Note">
                <textarea
                  value={supplierForm.supplier_payment_notes}
                  onChange={(e) =>
                    setSupplierForm({
                      ...supplierForm,
                      supplier_payment_notes: e.target.value,
                    })
                  }
                  style={{ ...inputStyle, minHeight: 82, resize: "vertical" }}
                  placeholder="Metodo, riferimento pagamento, note interne..."
                />
              </Field>

              <button
                type="button"
                disabled={saving}
                style={primaryButton}
                onClick={() => saveSupplierPayment(modalOrder, true)}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Segna fornitore pagato
              </button>

              {modalOrder.supplier_paid ? (
                <button
                  type="button"
                  disabled={saving}
                  style={dangerButton}
                  onClick={() => saveSupplierPayment(modalOrder, false)}
                >
                  Annulla pagamento fornitore
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderRow({ order, onOpen }: { order: StoreOrder; onOpen: () => void }) {
  const total = Number(order.residual_euro ?? order.total_euro ?? 0);

  return (
    <div style={orderRowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 950 }}>{formatDate(order.created_at)}</span>
          <Badge>{order.pickup_club ?? "-"}</Badge>
          <Badge>{order.payment_mode ?? "-"}</Badge>
          <Badge tone={order.supplier_paid ? "green" : "red"}>
            {order.supplier_paid ? "Fornitore pagato" : "Fornitore da pagare"}
          </Badge>
        </div>

        <div style={{ ...muted, marginTop: 8 }}>
          Cliente: {order.is_paid ? "pagato" : "da incassare"} · Totale €{total.toFixed(2)} ·{" "}
          {Number(order.points_used ?? 0)} pt usati
        </div>

        <div style={{ ...muted, marginTop: 6 }}>
          {(order.store_order_items ?? [])
            .map((item) => `${item.product_name} x${item.quantity}`)
            .join(" · ")}
        </div>

        {order.supplier_paid ? (
          <div style={{ ...muted, marginTop: 6, color: "#86efac" }}>
            Pagato da {order.supplier_paid_by_name ?? "-"}{" "}
            {order.supplier_paid_by_club ? `· ${order.supplier_paid_by_club}` : ""} ·{" "}
            {formatDateTime(order.supplier_paid_at)}
          </div>
        ) : null}
      </div>

      <button type="button" onClick={onOpen} style={smallButton}>
        {order.supplier_paid ? "Modifica" : "Segna pagato"}
      </button>
    </div>
  );
}

function Kpi({ icon, label, value, tone = "#ffffff" }: any) {
  return (
    <div style={cardStyle}>
      <div style={{ color: tone }}>{icon}</div>
      <div style={{ marginTop: 12, fontSize: 24, fontWeight: 950 }}>{value}</div>
      <div style={muted}>{label}</div>
    </div>
  );
}

function Card({ title, icon, children }: any) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ color: "#fbbf24" }}>{icon}</span>
        <h2 style={{ fontSize: 18, fontWeight: 950 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <label style={{ display: "grid", gap: 7 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Badge({ children, tone }: any) {
  const isGreen = tone === "green";
  const isRed = tone === "red";

  return (
    <span
      style={{
        borderRadius: 999,
        padding: "5px 9px",
        fontSize: 12,
        fontWeight: 900,
        background: isGreen
          ? "rgba(34,197,94,0.14)"
          : isRed
            ? "rgba(248,113,113,0.14)"
            : "rgba(255,255,255,0.07)",
        color: isGreen ? "#86efac" : isRed ? "#fca5a5" : "rgba(255,255,255,0.76)",
        border: isGreen
          ? "1px solid rgba(34,197,94,0.22)"
          : isRed
            ? "1px solid rgba(248,113,113,0.22)"
            : "1px solid rgba(255,255,255,0.09)",
      }}
    >
      {children}
    </span>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("it-IT");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("it-IT");
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

const filtersCard: React.CSSProperties = {
  ...cardStyle,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
  marginBottom: 14,
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 13,
  borderRadius: 18,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const orderRowStyle: React.CSSProperties = {
  ...rowStyle,
  alignItems: "flex-start",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.055)",
  color: "white",
  padding: "11px 13px",
  outline: "none",
  fontWeight: 750,
};

const optionStyle: React.CSSProperties = {
  color: "#0f172a",
  background: "#ffffff",
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.72)",
  fontSize: 12,
  fontWeight: 900,
  paddingLeft: 4,
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 650,
};

const emptyRow: React.CSSProperties = {
  padding: 13,
  borderRadius: 18,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 700,
};

const smallButton: React.CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: "9px 12px",
  background: "rgba(251,191,36,0.16)",
  color: "#fbbf24",
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const primaryButton: React.CSSProperties = {
  width: "100%",
  minHeight: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  border: 0,
  borderRadius: 18,
  background: "linear-gradient(135deg, #fbbf24, #f97316)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const dangerButton: React.CSSProperties = {
  ...primaryButton,
  background: "rgba(248,113,113,0.14)",
  color: "#fca5a5",
  border: "1px solid rgba(248,113,113,0.22)",
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
  maxWidth: 560,
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
};