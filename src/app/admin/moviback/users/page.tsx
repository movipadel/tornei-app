"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Loader2,
  Search,
  ShieldAlert,
  UserCog,
  Users,
} from "lucide-react";

type Row = {
  id: string;
  user_id: string;
  status: string;
  membership_code: string;
  tax_code: string | null;
  membership_type: "ASC" | "FITP" | null;
  fee_points: number;
  fee_paid: boolean;
  has_existing_membership: boolean;
  existing_membership_type: string | null;
  existing_membership_number: string | null;
  approved_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string | null;
  points_balance: number;
  users: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    gender: "M" | "F" | null;
    created_at: string;
  };
};

export default function AdminMoviBackUsersPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  async function load(search = "") {
    try {
      setLoading(true);

      const url = search
        ? `/api/admin/moviback/users?q=${encodeURIComponent(search)}`
        : "/api/admin/moviback/users";

      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore caricamento utenti");

      setRows(json.data || []);
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      approved: rows.filter((r) => r.status === "approved").length,
      pending: rows.filter((r) => r.status === "pending_review").length,
      suspended: rows.filter((r) => r.status === "suspended").length,
      points: rows.reduce((sum, r) => sum + Number(r.points_balance || 0), 0),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
  const needle = q.trim().toLowerCase();

  if (!needle) return rows;

  return rows.filter((r) => {
    const text = [
      r.users?.full_name,
      r.users?.phone,
      r.users?.email,
      r.membership_code,
      r.tax_code,
      r.membership_type,
      r.status,
      r.existing_membership_type,
      r.existing_membership_number,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(needle);
  });
}, [rows, q]);


  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1180, margin: "0 auto", color: "white" }}>
        <Link href="/admin/moviback" style={backLink}>
          <ArrowLeft className="w-4 h-4" />
          Torna a MoviBack
        </Link>

        <header style={{ marginTop: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Users className="w-7 h-7" style={{ color: "#f59e0b" }} />
            <h1 style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.9 }}>
              Utenti MoviBack
            </h1>
          </div>

          <p style={muted}>
            Cerca, controlla stato membership, tessera e saldo punti.
          </p>
        </header>

        <section style={gridKpi}>
          <Kpi label="Totali" value={stats.total} />
          <Kpi label="Approved" value={stats.approved} tone="#86efac" />
          <Kpi label="Pending" value={stats.pending} tone="#fbbf24" />
          <Kpi label="Sospesi" value={stats.suspended} tone="#f87171" />
          <Kpi label="Punti totali" value={stats.points} tone="#93c5fd" />
        </section>

        <div style={searchBox}>
  <Search className="w-5 h-5" style={{ color: "rgba(255,255,255,0.45)" }} />
  <input
    value={q}
    onChange={(e) => setQ(e.target.value)}
    placeholder="Cerca per nome, telefono, codice tessera, codice fiscale..."
    style={searchInput}
  />

  {q.trim() ? (
    <button
      type="button"
      onClick={() => setQ("")}
      style={searchBtn}
    >
      Pulisci
    </button>
  ) : null}
</div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 50 }}>
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div style={emptyStyle}>Nessun utente trovato.</div>
        ) : (
          <div style={{ display: "grid", gap: 13 }}>
            {filteredRows.map((r) => (
              <div key={r.id} style={cardStyle}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) auto",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 950 }}>
                      {r.users?.full_name || "Utente"}
                    </div>

                    <div style={muted}>
                      {r.users?.phone || "—"}
                      {r.users?.email ? ` · ${r.users.email}` : ""}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      <Pill>{r.status}</Pill>
                      <Pill>{r.membership_type || "—"}</Pill>
                      <Pill>{r.membership_code}</Pill>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 950, color: "#fbbf24" }}>
                      {r.points_balance}
                    </div>
                    <div style={muted}>punti</div>
                  </div>
                </div>

                <div style={infoGrid}>
                  <Info label="Codice fiscale" value={r.tax_code || "—"} />
                  <Info
                    label="Tessera"
                    value={
                      r.has_existing_membership
                        ? `Già presente ${r.existing_membership_type || r.membership_type || ""}${
                            r.existing_membership_number
                              ? ` · ${r.existing_membership_number}`
                              : ""
                          }`
                        : `Nuova ${r.membership_type || "—"}`
                    }
                  />
                  <Info
                    label="Quota"
                    value={
                      r.fee_points > 0
                        ? `${r.fee_points} pt · ${r.fee_paid ? "pagata" : "da pagare"}`
                        : "nessuna"
                    }
                  />
                  <Info
                    label="Registrato"
                    value={new Date(r.created_at).toLocaleDateString("it-IT")}
                  />
                </div>

                {r.status === "suspended" ? (
                  <div style={warningBox}>
                    <ShieldAlert className="w-4 h-4" />
                    {r.suspension_reason || "Utente sospeso"}
                  </div>
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <Link href={`/admin/moviback/users/${r.id}`} style={detailBtn}>
                    <UserCog className="w-4 h-4" />
                    Gestisci utente
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "#ffffff",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 24, fontWeight: 950, color: tone }}>{value}</div>
      <div style={muted}>{label}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={pillStyle}>{children}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoBox}>
      <div style={muted}>{label}</div>
      <div style={{ marginTop: 3, fontWeight: 850 }}>{value}</div>
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

const gridKpi: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginBottom: 14,
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 650,
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

const searchBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 16,
  borderRadius: 22,
  padding: 10,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const searchInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 42,
  border: 0,
  outline: "none",
  background: "transparent",
  color: "white",
  fontWeight: 750,
};

const searchBtn: React.CSSProperties = {
  height: 42,
  padding: "0 15px",
  borderRadius: 15,
  border: 0,
  background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const emptyStyle: React.CSSProperties = {
  borderRadius: 24,
  padding: 28,
  textAlign: "center",
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.58)",
  fontWeight: 750,
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: "rgba(255,255,255,0.72)",
  fontSize: 12,
  fontWeight: 850,
};

const infoGrid: React.CSSProperties = {
  marginTop: 13,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const infoBox: React.CSSProperties = {
  borderRadius: 17,
  padding: 11,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.07)",
};

const warningBox: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: 11,
  borderRadius: 16,
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(239,68,68,0.22)",
  color: "#fca5a5",
  fontSize: 13,
  fontWeight: 800,
};

const detailBtn: React.CSSProperties = {
  minHeight: 42,
  width: "100%",
  borderRadius: 15,
  background: "rgba(255,255,255,0.065)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "white",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  textDecoration: "none",
  fontWeight: 900,
};