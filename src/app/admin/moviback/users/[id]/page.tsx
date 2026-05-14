"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgePercent,
  Ban,
  CheckCircle2,
  Gift,
  Loader2,
  Save,
  Wallet,
} from "lucide-react";

type Detail = {
  membership: any;
  points_balance: number;
  transactions: any[];
  certificate: any | null;
  redemptions: any[];
  promos: any[];
  active_promo: any | null;
};

export default function AdminMoviBackUserDetailPage() {
  const params = useParams();
  const id = String(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState<Detail | null>(null);
  const [form, setForm] = useState<any>({});

  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");

  const [promoMultiplier, setPromoMultiplier] = useState<string>("");
  const [promoDays, setPromoDays] = useState<string>("");
  const [promoNotes, setPromoNotes] = useState("");

  async function load() {
    try {
      setLoading(true);

      const res = await fetch(`/api/admin/moviback/users/${id}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore caricamento utente");

      setData(json.data);

      const m = json.data.membership;
      setForm({
        full_name: m.users?.full_name || "",
        phone: m.users?.phone || "",
        email: m.users?.email || "",
        gender: m.users?.gender || "",
        status: m.status || "pending_review",
        tax_code: m.tax_code || "",
        membership_type: m.membership_type || "ASC",
        fee_points: String(m.fee_points || 0),
        fee_paid: Boolean(m.fee_paid),
        has_existing_membership: Boolean(m.has_existing_membership),
        existing_membership_type: m.existing_membership_type || "",
        existing_membership_number: m.existing_membership_number || "",
      });
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

      const res = await fetch(`/api/admin/moviback/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          fee_points: Number(form.fee_points || 0),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore salvataggio");

      toast.success("Utente aggiornato");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

      const res = await fetch(`/api/admin/moviback/users/${id}/adjust-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points_delta: Number(adjustPoints),
          notes: adjustNotes,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore modifica punti");

      toast.success("Punti aggiornati");
      setAdjustPoints("");
      setAdjustNotes("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function submitPromo(e: React.FormEvent) {
  e.preventDefault();

  if (!promoMultiplier || Number(promoMultiplier) <= 1) {
    toast.error("Inserisci un moltiplicatore maggiore di 1");
    return;
  }

  if (!promoDays || Number(promoDays) <= 0) {
    toast.error("Inserisci una durata valida");
    return;
  }

  try {
    setSaving(true);

      const res = await fetch(`/api/admin/moviback/users/${id}/promo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          multiplier: Number(promoMultiplier),
          days: Number(promoDays),
          notes: promoNotes,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore promo");

      toast.success("Promo applicata");
setPromoMultiplier("");
setPromoDays("");
setPromoNotes("");
await load();
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function disablePromo() {
    try {
      setSaving(true);

      const res = await fetch(`/api/admin/moviback/users/${id}/promo`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore disattivazione promo");

      toast.success("Promo disattivata");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ color: "white", textAlign: "center", padding: 60 }}>
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const m = data.membership;

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1180, margin: "0 auto", color: "white" }}>
        <Link href="/admin/moviback/users" style={backLink}>
          <ArrowLeft className="w-4 h-4" />
          Torna agli utenti
        </Link>

        <header style={{ marginTop: 16, marginBottom: 18 }}>
          <h1 style={{ fontSize: 30, fontWeight: 950 }}>
            {m.users?.full_name || "Utente MoviBack"}
          </h1>
          <div style={muted}>
            {m.membership_code} · {m.status}
          </div>
        </header>

        <section style={grid}>
          <div style={cardStyle}>
            <Wallet className="w-6 h-6" style={{ color: "#fbbf24" }} />
            <div style={{ marginTop: 10, fontSize: 32, fontWeight: 950 }}>
              {data.points_balance}
            </div>
            <div style={muted}>Saldo punti</div>
          </div>

          <div style={cardStyle}>
            <CheckCircle2 className="w-6 h-6" style={{ color: "#86efac" }} />
            <div style={{ marginTop: 10, fontSize: 22, fontWeight: 950 }}>
              {m.membership_type || "—"}
            </div>
            <div style={muted}>Tipo tessera</div>
          </div>

          <div style={cardStyle}>
            <BadgePercent className="w-6 h-6" style={{ color: "#93c5fd" }} />
            <div style={{ marginTop: 10, fontSize: 22, fontWeight: 950 }}>
              {data.active_promo ? `x${data.active_promo.multiplier}` : "—"}
            </div>
            <div style={muted}>Promo attiva</div>
          </div>
        </section>

        <form onSubmit={saveUser} style={{ ...cardStyle, marginTop: 14 }}>
          <h2 style={titleStyle}>Dati utente e membership</h2>

          <div style={formGrid}>
            <Field label="Nome completo">
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                style={inputStyle}
              />
            </Field>

            <Field label="Telefono">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                style={inputStyle}
              />
            </Field>

            <Field label="Email">
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                style={inputStyle}
              />
            </Field>

            <Field label="Genere">
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                style={inputStyle}
              >
                <option style={optionStyle} value="">—</option>
                <option style={optionStyle} value="M">M</option>
                <option style={optionStyle} value="F">F</option>
              </select>
            </Field>

            <Field label="Stato">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                style={inputStyle}
              >
                <option style={optionStyle} value="pending_review">pending_review</option>
                <option style={optionStyle} value="approved">approved</option>
                <option style={optionStyle} value="rejected">rejected</option>
                <option style={optionStyle} value="suspended">suspended</option>
              </select>
            </Field>

            <Field label="Tipo tessera">
              <select
                value={form.membership_type}
                onChange={(e) =>
                  setForm({ ...form, membership_type: e.target.value })
                }
                style={inputStyle}
              >
                <option style={optionStyle} value="ASC">ASC</option>
                <option style={optionStyle} value="FITP">FITP</option>
              </select>
            </Field>

            <Field label="Codice fiscale">
              <input
                value={form.tax_code}
                onChange={(e) =>
                  setForm({ ...form, tax_code: e.target.value.toUpperCase() })
                }
                style={inputStyle}
              />
            </Field>

            <Field label="Tipo attivazione">
  <div
    style={{
      minHeight: 46,
      display: "flex",
      alignItems: "center",
      padding: "0 14px",
      borderRadius: 999,
      fontWeight: 900,
      fontSize: 13,
      background: form.has_existing_membership
        ? "rgba(34,197,94,0.14)"
        : "rgba(245,158,11,0.14)",
      color: form.has_existing_membership
        ? "#4ade80"
        : "#fbbf24",
      border: form.has_existing_membership
        ? "1px solid rgba(34,197,94,0.35)"
        : "1px solid rgba(245,158,11,0.35)",
    }}
  >
    {form.has_existing_membership
      ? "Tessera già posseduta"
      : "Nuova tessera"}
  </div>
</Field>
          </div>


          {form.has_existing_membership ? (
            <div style={formGrid}>
              <Field label="Tipo tessera già posseduta">
                <select
                  value={form.existing_membership_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      existing_membership_type: e.target.value,
                    })
                  }
                  style={inputStyle}
                >
                  <option style={optionStyle} value="">—</option>
                  <option style={optionStyle} value="ASC">ASC</option>
                  <option style={optionStyle} value="FITP">FITP</option>
                </select>
              </Field>

              <Field label="Numero tessera FITP">
                <input
                  value={form.existing_membership_number}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      existing_membership_number: e.target.value.toUpperCase(),
                    })
                  }
                  style={inputStyle}
                />
              </Field>
            </div>
          ) : null}

          <button type="submit" disabled={saving} style={primaryBtn}>
            <Save className="w-4 h-4" />
            Salva modifiche
          </button>
        </form>

        <section style={grid2}>
          <form onSubmit={submitAdjustment} style={cardStyle}>
            <h2 style={titleStyle}>Aggiustamento punti</h2>

            <input
              type="number"
              value={adjustPoints}
              onChange={(e) => setAdjustPoints(e.target.value)}
              placeholder="+50 oppure -20"
              style={inputStyle}
            />

            <textarea
              value={adjustNotes}
              onChange={(e) => setAdjustNotes(e.target.value)}
              placeholder="Nota obbligatoria"
              style={{ ...inputStyle, minHeight: 90, paddingTop: 12 }}
            />

            <button type="submit" disabled={saving} style={primaryBtn}>
              Aggiorna punti
            </button>
          </form>

          <form onSubmit={submitPromo} style={cardStyle}>
            <h2 style={titleStyle}>Promo individuale</h2>

            {data.active_promo ? (
              <div style={promoBox}>
                Promo attiva x{data.active_promo.multiplier} fino al{" "}
                {new Date(data.active_promo.ends_at).toLocaleDateString("it-IT")}
                <button
                  type="button"
                  onClick={disablePromo}
                  disabled={saving}
                  style={dangerSmallBtn}
                >
                  <Ban className="w-4 h-4" />
                  Disattiva
                </button>
              </div>
            ) : null}

            <input
              type="number"
              step="0.1"
              value={promoMultiplier}
              onChange={(e) => setPromoMultiplier(e.target.value)}
              placeholder="Moltiplicatore punti es. 2"
              style={inputStyle}
            />

            <input
              type="number"
              value={promoDays}
              onChange={(e) => setPromoDays(e.target.value)}
              placeholder="Durata promo in giorni es. 7"
              style={inputStyle}
            />

            <textarea
              value={promoNotes}
              onChange={(e) => setPromoNotes(e.target.value)}
              placeholder="Nota interna es. promo compleanno"
              style={{ ...inputStyle, minHeight: 90, paddingTop: 12 }}
            />

            <button type="submit" disabled={saving} style={primaryBtn}>
              Applica promo
            </button>
          </form>
        </section>

        <section style={grid2}>
          <div style={cardStyle}>
            <h2 style={titleStyle}>Certificato</h2>
            {data.certificate ? (
              <>
                <Info label="Stato" value={data.certificate.status} />
                <Info
                  label="Scadenza"
                  value={
                    data.certificate.expiry_date
                      ? new Date(data.certificate.expiry_date).toLocaleDateString("it-IT")
                      : "—"
                  }
                />
              </>
            ) : (
              <div style={muted}>Nessun certificato.</div>
            )}
          </div>

          <div style={cardStyle}>
            <h2 style={titleStyle}>Riscatti premio</h2>
            {data.redemptions.length === 0 ? (
              <div style={muted}>Nessun riscatto.</div>
            ) : (
              <div style={{ display: "grid", gap: 9 }}>
                {data.redemptions.map((r) => (
                  <div key={r.id} style={rowBox}>
                    <Gift className="w-4 h-4" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 850 }}>
                        {r.reward?.name || "Premio"}
                      </div>
                      <div style={muted}>
                        {r.status} · {r.points_cost} pt
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section style={{ ...cardStyle, marginTop: 14 }}>
          <h2 style={titleStyle}>Storico transazioni</h2>

          {data.transactions.length === 0 ? (
            <div style={muted}>Nessuna transazione.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {data.transactions.map((tx) => (
                <div key={tx.id} style={txRow}>
                  <div>
                    <div style={{ fontWeight: 850 }}>
                      {tx.source} · {tx.type}
                    </div>
                    <div style={muted}>
                      {new Date(tx.created_at).toLocaleString("it-IT")}
                      {tx.club ? ` · ${tx.club}` : ""}
                    </div>
                    {tx.notes ? <div style={muted}>{tx.notes}</div> : null}
                  </div>

                  <div
                    style={{
                      fontWeight: 950,
                      color: Number(tx.points_delta) >= 0 ? "#86efac" : "#fca5a5",
                    }}
                  >
                    {Number(tx.points_delta) >= 0 ? "+" : ""}
                    {tx.points_delta} pt
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <div style={labelStyle}>{label}</div>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowBox}>
      <span style={muted}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
  padding: "24px 16px 44px",
};

const cardStyle: React.CSSProperties = {
  borderRadius: 26,
  padding: 18,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const grid2: React.CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 12,
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 650,
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.68)",
  fontSize: 13,
  fontWeight: 800,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  padding: "0 13px",
  outline: "none",
  fontWeight: 750,
};

const optionStyle: React.CSSProperties = {
  color: "#0f172a",
  background: "#ffffff",
};

const primaryBtn: React.CSSProperties = {
  marginTop: 14,
  minHeight: 46,
  width: "100%",
  borderRadius: 16,
  border: 0,
  background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
  color: "#111827",
  fontWeight: 950,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
};

const dangerSmallBtn: React.CSSProperties = {
  marginTop: 10,
  minHeight: 36,
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(239,68,68,0.24)",
  background: "rgba(239,68,68,0.12)",
  color: "#fca5a5",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const backLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "rgba(255,255,255,0.68)",
  textDecoration: "none",
  fontWeight: 800,
  fontSize: 13,
};

const checkRow: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  alignItems: "center",
  gap: 9,
  color: "rgba(255,255,255,0.78)",
  fontWeight: 800,
};

const promoBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 16,
  marginBottom: 12,
  background: "rgba(34,197,94,0.12)",
  border: "1px solid rgba(34,197,94,0.22)",
  color: "#bbf7d0",
  fontSize: 13,
  fontWeight: 800,
};

const rowBox: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  padding: 11,
  borderRadius: 16,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.07)",
};

const txRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 12,
  borderRadius: 16,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.07)",
};