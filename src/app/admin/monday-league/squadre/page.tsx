"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import LeagueAdminNav from "../_components/LeagueAdminNav";

type User = { id: string; full_name: string; phone: string; email: string | null };
type Player = { id?: string; display_name: string; user_id: string | null; is_active?: boolean };
type Team = { id: string; season_id: string; name: string; is_active: boolean; captain: Player | null; players: Player[]; seed_position: number | null };

export default function LeagueTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [phaseStatus, setPhaseStatus] = useState("draft");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Team | null | undefined>(undefined);

  async function load() {
    setLoading(true);
    const overview = await fetch("/api/admin/monday-league/overview", { cache: "no-store" }).then((response) => response.json());
    const id = overview.data?.season?.id ?? null;
    setSeasonId(id); setPhaseStatus(overview.data?.phase?.status ?? "draft");
    if (id) {
      const response = await fetch(`/api/admin/monday-league/teams?season_id=${id}`, { cache: "no-store" });
      const json = await response.json();
      if (response.ok) setTeams(json.data ?? []); else toast.error(json.error);
    }
    setLoading(false);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function toggle(team: Team) {
    const response = await fetch(`/api/admin/monday-league/teams/${team.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !team.is_active, reason: "Aggiornamento da pannello admin" }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) toast.error(json.error || "Errore"); else { toast.success("Stato squadra aggiornato"); await load(); }
  }
  async function remove(team: Team) {
    const confirmation = window.prompt(`Eliminazione consentita solo senza storico. Digita esattamente: ${team.name}`);
    if (confirmation !== team.name) return;
    const response = await fetch(`/api/admin/monday-league/teams/${team.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) toast.error(json.error || "Eliminazione non riuscita"); else { toast.success("Squadra eliminata"); await load(); }
  }

  return <main style={{ display: "grid", gap: 18, color: "#0f172a" }}>
    <h1 style={{ margin: 0 }}>Squadre Monday League</h1><LeagueAdminNav />
    <div><button style={button} disabled={!seasonId || phaseStatus !== "draft"} onClick={() => setEditing(null)}><Plus size={17} />Nuova squadra</button></div>
    {phaseStatus !== "draft" && <div style={notice}>La rosa è bloccata per il capitano. L&apos;admin può ancora correggere squadra, capitano e rosa; per conservare lo storico usa Disattiva.</div>}
    {loading ? <Loader2 className="animate-spin" /> : !seasonId ? <div style={notice}>Crea prima una stagione dalla panoramica.</div> : <section style={{ display: "grid", gap: 10 }}>{teams.map((team) => <article key={team.id} style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div><strong style={{ fontSize: 18 }}>{team.name}</strong><div style={muted}>Capitano: {team.captain?.display_name ?? "—"} · {team.players.filter((player) => player.is_active).length} giocatori · Seed {team.seed_position ?? "—"} · {team.is_active ? "Attiva" : "Inattiva"}</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={smallButton} onClick={() => setEditing(team)}><Pencil size={15} />Modifica / override</button><button style={smallButton} onClick={() => toggle(team)}>{team.is_active ? "Disattiva" : "Riattiva"}</button><button style={smallButton} onClick={() => void remove(team)}><Trash2 size={15} />Elimina se senza storico</button></div>
      </div>
    </article>)}</section>}
    {editing !== undefined && seasonId && <TeamForm seasonId={seasonId} team={editing} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await load(); }} />}
  </main>;
}

