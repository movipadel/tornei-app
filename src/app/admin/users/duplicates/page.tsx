"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, GitMerge, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Moviback = { id: string; status: string; membership_type: string | null; ledger_balance: number };
type League = { team_id: string; team_name: string; active: boolean; captain: boolean; phases: Array<{ code: string; name: string; status: string }> };
type Profile = {
  id: string; full_name: string; phone: string; email: string; normalized_email: string | null; normalized_phone: string | null;
  gender: string; created_at: string; updated_at: string; auth_linked: boolean; auth_state: string; identity_status: string;
  consents: Record<string, string | boolean | null>; reference_counts: Record<string, number>; moviback: Moviback[]; monday_league: League[];
};
type Member = { included: boolean; profile: Profile };
type Group = {
  id: string; signal_type: string; signal_value: string; confidence: string; state: string; is_stale: boolean; stale_reason: string | null;
  recommended_user_id: string | null; canonical_user_id: string | null; warning_flags: string[]; recommendation_reasons: string[];
  review_note: string | null; review_config: { source_user_id?: string; field_winners?: Record<string, string> }; members: Member[];
};
type Summary = Record<string, number | string>;
type Preview = {
  source_user_id: string; canonical_user_id: string; fingerprint: string; blockers: string[]; warnings: string[];
  domain_moves: Record<string, number>; pair_counts: Record<string, number>; consent_outcome: Record<string, unknown>;
  moviback: { applicable: boolean; safe: boolean; blockers?: string[]; expected_balance?: number; source_membership?: Record<string, unknown>; canonical_membership?: Record<string, unknown>; policy?: Record<string, string> };
  reversal: Record<string, string>;
};
type MergeResult = { verification?: { passed?: boolean; checks?: Record<string, boolean> }; domain_results?: Array<{ domain: string; status: string }> };

async function api(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "Operazione non riuscita");
  return json;
}

const filterOptions = [
  ["all", "Tutti"], ["pending_review", "Pending review"], ["high", "High confidence"], ["manual_only", "Manual only"],
  ["conflict", "Conflict"], ["approved", "Approved"], ["merged", "Merged"], ["rejected", "Rejected"],
];
const profileFields = ["full_name", "phone", "email", "gender"] as const;

