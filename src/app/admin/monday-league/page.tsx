"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Loader2, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import LeagueAdminNav from "./_components/LeagueAdminNav";

type Overview = {
  season: null | { id: string; name: string; status: string; max_teams: number };
  phase: null | { id: string; status: string; generated_at: string | null };
  teams: number;
  rounds: number;
  matches: number;
};

export default function MondayLeagueAdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Monday League 2026/27");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/monday-league/overview", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) toast.error(json.error || "Errore caricamento");
    else setData(json.data);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function createSeason() {
    setCreating(true);
    const response = await fetch("/api/admin/monday-league/seasons", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) toast.error(json.error || "Errore creazione stagione");
    else { toast.success("Stagione e Fase 1 create"); await load(); }
    setCreating(false);
  }

  return <main style={{ display: "grid", gap: 18, color: "white" }}>
    <section style={{ padding: 24, borderRadius: 24, background: "linear-gradient(135deg,rgba(20,184,166,.22),rgba(15,23,42,.92))", border: "1px solid rgba(94,234,212,.2)" }}>
      <CalendarDays size={30} /><h1 style={{ margin: "12px 0 6px", fontSize: 28, fontWeight: 900 }}>Monday League</h1>
      <p style={{ margin: 0, color: "rgba(255,255,255,.7)" }}>Squadre e generazione deterministica della Fase 1.</p>
    </section>
    <LeagueAdminNav />
    {loading ? <Loader2 className="animate-spin" /> : !data?.season ? <section style={panel}>
      <h2 style={{ margin: 0 }}>Crea la prima stagione</h2><p style={muted}>La migration non crea dati di campionato. Questa azione admin crea una stagione bozza e la relativa Fase 1.</p>
      <input value={name} onChange={(event) => setName(event.target.value)} style={input} />
      <button onClick={createSeason} disabled={creating || !name.trim()} style={button}><Plus size={17} />{creating ? "Creazione…" : "Crea stagione"}</button>
    </section> : <>
      <section style={{ ...panel, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Metric label="Stagione" value={data.season.name} /><Metric label="Squadre" value={`${data.teams} / ${data.season.max_teams}`} /><Metric label="Fase 1" value={data.phase?.status ?? "—"} /><Metric label="Giornate" value={String(data.rounds)} /><Metric label="Partite" value={String(data.matches)} />
      </section>
      <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><ShieldCheck color="#5eead4" /><strong>Stato modulo</strong></div><p style={muted}>{data.phase?.status === "generated" ? "Calendario generato e bloccato. La schedulazione arriverà nello Stage 3." : "Configura le squadre, ordina i seed e genera il calendario una sola volta."}</p></section>
    </>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 16, borderRadius: 16, background: "rgba(255,255,255,.05)" }}><div style={muted}>{label}</div><div style={{ fontSize: 20, fontWeight: 900, marginTop: 5 }}>{value}</div></div>;
}
const panel: React.CSSProperties = { padding: 20, borderRadius: 20, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.09)" };
const muted: React.CSSProperties = { color: "rgba(255,255,255,.62)", lineHeight: 1.5 };
const input: React.CSSProperties = { width: "100%", padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,.15)", background: "rgba(15,23,42,.8)", color: "white" };
const button: React.CSSProperties = { marginTop: 12, display: "inline-flex", gap: 8, alignItems: "center", padding: "11px 15px", border: 0, borderRadius: 12, background: "#14b8a6", color: "#042f2e", fontWeight: 900, cursor: "pointer" };