function TeamForm({ seasonId, team, onClose, onSaved }: { seasonId: string; team: Team | null; onClose: () => void; onSaved: () => void }) {
  const active = team?.players.filter((player) => player.is_active) ?? [];
  const [name, setName] = useState(team?.name ?? "");
  const [roster, setRoster] = useState<Player[]>(active.length ? active : [{ display_name: "", user_id: null }]);
  const [captainUserId, setCaptainUserId] = useState(team?.captain?.user_id ?? "");
  const [saving, setSaving] = useState(false);
  function update(index: number, patch: Partial<Player>) { setRoster((current) => current.map((player, itemIndex) => itemIndex === index ? { ...player, ...patch } : player)); }
  async function save() {
    if (!name.trim() || !captainUserId || !roster.some((player) => player.user_id === captainUserId)) return toast.error("Nome e capitano sono obbligatori");
    setSaving(true);
    const payload = { season_id: seasonId, name, captain_user_id: captainUserId, roster: roster.map((player) => ({ player_id: player.id ?? null, display_name: player.display_name.trim(), user_id: player.user_id })) };
    const response = await fetch(team ? `/api/admin/monday-league/teams/${team.id}` : "/api/admin/monday-league/teams", { method: team ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) toast.error(json.error || "Errore salvataggio"); else { toast.success("Squadra salvata"); onSaved(); }
    setSaving(false);
  }
  return <div style={overlay}><section style={{ ...panel, width: "min(680px,94vw)", maxHeight: "90vh", overflow: "auto" }}>
    <div style={{ display: "flex", justifyContent: "space-between" }}><h2 style={{ marginTop: 0 }}>{team ? "Modifica squadra" : "Nuova squadra"}</h2><button style={iconButton} onClick={onClose}><X /></button></div>
    <label>Nome squadra<input style={input} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <h3>Rosa ({roster.length}/4)</h3>
    <div style={{ display: "grid", gap: 12 }}>{roster.map((player, index) => <div key={player.id ?? index} style={{ padding: 12, borderRadius: 14, background: "rgba(255,255,255,.04)" }}>
      <label>Nome visualizzato<input style={input} value={player.display_name} onChange={(event) => update(index, { display_name: event.target.value })} /></label>
      <UserPicker selectedId={player.user_id} onSelect={(user) => { update(index, { user_id: user?.id ?? null, display_name: user?.full_name || player.display_name }); if (!captainUserId && user) setCaptainUserId(user.id); }} />
      <label style={{ display: "flex", gap: 8, marginTop: 8 }}><input type="radio" name="captain" checked={!!player.user_id && player.user_id === captainUserId} disabled={!player.user_id} onChange={() => setCaptainUserId(player.user_id ?? "")} />Capitano</label>
      {roster.length > 1 && <button style={linkButton} onClick={() => setRoster((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Rimuovi dalla rosa</button>}
    </div>)}</div>
    {roster.length < 4 && <button style={smallButton} onClick={() => setRoster((current) => [...current, { display_name: "", user_id: null }])}><Plus size={15} />Aggiungi giocatore</button>}
    <div><button style={button} disabled={saving} onClick={save}>{saving ? "Salvataggio…" : "Salva squadra"}</button></div>
  </section></div>;
}

function UserPicker({ selectedId, onSelect }: { selectedId: string | null; onSelect: (user: User | null) => void }) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<User[]>([]);
  useEffect(() => { const timer = setTimeout(async () => { if (query.trim().length < 2) return setResults([]); const response = await fetch(`/api/admin/monday-league/users/search?q=${encodeURIComponent(query)}`); const json = await response.json(); if (response.ok) setResults(json.data ?? []); }, 250); return () => clearTimeout(timer); }, [query]);
  return <div style={{ marginTop: 8 }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Search size={16} /><input style={input} value={query} placeholder={selectedId ? "Utente collegato · cerca per cambiare" : "Cerca nome, telefono o email"} onChange={(event) => setQuery(event.target.value)} /></div>{results.length > 0 && <div style={{ display: "grid", gap: 4, marginTop: 5 }}>{results.map((user) => <button key={user.id} style={userResult} onClick={() => { onSelect(user); setQuery(user.full_name); setResults([]); }}>{user.full_name} · {user.phone} · {user.email}</button>)}</div>}{selectedId && <button style={linkButton} onClick={() => { onSelect(null); setQuery(""); }}>Scollega utente</button>}</div>;
}

const panel: React.CSSProperties = { padding: 18, borderRadius: 18, background: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.06)" };
const muted: React.CSSProperties = { color: "#64748b", marginTop: 5 };
const notice: React.CSSProperties = { ...panel, color: "#fde68a" };
const button: React.CSSProperties = { display: "inline-flex", gap: 8, alignItems: "center", padding: "11px 15px", border: 0, borderRadius: 12, background: "#14b8a6", color: "#042f2e", fontWeight: 900 };
const smallButton: React.CSSProperties = { display: "inline-flex", gap: 6, alignItems: "center", padding: "8px 11px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a" };
const linkButton: React.CSSProperties = { marginTop: 8, border: 0, background: "transparent", color: "#99f6e4", fontWeight: 700 };
const input: React.CSSProperties = { width: "100%", marginTop: 5, padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", background: "white", color: "#0f172a" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", background: "rgba(2,6,23,.82)", padding: 12 };
const iconButton: React.CSSProperties = { border: 0, background: "transparent", color: "#0f172a" };
const userResult: React.CSSProperties = { textAlign: "left", padding: 8, borderRadius: 8, border: "1px solid #99f6e4", background: "#f0fdfa", color: "#0f172a" };