export default function DuplicateUsersPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [canonical, setCanonical] = useState("");
  const [source, setSource] = useState("");
  const [included, setIncluded] = useState<string[]>([]);
  const [fieldWinners, setFieldWinners] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await api("/api/admin/users/duplicates");
      setGroups(json.data ?? []); setSummary(json.summary ?? null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const selected = useMemo(() => groups.find((group) => group.id === selectedId) ?? null, [groups, selectedId]);
  const visibleGroups = useMemo(() => groups.filter((group) => filter === "all" || (filter === "high" ? group.confidence === "high" : group.state === filter)), [groups, filter]);

  function choose(group: Group) {
    setSelectedId(group.id);
    const active = group.members.filter((member) => member.profile.identity_status === "active");
    const nextCanonical = group.canonical_user_id ?? group.recommended_user_id ?? active[0]?.profile.id ?? "";
    const nextIncluded = active.filter((member) => member.included).map((member) => member.profile.id);
    const nextSource = group.review_config?.source_user_id ?? active.find((member) => member.profile.id !== nextCanonical && member.included)?.profile.id ?? "";
    setCanonical(nextCanonical); setIncluded(nextIncluded); setSource(nextSource);
    setFieldWinners(group.review_config?.field_winners ?? Object.fromEntries(profileFields.map((field) => [field, nextCanonical])));
    setNote(group.review_note ?? ""); setPreview(null); setMergeResult(null); setConfirmation("");
  }

  async function scan() {
    setBusy(true);
    try { await api("/api/admin/users/duplicates", { action: "scan" }); await load(); toast.success("Scansione duplicati completata"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }

  async function review(state: string) {
    if (!selected) return;
    setBusy(true);
    try {
      await api("/api/admin/users/duplicates", { group_id: selected.id, state, canonical_user_id: canonical || null, source_user_id: source || null, included_user_ids: included, field_winners: fieldWinners, review_note: note });
      await load(); toast.success("Decisione revisionata e registrata"); setPreview(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }

  async function buildPreview() {
    if (!selected || !source || !canonical) return;
    setBusy(true);
    try {
      const json = await api("/api/admin/users/duplicates/preview", { group_id: selected.id, source_user_id: source, canonical_user_id: canonical });
      setPreview(json.data); setMergeResult(null); setConfirmation("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }

  async function execute() {
    if (!selected || !preview) return;
    setBusy(true);
    try {
      const json = await api("/api/admin/users/duplicates/execute", { group_id: selected.id, source_user_id: source, canonical_user_id: canonical, fingerprint: preview.fingerprint, confirmation, reason: note || "Merge Stage 4 approvato da revisione admin" });
      setMergeResult(json.data); toast.success("Merge e verifica post-operazione completati"); setConfirmation(""); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }

  return <div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gap: 18 }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <div><Link href="/admin/users" style={{ fontWeight: 800 }}>← Utenti</Link><h1 style={{ fontSize: 30, margin: "8px 0 4px" }}>Migrazione identità</h1><p style={{ color: "#64748b", margin: 0 }}>Scansione, revisione, dry-run e merge esplicito. Nessuna esecuzione automatica.</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><a href="/api/admin/users/duplicates/report?format=csv" style={actionLink}><Download size={16} /> Esporta dry-run</a><button className="base44-primary-btn" disabled={busy} onClick={scan}><RefreshCw size={16} /> {busy ? "Attendi…" : "Avvia scansione"}</button></div>
    </header>

    {summary && <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 9 }}>
      {[['total_users','Utenti'],['unlinked_users','Non collegati'],['auth_linked_users','Auth collegati'],['pending_groups','Pending'],['manual_only_groups','Manual only'],['conflicts','Conflitti'],['merged_groups','Gruppi uniti'],['completion_percent','Completamento %']].map(([key,label]) => <div key={key} style={metric}><b style={{ fontSize: 22 }}>{String(summary[key] ?? 0)}</b><span>{label}</span></div>)}
    </section>}

    <nav style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{filterOptions.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} style={{ ...filterButton, background: filter === value ? "#312e81" : "white", color: filter === value ? "white" : "#334155" }}>{label}</button>)}</nav>

    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,.75fr) minmax(0,1.7fr)", gap: 16 }} className="duplicate-review-grid">
      <section style={panel}><strong>{loading ? "Caricamento…" : `${visibleGroups.length} gruppi`}</strong><div style={{ display: "grid", gap: 9, marginTop: 12 }}>
        {visibleGroups.map((group) => <button key={group.id} onClick={() => choose(group)} style={{ ...groupButton, borderColor: selectedId === group.id ? "#4f46e5" : "#e2e8f0" }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{group.signal_type === "normalized_email" ? "Email" : group.signal_type === "normalized_phone" ? "Telefono" : "Segnale debole"}</b><Status value={group.is_stale ? "stale" : group.state} /></span>
          <span style={{ wordBreak: "break-all", color: "#475569" }}>{group.signal_value}</span><small>{group.members.length} profili · {group.confidence}</small>
        </button>)}
        {!loading && visibleGroups.length === 0 && <p style={{ color: "#64748b" }}>Nessun gruppo nel filtro selezionato.</p>}
      </div></section>

      <section style={panel}>{!selected ? <p style={{ color: "#64748b" }}>Seleziona un gruppo per la revisione.</p> : <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><b>Segnale normalizzato</b><div>{selected.signal_value}</div></div><Status value={selected.is_stale ? "stale" : selected.state} /></div>
        {selected.is_stale && <div style={warning}><ShieldAlert size={18} /> Preview scaduta: {selected.stale_reason}. Esegui una nuova scansione e revisione.</div>}
        {selected.warning_flags.length > 0 && <div style={warning}><ShieldAlert size={18} /> {selected.warning_flags.join(", ")}</div>}
        <div style={{ padding: 12, borderRadius: 12, background: "#eef2ff" }}><b>Profilo suggerito come canonico perché:</b><ul style={{ margin: "7px 0 0", paddingLeft: 20 }}>{selected.recommendation_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(245px,1fr))", gap: 10 }}>{selected.members.map(({ profile }) => <article key={profile.id} style={{ border: canonical === profile.id ? "2px solid #4f46e5" : "1px solid #e2e8f0", borderRadius: 14, padding: 13 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" disabled={profile.identity_status !== "active"} checked={included.includes(profile.id)} onChange={(event) => setIncluded((old) => event.target.checked ? [...new Set([...old, profile.id])] : old.filter((id) => id !== profile.id))} /> {profile.identity_status === "active" ? "Incluso" : "Profilo già unito"}</label>
          <h3 style={{ margin: "10px 0 3px" }}>{profile.full_name}</h3><div>{profile.email}</div><small>{profile.normalized_email}</small><div>{profile.phone}</div><small>{profile.normalized_phone ?? "telefono non valido/tecnico"}</small>
          <p style={{ margin: "8px 0", fontSize: 13 }}>Auth: <b>{profile.auth_state}</b> · creato {new Date(profile.created_at).toLocaleDateString("it-IT")}</p>
          <div style={{ fontSize: 12 }}>Consensi: {Object.entries(profile.consents).filter(([, value]) => Boolean(value)).map(([key]) => key).join(", ") || "nessuno"}</div>
          <div style={{ fontSize: 12, marginTop: 5 }}>Riferimenti: {Object.entries(profile.reference_counts).map(([key, value]) => `${key} ${value}`).join(" · ")}</div>
          <div style={{ fontSize: 12, marginTop: 5 }}>MoviBack: {profile.moviback.map((membership) => `${membership.status}, ${membership.ledger_balance} pt`).join(" · ") || "nessuna membership"}</div>
          <div style={{ fontSize: 12, marginTop: 5 }}>Monday League: {profile.monday_league.map((entry) => `${entry.team_name}${entry.captain ? " (capitano)" : ""} · ${entry.active ? "attivo" : "storico"} · fasi ${entry.phases.map((phase) => `${phase.name}: ${phase.status}`).join(", ") || "nessuna"}`).join(" · ") || "nessuna squadra"}</div>
          {(profile.reference_counts.tournament_registrations > 0 || profile.reference_counts.tournament_participants > 0) && <div style={{ fontSize: 12, marginTop: 5, color: "#92400e" }}>Tornei: snapshot telefono e player_key restano invariati; eventuali collisioni dello stesso evento compaiono nel preflight.</div>}
          <button disabled={profile.identity_status !== "active" || (selected.members.some((member) => member.profile.auth_linked) && !profile.auth_linked)} onClick={() => { setCanonical(profile.id); setFieldWinners(Object.fromEntries(profileFields.map((field) => [field, profile.id]))); setSource(selected.members.find((member) => member.profile.identity_status === "active" && member.profile.id !== profile.id && included.includes(member.profile.id))?.profile.id ?? ""); setPreview(null); }} style={miniButton}>{selected.recommended_user_id === profile.id ? "Consigliato · " : ""}Usa come canonico</button>
        </article>)}</div>

        <label style={label}>Profilo sorgente<select className="base44-input" value={source} onChange={(event) => { setSource(event.target.value); setPreview(null); }}><option value="">Seleziona</option>{selected.members.filter((member) => member.profile.identity_status === "active" && member.profile.id !== canonical && included.includes(member.profile.id)).map((member) => <option key={member.profile.id} value={member.profile.id}>{member.profile.full_name}</option>)}</select></label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 8 }}>{profileFields.map((field) => <label key={field} style={label}>Vincitore {field}<select className="base44-input" value={fieldWinners[field] ?? canonical} disabled={field === "email" && selected.members.some((member) => member.profile.id === canonical && member.profile.auth_linked)} onChange={(event) => { setFieldWinners((old) => ({ ...old, [field]: event.target.value })); setPreview(null); }}>{selected.members.filter((member) => included.includes(member.profile.id)).map((member) => <option key={member.profile.id} value={member.profile.id}>{member.profile.full_name}</option>)}</select></label>)}</div>
        <label style={label}>Nota obbligatoria per il contesto operativo<textarea className="base44-input" value={note} onChange={(event) => setNote(event.target.value)} style={{ minHeight: 76, padding: 10 }} /></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={() => review("approved")} style={miniButton}>Approva piano</button><button onClick={() => review("rejected")} style={miniButton}>Rifiuta</button><button onClick={() => review("manual_only")} style={miniButton}>Manual only</button><button onClick={() => review("conflict")} style={miniButton}>Segna conflitto</button><button onClick={buildPreview} disabled={!source || !canonical || busy} className="base44-primary-btn"><GitMerge size={16} /> Aggiorna preflight</button></div>

        {preview && <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 15, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Dry-run operativo</h2><code style={{ fontSize: 11, wordBreak: "break-all" }}>{preview.fingerprint}</code>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 8 }}>{Object.entries(preview.pair_counts).map(([key, value]) => <div key={key} style={metric}><b>{value}</b><span>{key}</span></div>)}</div>
          {preview.blockers.length ? <div style={warning}><AlertTriangle size={18} /> Merge bloccato: {preview.blockers.join(", ")}</div> : <div style={success}><CheckCircle2 size={18} /> Preflight superato.</div>}
          {preview.warnings?.length > 0 && <div style={warning}><ShieldAlert size={18} /> Attenzioni: {preview.warnings.join(", ")}</div>}
          {preview.moviback.applicable && <div style={{ ...panel, background: preview.moviback.safe ? "#f0fdf4" : "#fff7ed" }}><b>Riconciliazione MoviBack: {preview.moviback.safe ? "ledger verificabile" : "bloccata"}</b><p>Saldo finale atteso: {preview.moviback.expected_balance ?? "—"} punti. Transazioni e riscatti conservano gli ID; la membership sorgente viene archiviata nel journal.</p>{preview.moviback.blockers?.length ? <p>{preview.moviback.blockers.join(", ")}</p> : null}</div>}
          <div style={{ fontSize: 13 }}><b>Esito consensi:</b><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(preview.consent_outcome, null, 2)}</pre></div>
          <p style={{ margin: 0, fontSize: 13 }}>Passi condizionali: trasferimenti di ownership e riconciliazione MoviBack. Attori storici e snapshot rimangono invariati. La reversal richiede revisione.</p>
          {!preview.blockers.length && <div style={{ display: "grid", gap: 8 }}><label style={label}>Digita MERGE per confermare<input className="base44-input" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="base44-primary-btn" disabled={confirmation !== "MERGE" || selected.state !== "approved" || busy} onClick={execute}>Esegui merge revisionato</button>{selected.state !== "approved" && <small>Salva prima il gruppo come approvato e aggiorna il preflight.</small>}</div>}
        </div>}

        {mergeResult?.verification && <div style={mergeResult.verification.passed ? success : warning}><CheckCircle2 size={18} /><div><b>Verifica post-merge: {mergeResult.verification.passed ? "superata" : "needs_review"}</b><div>{Object.entries(mergeResult.verification.checks ?? {}).map(([key, passed]) => `${key}: ${passed ? "ok" : "errore"}`).join(" · ")}</div></div></div>}
      </div>}</section>
    </div>
    <style jsx>{`@media(max-width:800px){.duplicate-review-grid{grid-template-columns:1fr!important}}`}</style>
  </div>;
}

