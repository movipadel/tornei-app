"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  Save,
  Truck,
  X,
} from "lucide-react";

import { toast } from "sonner";

function euro(value: unknown) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function percent(value: unknown) {
  if (value === null || value === undefined) return "-";
  return `${Number(value).toFixed(1)}%`;
}

const CLUBS = ["CENTALLO", "COSTIGLIOLE", "MANTA", "SALUZZO", "REVELLO"];

export default function StoreEconomicaPage() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [costForms, setCostForms] = useState<Record<string, any>>({});
  const [supplierSuggestions, setSupplierSuggestions] = useState<string[]>([]);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [supplierData, setSupplierData] = useState<any>(null);
const [supplierOpen, setSupplierOpen] = useState(false);
const [supplierFilter, setSupplierFilter] = useState<"" | "true" | "false">("false");
const [supplierModalOrder, setSupplierModalOrder] = useState<any>(null);
const [savingSupplier, setSavingSupplier] = useState(false);

const [supplierForm, setSupplierForm] = useState({
  supplier_paid_by_type: "club" as "club" | "person",
  supplier_paid_by_name: "",
  supplier_paid_by_club: "",
  supplier_payment_notes: "",
});

  async function loadData() {
    try {
      setLoading(true);

      const res = await fetch("/api/admin/store/economics", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore caricamento economica");
      }

      setData(json);

      const nextForms: Record<string, any> = {};
      for (const product of json.products || []) {
        nextForms[product.id] = {
          purchase_cost_euro: product.purchase_cost_euro || "",
          supplier_name: product.supplier_name || "",
          notes: product.cost_notes || "",
        };
      }

      const suppliers = Array.from(
        new Set(
          (json.products || [])
            .map((p: any) => String(p.supplier_name || "").trim())
            .filter(Boolean)
        )
      ) as string[];

      setCostForms(nextForms);
      setSupplierSuggestions(suppliers);
    } catch (e: any) {
      toast.error(e?.message || "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }

  async function loadSupplierData() {
  try {
    const params = new URLSearchParams();

    if (supplierFilter) {
      params.set("supplier_paid", supplierFilter);
    }

    const res = await fetch(`/api/admin/store-economics?${params.toString()}`, {
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json.error || "Errore caricamento pagamenti fornitore");
    }

    setSupplierData(json.data);
  } catch (e: any) {
    toast.error(e?.message || "Errore fornitore");
  }
}

  useEffect(() => {
  loadData();
  loadSupplierData();
}, []);

useEffect(() => {
  loadSupplierData();
}, [supplierFilter]);

  async function saveCost(productId: string) {
    try {
      setSavingId(productId);

      const form = costForms[productId] || {};

      const res = await fetch("/api/admin/store/economics/product-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          purchase_cost_euro: Number(form.purchase_cost_euro || 0),
          supplier_name: form.supplier_name || null,
          notes: form.notes || null,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore salvataggio costo");
      }

      toast.success("Costo acquisto salvato");
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Errore salvataggio");
    } finally {
      setSavingId(null);
    }
  }

  function openSupplierModal(order: any) {
  const defaultClub = String(order.pickup_club || "").toUpperCase();

  setSupplierModalOrder(order);

  setSupplierForm({
    supplier_paid_by_type: order.supplier_paid_by_type || "club",
    supplier_paid_by_name:
      order.supplier_paid_by_name || (defaultClub ? `MOVI ${defaultClub}` : ""),
    supplier_paid_by_club: order.supplier_paid_by_club || defaultClub || "",
    supplier_payment_notes: order.supplier_payment_notes || "",
  });
}

async function saveSupplierPayment(order: any, paid: boolean) {
  try {
    setSavingSupplier(true);

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

    if (!res.ok) {
      throw new Error(json.error || "Errore salvataggio pagamento fornitore");
    }

    toast.success(paid ? "Pagamento fornitore registrato" : "Pagamento fornitore annullato");

    setSupplierModalOrder(null);
    await Promise.all([loadSupplierData(), loadData()]);
  } catch (e: any) {
    toast.error(e?.message || "Errore fornitore");
  } finally {
    setSavingSupplier(false);
  }
}

  const products = useMemo(() => {
    const all = data?.products || [];
    if (!onlyMissing) return all;
    return all.filter((p: any) => p.cost_status === "missing");
  }, [data, onlyMissing]);

  const kpis = data?.kpis || {};

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <div>
            <Link href="/admin/store-orders" style={backLink}>
              <ArrowLeft className="w-4 h-4" />
              Torna a Ordini
            </Link>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
              <BarChart3 className="w-7 h-7" style={{ color: "#34d399" }} />
              <h1 style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.9 }}>
                Economica Store
              </h1>
            </div>

            <p style={muted}>
              Costi acquisto, incassi, utili e prodotti Store senza costo configurato.
            </p>
          </div>
        </header>

        {loading ? (
          <div style={cardStyle}>
            <Loader2 className="w-7 h-7 animate-spin" />
            <p style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", fontWeight: 800 }}>
              Caricamento dati economici...
            </p>
          </div>
        ) : (
          <>
            {kpis.products_missing_cost > 0 ? (
              <section style={alertStyle}>
                <AlertTriangle className="w-5 h-5" />
                <div>
                  <div style={{ fontWeight: 950 }}>
                    {kpis.products_missing_cost} prodotti senza costo acquisto
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 13, fontWeight: 700 }}>
                    I margini sono incompleti finché tutti i prodotti Store non hanno un costo.
                  </div>
                </div>
              </section>
            ) : (
              <section style={okStyle}>
                <CheckCircle2 className="w-5 h-5" />
                <div style={{ fontWeight: 950 }}>Tutti i prodotti hanno un costo acquisto.</div>
              </section>
            )}

            <section style={kpiGrid}>
              <Kpi label="Incassato cash" value={euro(kpis.total_cash_collected_euro)} />
              <Kpi label="Da incassare cash" value={euro(kpis.total_cash_receivable_euro)} tone="#fbbf24" />
              <Kpi label="Valore punti" value={euro(kpis.total_points_value_euro)} tone="#93c5fd" />
              <Kpi label="Costi acquisto" value={euro(kpis.total_purchase_cost_euro)} tone="#fca5a5" />
              <Kpi label="Utile economico" value={euro(kpis.total_profit_economic_euro)} tone="#86efac" />
              <Kpi label="Costi mancanti" value={kpis.products_missing_cost || 0} tone="#fbbf24" />
            </section>

            <section style={cardStyle}>
              <button
                type="button"
                onClick={() => setProductsOpen((v) => !v)}
                style={collapseHeader}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <Package className="w-5 h-5" style={{ color: "#fbbf24", flexShrink: 0 }} />
                  <div style={{ textAlign: "left", minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 950 }}>
                      Costi acquisto prodotti Store
                    </div>
                    <div style={muted}>
                      {kpis.products_missing_cost > 0
                        ? `${kpis.products_missing_cost} prodotti senza costo`
                        : "Tutti i costi configurati"}
                    </div>
                  </div>
                </div>

                {productsOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>

              {productsOpen ? (
                <>
                  <div style={{ ...sectionHead, marginTop: 16 }}>
                    <p style={muted}>
                      Ogni nuovo prodotto inserito nello Store appare qui automaticamente.
                    </p>

                    <button
                      type="button"
                      onClick={() => setOnlyMissing((v) => !v)}
                      style={onlyMissing ? activeButton : ghostButton}
                    >
                      {onlyMissing ? "Mostra tutti" : "Solo costi mancanti"}
                    </button>
                  </div>

                  <datalist id="supplier-suggestions">
                    {supplierSuggestions.map((supplier) => (
                      <option key={supplier} value={supplier} />
                    ))}
                  </datalist>

                  <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                    {products.length === 0 ? (
                      <div style={emptyRow}>Nessun prodotto da mostrare.</div>
                    ) : (
                      products.map((product: any) => {
                        const form = costForms[product.id] || {};
                        const missing = product.cost_status === "missing";

                        return (
                          <div
                            key={product.id}
                            style={productRow}
                            className="store-economica-product-row"
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <div style={{ fontWeight: 950, fontSize: 15 }}>
                                  {product.name}
                                </div>

                                {missing ? (
                                  <span style={missingBadge}>Costo mancante</span>
                                ) : (
                                  <span style={okBadge}>Costo inserito</span>
                                )}

                                {!product.is_active ? (
                                  <span style={inactiveBadge}>Inattivo</span>
                                ) : null}
                              </div>

                              <div style={muted}>
                                {product.category_name || "Senza categoria"} ·{" "}
                                {product.line_name || "Senza linea"}
                              </div>

                              <div style={{ ...muted, marginTop: 4 }}>
                                Vendita:{" "}
                                <b style={{ color: "white" }}>
                                  {euro(product.base_price_euro)}
                                </b>{" "}
                                · Margine:{" "}
                                <b
                                  style={{
                                    color:
                                      product.margin_euro !== null ? "#86efac" : "#fbbf24",
                                  }}
                                >
                                  {product.margin_euro === null
                                    ? "da calcolare"
                                    : euro(product.margin_euro)}
                                </b>{" "}
                                · {percent(product.margin_percent)}
                              </div>
                            </div>

                            <div style={formGrid} className="store-economica-form-grid">
                              <input
                                type="number"
                                placeholder="Costo acquisto €"
                                value={form.purchase_cost_euro}
                                onChange={(e) =>
                                  setCostForms((prev) => ({
                                    ...prev,
                                    [product.id]: {
                                      ...prev[product.id],
                                      purchase_cost_euro: e.target.value,
                                    },
                                  }))
                                }
                                style={inputStyle}
                              />

                              <input
                                list="supplier-suggestions"
                                placeholder="Fornitore"
                                value={form.supplier_name}
                                onChange={(e) =>
                                  setCostForms((prev) => ({
                                    ...prev,
                                    [product.id]: {
                                      ...prev[product.id],
                                      supplier_name: e.target.value,
                                    },
                                  }))
                                }
                                style={inputStyle}
                              />

                              <input
                                placeholder="Note"
                                value={form.notes}
                                onChange={(e) =>
                                  setCostForms((prev) => ({
                                    ...prev,
                                    [product.id]: {
                                      ...prev[product.id],
                                      notes: e.target.value,
                                    },
                                  }))
                                }
                                style={inputStyle}
                              />

                              <button
                                type="button"
                                onClick={() => saveCost(product.id)}
                                disabled={savingId === product.id}
                                style={saveButton}
                              >
                                {savingId === product.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Save className="w-4 h-4" />
                                )}
                                Salva
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : null}
            </section>

            <section style={cardStyle}>
  <button
    type="button"
    onClick={() => setSupplierOpen((v) => !v)}
    style={collapseHeader}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <Truck className="w-5 h-5" style={{ color: "#fbbf24", flexShrink: 0 }} />
      <div style={{ textAlign: "left", minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 950 }}>
          Pagamenti fornitore
        </div>
        <div style={muted}>
          {supplierData?.kpis?.supplier_unpaid_count ?? 0} ordini ancora da segnare come pagati
        </div>
      </div>
    </div>

    {supplierOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
  </button>

  {supplierOpen ? (
    <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
      <div style={sectionHead}>
        <p style={muted}>
          Gestisci chi ha pagato il fornitore per ogni singolo ordine.
        </p>

        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value as "" | "true" | "false")}
          style={{ ...inputStyle, width: "auto", minWidth: 220 }}
        >
          <option value="false" style={{ color: "#0f172a", background: "#fff" }}>
            Solo da pagare
          </option>
          <option value="true" style={{ color: "#0f172a", background: "#fff" }}>
            Solo pagati
          </option>
          <option value="" style={{ color: "#0f172a", background: "#fff" }}>
            Tutti
          </option>
        </select>
      </div>

      <section style={kpiGrid}>
        <Kpi
          label="Fornitore pagato"
          value={supplierData?.kpis?.supplier_paid_count ?? 0}
          tone="#86efac"
        />
        <Kpi
          label="Fornitore da pagare"
          value={supplierData?.kpis?.supplier_unpaid_count ?? 0}
          tone="#fca5a5"
        />
        <Kpi
          label="Ordini validi"
          value={supplierData?.kpis?.orders_count ?? 0}
        />
        <Kpi
          label="Incassato clienti"
          value={euro(supplierData?.kpis?.customer_collected_euro)}
          tone="#fbbf24"
        />
      </section>

      <div style={{ display: "grid", gap: 10 }}>
        {(supplierData?.orders || []).length === 0 ? (
          <div style={emptyRow}>Nessun ordine trovato.</div>
        ) : (
          (supplierData?.orders || []).map((order: any) => (
            <div key={order.id} style={supplierOrderRow} className="supplier-order-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <b>{new Date(order.created_at).toLocaleDateString("it-IT")}</b>
                  <span style={pillBadge}>{order.pickup_club || "-"}</span>
                  <span style={pillBadge}>{order.payment_mode || "-"}</span>
                  <span style={order.supplier_paid ? paidBadge : unpaidBadge}>
                    {order.supplier_paid ? "Fornitore pagato" : "Da pagare fornitore"}
                  </span>
                </div>

                <div style={{ ...muted, marginTop: 8 }}>
  Totale ordine: <b style={{ color: "white" }}>{euro(order.total_euro)}</b>{" "}
  · Punti: <b style={{ color: "white" }}>{Number(order.total_points || 0)}</b>{" "}
  · Cliente: {order.is_paid ? "pagato" : "da incassare"}
</div>

                <div style={{ ...muted, marginTop: 6 }}>
                  {(order.store_order_items || [])
                    .map((item: any) => `${item.product_name} x${item.quantity}`)
                    .join(" · ")}
                </div>

                {order.supplier_paid ? (
                  <div style={{ ...muted, marginTop: 6, color: "#86efac" }}>
                    Pagato da {order.supplier_paid_by_name || "-"}
                    {order.supplier_paid_by_club ? ` · ${order.supplier_paid_by_club}` : ""}
                    {order.supplier_paid_at
                      ? ` · ${new Date(order.supplier_paid_at).toLocaleString("it-IT")}`
                      : ""}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => openSupplierModal(order)}
                style={ghostButton}
              >
                {order.supplier_paid ? "Modifica" : "Segna pagato"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  ) : null}
</section>

            <section style={twoCol}>
              <Card title="Ordini Store">
                <Rows
                  rows={[
                    ["Incassato cash", euro(kpis.store_cash_collected_euro)],
                    ["Da incassare cash", euro(kpis.store_cash_receivable_euro)],
                    ["Punti usati", kpis.store_points_used || 0],
                    ["Valore punti", euro(kpis.store_points_value_euro)],
                    ["Costi stimati", euro(kpis.store_purchase_cost_euro)],
                    ["Utile cash", euro(kpis.store_profit_cash_euro)],
                    ["Utile economico", euro(kpis.store_profit_economic_euro)],
                  ]}
                />
              </Card>

              <Card title="Ordini speciali">
                <Rows
                  rows={[
                    ["Incassato", euro(kpis.special_collected_euro)],
                    ["Da incassare", euro(kpis.special_receivable_euro)],
                    ["Costi", euro(kpis.special_purchase_cost_euro)],
                    ["Utile", euro(kpis.special_profit_euro)],
                  ]}
                />
              </Card>
            </section>

            <section style={cardStyle}>
              <h2 style={sectionTitle}>Andamento mensile</h2>

              <div style={{ overflowX: "auto", marginTop: 14 }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <Th>Mese</Th>
                      <Th>Cash incassato</Th>
                      <Th>Cash aperto</Th>
                      <Th>Valore punti</Th>
                      <Th>Costi</Th>
                      <Th>Utile econ.</Th>
                      <Th>Ordini</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.monthly || []).map((row: any) => (
                      <tr key={row.month} style={trStyle}>
                        <Td>{row.month}</Td>
                        <Td>{euro(row.cash_collected_euro)}</Td>
                        <Td>{euro(row.cash_receivable_euro)}</Td>
                        <Td>{euro(row.points_value_euro)}</Td>
                        <Td>{euro(row.purchase_cost_euro)}</Td>
                        <Td>{euro(row.profit_economic_euro)}</Td>
                        <Td>{row.orders}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>

      {supplierModalOrder ? (
  <div style={modalOverlay} onClick={() => setSupplierModalOrder(null)}>
    <div style={modalCard} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setSupplierModalOrder(null)}
        style={closeButton}
      >
        <X className="w-5 h-5" />
      </button>

      <h2 style={{ fontSize: 22, fontWeight: 950, margin: 0 }}>
        Pagamento fornitore
      </h2>

      <p style={{ ...muted, marginTop: 6 }}>
        Ordine del{" "}
        {supplierModalOrder.created_at
          ? new Date(supplierModalOrder.created_at).toLocaleDateString("it-IT")
          : "-"}{" "}
        · {supplierModalOrder.pickup_club || "-"}
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label style={{ display: "grid", gap: 7 }}>
          <span style={fieldLabel}>Tipo pagante</span>
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
            <option value="club" style={{ color: "#0f172a", background: "#fff" }}>
              Club
            </option>
            <option value="person" style={{ color: "#0f172a", background: "#fff" }}>
              Persona
            </option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 7 }}>
          <span style={fieldLabel}>Nome pagante</span>
          <input
            value={supplierForm.supplier_paid_by_name}
            onChange={(e) =>
              setSupplierForm({
                ...supplierForm,
                supplier_paid_by_name: e.target.value,
              })
            }
            placeholder="Es. MOVI Centallo / Massimiliano"
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 7 }}>
          <span style={fieldLabel}>Club collegato</span>
          <select
            value={supplierForm.supplier_paid_by_club}
            onChange={(e) =>
              setSupplierForm({
                ...supplierForm,
                supplier_paid_by_club: e.target.value,
              })
            }
            style={inputStyle}
          >
            <option value="" style={{ color: "#0f172a", background: "#fff" }}>
              Nessun club
            </option>
            {CLUBS.map((club) => (
              <option key={club} value={club} style={{ color: "#0f172a", background: "#fff" }}>
                {club}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 7 }}>
          <span style={fieldLabel}>Note</span>
          <textarea
            value={supplierForm.supplier_payment_notes}
            onChange={(e) =>
              setSupplierForm({
                ...supplierForm,
                supplier_payment_notes: e.target.value,
              })
            }
            placeholder="Metodo pagamento, riferimento, note interne..."
            style={{ ...inputStyle, minHeight: 82, resize: "vertical" }}
          />
        </label>

        <button
          type="button"
          disabled={savingSupplier}
          onClick={() => saveSupplierPayment(supplierModalOrder, true)}
          style={supplierSaveButton}
        >
          {savingSupplier ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Segna fornitore pagato
        </button>

        {supplierModalOrder.supplier_paid ? (
          <button
            type="button"
            disabled={savingSupplier}
            onClick={() => saveSupplierPayment(supplierModalOrder, false)}
            style={supplierDangerButton}
          >
            Annulla pagamento fornitore
          </button>
        ) : null}
      </div>
    </div>
  </div>
) : null}

      <style jsx global>{`
        @media (max-width: 760px) {
          .store-economica-product-row {
            grid-template-columns: 1fr !important;
          }

          .supplier-order-row {
  flex-direction: column !important;
  align-items: stretch !important;
}

.supplier-order-row button {
  width: 100% !important;
}

          .store-economica-form-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

function Kpi({ label, value, tone = "white" }: any) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 24, fontWeight: 950, color: tone }}>{value}</div>
      <div style={muted}>{label}</div>
    </div>
  );
}

function Card({ title, children }: any) {
  return (
    <section style={cardStyle}>
      <h2 style={sectionTitle}>{title}</h2>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: any[][] }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={summaryRow}>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

function Th({ children }: any) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children }: any) {
  return <td style={tdStyle}>{children}</td>;
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(180deg,#030712 0%,#07111f 42%,#0f172a 100%)",
  padding: "24px 16px 44px",
  color: "white",
};

const shellStyle: React.CSSProperties = {
  maxWidth: 1220,
  margin: "0 auto",
};

const headerStyle: React.CSSProperties = {
  marginBottom: 18,
};

const backLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "rgba(255,255,255,0.68)",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 850,
};

const cardStyle: React.CSSProperties = {
  borderRadius: 26,
  padding: 18,
  background: "linear-gradient(135deg,rgba(255,255,255,.075),rgba(255,255,255,.035))",
  border: "1px solid rgba(255,255,255,.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,.20)",
  backdropFilter: "blur(14px)",
};

const collapseHeader: React.CSSProperties = {
  width: "100%",
  border: 0,
  background: "transparent",
  color: "white",
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  cursor: "pointer",
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 700,
};

const alertStyle: React.CSSProperties = {
  ...cardStyle,
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
  background: "linear-gradient(135deg,rgba(251,191,36,.16),rgba(255,255,255,.035))",
  border: "1px solid rgba(251,191,36,.22)",
  color: "#fde68a",
};

const okStyle: React.CSSProperties = {
  ...cardStyle,
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
  background: "linear-gradient(135deg,rgba(16,185,129,.14),rgba(255,255,255,.035))",
  border: "1px solid rgba(16,185,129,.22)",
  color: "#a7f3d0",
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
  gap: 12,
  marginBottom: 14,
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  margin: 0,
};

const ghostButton: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 999,
  padding: "9px 13px",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  fontWeight: 950,
  cursor: "pointer",
};

const activeButton: React.CSSProperties = {
  ...ghostButton,
  background: "rgba(251,191,36,0.16)",
  border: "1px solid rgba(251,191,36,0.28)",
  color: "#fbbf24",
};

const productRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) minmax(360px,.9fr)",
  gap: 14,
  alignItems: "start",
  padding: 14,
  borderRadius: 20,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.20)",
  color: "white",
  padding: "10px 12px",
  outline: "none",
  fontWeight: 800,
};

const saveButton: React.CSSProperties = {
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: 0,
  borderRadius: 16,
  background: "linear-gradient(135deg,#34d399,#10b981)",
  color: "#052e1f",
  fontWeight: 950,
  cursor: "pointer",
};

const missingBadge: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(251,191,36,0.15)",
  color: "#fbbf24",
  fontSize: 11,
  fontWeight: 950,
};

const okBadge: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(16,185,129,0.15)",
  color: "#86efac",
  fontSize: 11,
  fontWeight: 950,
};

const inactiveBadge: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(148,163,184,0.15)",
  color: "#cbd5e1",
  fontSize: 11,
  fontWeight: 950,
};

const emptyRow: React.CSSProperties = {
  padding: 14,
  borderRadius: 18,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 700,
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
  gap: 14,
  marginTop: 14,
  marginBottom: 14,
};

const summaryRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 12,
  borderRadius: 16,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 640,
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  color: "rgba(255,255,255,0.52)",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".12em",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontWeight: 800,
};

const trStyle: React.CSSProperties = {};

const supplierOrderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  padding: 14,
  borderRadius: 20,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const pillBadge: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: "rgba(255,255,255,0.76)",
  fontSize: 12,
  fontWeight: 900,
};

const paidBadge: React.CSSProperties = {
  ...pillBadge,
  background: "rgba(16,185,129,0.15)",
  border: "1px solid rgba(16,185,129,0.22)",
  color: "#86efac",
};

const unpaidBadge: React.CSSProperties = {
  ...pillBadge,
  background: "rgba(248,113,113,0.14)",
  border: "1px solid rgba(248,113,113,0.22)",
  color: "#fca5a5",
};

const fieldLabel: React.CSSProperties = {
  color: "rgba(255,255,255,0.72)",
  fontSize: 12,
  fontWeight: 900,
  paddingLeft: 4,
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

const supplierSaveButton: React.CSSProperties = {
  minHeight: 50,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  border: 0,
  borderRadius: 18,
  background: "linear-gradient(135deg,#34d399,#10b981)",
  color: "#052e1f",
  fontWeight: 950,
  cursor: "pointer",
};

const supplierDangerButton: React.CSSProperties = {
  minHeight: 50,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  borderRadius: 18,
  background: "rgba(248,113,113,0.14)",
  color: "#fca5a5",
  border: "1px solid rgba(248,113,113,0.22)",
  fontWeight: 950,
  cursor: "pointer",
};