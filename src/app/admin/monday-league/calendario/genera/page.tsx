"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import LeagueAdminNav from "../../_components/LeagueAdminNav";

type Team = { id: string; name: string; is_active: boolean };
type Phase = { id: string; status: string; generated_at?: string; generation_fingerprint?: string };
type Preview = {
  algorithmVersion: string; fingerprint: string; matchCount: number; hasByes: boolean;
  rounds: Array<{ roundNumber: number; byeTeamId: string | null; matches: Array<{ homeTeamId: string; awayTeamId: string }> }>;
  quality: { totalDoubleStreaks: number; totalTriplePlusStreaks: number; maxStreak: number; alternationPercentage: number; invariantViolations: string[]; teams: Array<{ teamId: string; homeCount: number; awayCount: number; difference: number; maxSameSideStreak: number; doubleStreakCount: number; triplePlusStreakCount: number; alternationPercentage: number }> };
};
type GeneratedSchedule = {
  run: { input_team_order: string[]; quality_metrics: Preview["quality"]; completed_at: string } | null;
  rounds: Array<{ id: string; round_number: number; status: string }>;
  matches: Array<{ id: string; round_id: string; home_team_id: string; away_team_id: string; match_status: string; venue_id: string | null; scheduled_at: string | null }>;
};

export default function GenerateCalendarPage() {
  const [phase, setPhase] = useState<Phase | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [generatedSchedule, setGeneratedSchedule] = useState<GeneratedSchedule | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false);

  async function load() {
    setLoading(true);
    const overview = await fetch("/api/admin/monday-league/overview", { cache: "no-store" }).then((response) => response.json());
    const season = overview.data?.season; const currentPhase = overview.data?.phase ?? null; setPhase(currentPhase);
    if (season) {
      const response = await fetch(`/api/admin/monday-league/teams?season_id=${season.id}`, { cache: "no-store" }); const json = await response.json();
      const active = (json.data ?? []).filter((team: Team) => team.is_active); setTeams(active); setNames(Object.fromEntries(active.map((team: Team) => [team.id, team.name])));
      if (currentPhase?.status === "generated") {
        const generated = await fetch(`/api/admin/monday-league/generator?phase_id=${currentPhase.id}`, { cache: "no-store" }).then((result) => result.json());
        if (generated.data) setGeneratedSchedule(generated.data);
        if (generated.data?.run?.input_team_order) setTeams(generated.data.run.input_team_order.map((id: string) => active.find((team: Team) => team.id === id)).filter(Boolean));
      }
    }
    setLoading(false);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  function move(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= teams.length) return; setTeams((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; }); setPreview(null); }
  async function runPreview() {
    if (!phase) return; setWorking(true);
    const response = await fetch("/api/admin/monday-league/generator/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase_id: phase.id, ordered_team_ids: teams.map((team) => team.id) }) });
    const json = await response.json().catch(() => ({})); if (!response.ok) toast.error(json.error || "Preview non disponibile"); else { setPreview(json.data); setNames(json.team_names); } setWorking(false);
  }
  async function generate() {
    if (!phase || !preview || !confirm("Generare definitivamente la Fase 1? Non sarà possibile rigenerarla in questo stage.")) return; setWorking(true);
    const response = await fetch("/api/admin/monday-league/generator/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase_id: phase.id, ordered_team_ids: teams.map((team) => team.id) }) });
    const json = await response.json().catch(() => ({})); if (!response.ok) toast.error(json.error || "Generazione fallita"); else { toast.success(json.replayed ? "Calendario già presente" : "Fase 1 generata"); setPreview(null); await load(); } setWorking(false);
  }

  if (loading) return <Loader2 className="animate-spin" />;
  return <main style={{ display: "grid", gap: 18, color: "#0f172a" }}><h1 style={{ margin: 0 }}>Genera calendario Fase 1</h1><LeagueAdminNav />
    {!phase ? <div style={panel}>Crea prima una stagione.</div> : phase.status === "generated" ? <GeneratedPanel phase={phase} schedule={generatedSchedule} names={names} /> : <>
      <section style={panel}><h2 style={{ marginTop: 0 }}>Ordine seed ({teams.length} squadre)</h2><p style={muted}>L’ordine è esplicito e determina il circle method. Il tie-break persistente viene assegnato separatamente.</p><div style={{ display: "grid", gap: 7 }}>{teams.map((team, index) => <div key={team.id} style={teamRow}><strong>{index + 1}. {team.name}</strong><span><button style={iconButton} onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={16} /></button><button style={iconButton} onClick={() => move(index, 1)} disabled={index === teams.length - 1}><ArrowDown size={16} /></button></span></div>)}</div><button style={button} disabled={working || teams.length < 2} onClick={runPreview}><Eye size={17} />{working ? "Calcolo…" : "Anteprima calendario"}</button></section>
      {preview && <PreviewPanel preview={preview} names={names} onGenerate={generate} working={working} />}
    </>}
  </main>;
}

function GeneratedPanel({ phase, schedule, names }: { phase: Phase; schedule: GeneratedSchedule | null; names: Record<string, string> }) {
  return <><section style={panel}><div style={{ display: "flex", gap: 10, alignItems: "center" }}><LockKeyhole color="#5eead4" /><strong>Calendario generato</strong></div><p style={muted}>Generato il {phase.generated_at ? new Date(phase.generated_at).toLocaleString("it-IT") : "—"}. La struttura è in sola lettura.</p><code style={{ wordBreak: "break-all" }}>{phase.generation_fingerprint}</code></section>
    <section style={panel}><h2 style={{ marginTop: 0 }}>Giornate generate</h2>{!schedule ? <p style={muted}>Caricamento struttura non riuscito.</p> : <div style={{ display: "grid", gap: 12 }}>{schedule.rounds.map((round) => <div key={round.id} style={{ padding: 12, background: "rgba(255,255,255,.04)", borderRadius: 12 }}><strong>Giornata {round.round_number}</strong><div style={muted}>Stato: {round.status}</div>{schedule.matches.filter((match) => match.round_id === round.id).map((match) => <div key={match.id} style={{ marginTop: 6 }}>{names[match.home_team_id] ?? match.home_team_id} <strong>—</strong> {names[match.away_team_id] ?? match.away_team_id} <span style={muted}>· {match.match_status} · non programmata</span></div>)}</div>)}</div>}</section></>;
}

function PreviewPanel({ preview, names, onGenerate, working }: { preview: Preview; names: Record<string, string>; onGenerate: () => void; working: boolean }) {
  return <><section style={panel}><h2 style={{ marginTop: 0 }}>Qualità generazione</h2><div style={metrics}><Metric label="Giornate" value={String(preview.rounds.length)} /><Metric label="Partite" value={String(preview.matchCount)} /><Metric label="Max striscia" value={String(preview.quality.maxStreak)} /><Metric label="Doppie" value={String(preview.quality.totalDoubleStreaks)} /><Metric label="Triple+" value={String(preview.quality.totalTriplePlusStreaks)} /><Metric label="Alternanza" value={`${preview.quality.alternationPercentage}%`} /></div><p style={muted}>BYE: {preview.hasByes ? "uno per squadra, non salvato come match" : "nessuno"} · Algoritmo: {preview.algorithmVersion}</p><code style={{ wordBreak: "break-all" }}>{preview.fingerprint}</code>
    <div style={{ overflowX: "auto", marginTop: 14 }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th>Squadra</th><th>Casa</th><th>Trasf.</th><th>Diff.</th><th>Max</th><th>Doppie</th><th>Triple+</th><th>Alt.</th></tr></thead><tbody>{preview.quality.teams.map((team) => <tr key={team.teamId}><td>{names[team.teamId]}</td><td>{team.homeCount}</td><td>{team.awayCount}</td><td>{team.difference}</td><td>{team.maxSameSideStreak}</td><td>{team.doubleStreakCount}</td><td>{team.triplePlusStreakCount}</td><td>{team.alternationPercentage}%</td></tr>)}</tbody></table></div>
    {preview.quality.invariantViolations.length > 0 && <div style={{ color: "#fca5a5" }}>{preview.quality.invariantViolations.join(", ")}</div>}
  </section><section style={panel}><h2 style={{ marginTop: 0 }}>Anteprima giornate</h2><div style={{ display: "grid", gap: 12 }}>{preview.rounds.map((round) => <div key={round.roundNumber} style={{ padding: 12, background: "rgba(255,255,255,.04)", borderRadius: 12 }}><strong>Giornata {round.roundNumber}</strong>{round.byeTeamId && <div style={muted}>Riposa: {names[round.byeTeamId]}</div>}{round.matches.map((match) => <div key={`${match.homeTeamId}-${match.awayTeamId}`} style={{ marginTop: 6 }}>{names[match.homeTeamId]} <strong>—</strong> {names[match.awayTeamId]}</div>)}</div>)}</div><button style={button} disabled={working || preview.quality.invariantViolations.length > 0} onClick={onGenerate}>{working ? "Generazione…" : "Genera Fase 1"}</button></section></>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div><div style={muted}>{label}</div><strong style={{ fontSize: 19 }}>{value}</strong></div>; }
const panel: React.CSSProperties = { padding: 18, borderRadius: 18, background: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.06)" };
const muted: React.CSSProperties = { color: "#64748b", lineHeight: 1.5 };
const button: React.CSSProperties = { marginTop: 14, display: "inline-flex", gap: 8, alignItems: "center", padding: "11px 15px", border: 0, borderRadius: 12, background: "#14b8a6", color: "#042f2e", fontWeight: 900 };
const iconButton: React.CSSProperties = { marginLeft: 5, padding: 7, borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a" };
const teamRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, borderRadius: 10, background: "#f8fafc" };
const metrics: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 12 };