function Status({ value }: { value: string }) { return <span style={{ borderRadius: 999, padding: "5px 9px", background: value === "conflict" || value === "stale" ? "#fee2e2" : value === "merged" ? "#dcfce7" : "#eef2ff", fontSize: 11, fontWeight: 850 }}>{value}</span>; }
const panel: React.CSSProperties = { background: "white", border: "1px solid #e2e8f0", borderRadius: 18, padding: 16, minWidth: 0 };
const groupButton: React.CSSProperties = { display: "grid", gap: 5, textAlign: "left", background: "white", border: "1px solid", borderRadius: 12, padding: 11, cursor: "pointer" };
const miniButton: React.CSSProperties = { marginTop: 10, border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 9, minHeight: 36, padding: "0 10px", fontWeight: 750, cursor: "pointer" };
const filterButton: React.CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 999, minHeight: 34, padding: "0 12px", fontWeight: 750, cursor: "pointer" };
const actionLink: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #cbd5e1", background: "white", borderRadius: 10, padding: "0 12px", minHeight: 42, fontWeight: 750 };
const label: React.CSSProperties = { display: "grid", gap: 6, fontWeight: 750 };
const warning: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: 11, background: "#fff7ed", color: "#9a3412", borderRadius: 10 };
const success: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: 11, background: "#ecfdf5", color: "#065f46", borderRadius: 10 };
const metric: React.CSSProperties = { display: "grid", padding: 10, borderRadius: 10, background: "#f8fafc", fontSize: 12 };
