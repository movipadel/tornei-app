"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BadgeEuro,
  Bell,
  Gift,
  Loader2,
  QrCode,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
} from "lucide-react";

type DashboardData = {
  kpi: {
    total_memberships: number;
    pending_requests: number;
    approved_memberships: number;
    total_points_balance: number;
    month_earned_points: number;
    month_euro_amount: number;
    active_rewards: number;
    hidden_rewards: number;
  };
  clubs: {
    club: string;
    points: number;
    euro: number;
    count: number;
  }[];
  latest_transactions: any[];
  alerts: {
    expiring_certificates: number;
    expired_certificates: number;
  };
};

export default function AdminMoviBackPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  async function load() {
    try {
      setLoading(true);

      const res = await fetch("/api/admin/moviback/dashboard", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore caricamento dashboard");

      setData(json.data);
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1180, margin: "0 auto", color: "white" }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <QrCode className="w-7 h-7" style={{ color: "#f59e0b" }} />
            <h1 style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.9 }}>
              Centro controllo MoviBack
            </h1>
          </div>
          <p style={{ marginTop: 6, color: "rgba(255,255,255,0.58)", fontWeight: 650 }}>
            Membership, punti, sedi, premi e richieste utenti.
          </p>
        </header>

        {loading ? (
          <div style={{ textAlign: "center", padding: 50 }}>
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : !data ? null : (
          <>
            <section style={gridKpi}>
              <Kpi icon={<Users />} label="Utenti MoviBack" value={data.kpi.total_memberships} />
              <Kpi icon={<Bell />} label="Richieste pending" value={data.kpi.pending_requests} tone="#fbbf24" />
              <Kpi icon={<ShieldCheck />} label="Approved" value={data.kpi.approved_memberships} tone="#86efac" />
              <Kpi icon={<Sparkles />} label="Punti in circolazione" value={data.kpi.total_points_balance} tone="#93c5fd" />
              <Kpi icon={<BadgeEuro />} label="Punti mese" value={data.kpi.month_earned_points} tone="#fda4af" />
              <Kpi icon={<Store />} label="Euro mese" value={`${data.kpi.month_euro_amount.toFixed(2)} €`} tone="#c4b5fd" />
            </section>

            <section style={twoCol}>
              <Card title="Monitoraggio sedi" icon={<Store className="w-5 h-5" />}>
                <div style={{ display: "grid", gap: 10 }}>
                  {data.clubs.map((c) => (
                    <div key={c.club} style={clubRow}>
                      <div>
                        <div style={{ fontWeight: 950 }}>{c.club}</div>
                        <div style={muted}>{c.count} transazioni mese</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 950, color: "#fbbf24" }}>{c.points} pt</div>
                        <div style={muted}>{c.euro.toFixed(2)} €</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Azioni rapide" icon={<ArrowRight className="w-5 h-5" />}>
                <div style={{ display: "grid", gap: 10 }}>
                  <QuickLink
                    href="/admin/moviback/requests"
                    icon={<Bell />}
                    title="Richieste MoviBack"
                    text={`${data.kpi.pending_requests} richieste in attesa`}
                  />
                  <QuickLink
  href="/admin/moviback/users"
  icon={<Users />}
  title="Utenti MoviBack"
  text="Consulta utenti, tessere, stati e saldo punti"
/>
                  <QuickLink
                    href="/admin/moviback/catalog"
                    icon={<Gift />}
                    title="Catalogo premi"
                    text={`${data.kpi.active_rewards} attivi · ${data.kpi.hidden_rewards} nascosti`}
                  />
                  <QuickLink
  href="/admin/moviback/promos"
  icon={<Sparkles />}
  title="Promozioni collettive"
  text="Crea promo punti globali"
/>

<QuickLink
  href="/admin/comunicazioni?target=moviback"
  icon={<Bell />}
  title="Comunicazioni MoviBack"
  text="Invia notifiche agli utenti MoviBack"
/>
                </div>
              </Card>
            </section>

            <section style={twoCol}>
              <Card title="Ultime transazioni" icon={<BadgeEuro className="w-5 h-5" />}>
                <div style={{ display: "grid", gap: 10 }}>
                  {data.latest_transactions.length === 0 ? (
                    <div style={muted}>Nessuna transazione recente.</div>
                  ) : (
                    data.latest_transactions.slice(0, 8).map((tx) => (
                      <div key={tx.id} style={txRow}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900 }}>
                            {tx.loyalty_memberships?.users?.full_name || "Utente"}
                          </div>
                          <div style={muted}>
                            {tx.club || "Sede non indicata"} · {tx.type}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 950 }}>
                          {Number(tx.points_delta || 0) > 0 ? "+" : ""}
                          {tx.points_delta} pt
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card title="Alert" icon={<AlertTriangle className="w-5 h-5" />}>
                <div style={{ display: "grid", gap: 10 }}>
                  <AlertRow label="Certificati in scadenza entro 30 giorni" value={data.alerts.expiring_certificates} />
                  <AlertRow label="Certificati scaduti" value={data.alerts.expired_certificates} danger />
                  <AlertRow label="Richieste pending" value={data.kpi.pending_requests} />
                </div>
              </Card>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone = "#ffffff",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ color: tone }}>{icon}</div>
      <div style={{ marginTop: 12, fontSize: 25, fontWeight: 950 }}>{value}</div>
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

function QuickLink({ href, icon, title, text }: any) {
  return (
    <Link href={href} style={{ ...actionRow, textDecoration: "none" }}>
      <span style={{ color: "#fbbf24" }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "white", fontWeight: 950 }}>{title}</div>
        <div style={muted}>{text}</div>
      </div>
      <ArrowRight className="w-4 h-4" style={{ marginLeft: "auto", color: "rgba(255,255,255,0.55)" }} />
    </Link>
  );
}

function Placeholder({ icon, title, text }: any) {
  return (
    <div style={{ ...actionRow, opacity: 0.62 }}>
      <span>{icon}</span>
      <div>
        <div style={{ fontWeight: 950 }}>{title}</div>
        <div style={muted}>{text}</div>
      </div>
    </div>
  );
}

function AlertRow({ label, value, danger = false }: any) {
  return (
    <div style={clubRow}>
      <div style={{ fontWeight: 850 }}>{label}</div>
      <div style={{ fontWeight: 950, color: danger ? "#f87171" : "#fbbf24" }}>{value}</div>
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

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
  gap: 14,
  marginBottom: 14,
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 650,
};

const clubRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 18,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const txRow = clubRow;

const actionRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: 13,
  borderRadius: 18,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "white",
};