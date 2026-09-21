"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, GitMerge, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Profile = {
  id: string; full_name: string; phone: string; email: string; gender: string;
  created_at: string; updated_at: string; auth_linked: boolean; identity_status: string;
  consents: Record<string, boolean>; reference_counts: Record<string, number>;
};
type Member = { included: boolean; profile: Profile };
type Group = {
  id: string; signal_type: string; signal_value: string; confidence: string; state: string;
  recommended_user_id: string | null; canonical_user_id: string | null; warning_flags: string[];
  review_note: string | null; members: Member[];
};
type Preview = {
  source_user_id: string; canonical_user_id: string; fingerprint: string; conflicts: string[];
  warnings: string[]; counts: Record<string, number>; consent_policy: Record<string, string>;
  reversal: Record<string, string>;
};

async function api(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "Operazione non riuscita");
  return json;
}

export default function DuplicateUsersPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [canonical, setCanonical] = useState("");
  const [source, setSource] = useState("");
  const [included, setIncluded] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await api("/api/admin/users/duplicates");
      setGroups(json.data ?? []);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const selected = useMemo(() => groups.find((group) => group.id === selectedId) ?? null, [groups, selectedId]);

  function choose(group: Group) {
    setSelectedId(group.id);
    const activeMembers = group.members.filter((member) => member.profile.identity_status === "active");
    const nextCanonical = group.canonical_user_id ?? group.recommended_user_id ?? activeMembers[0]?.profile.id ?? "";
    setCanonical(nextCanonical);
    setIncluded(activeMembers.filter((member) => member.included).map((member) => member.profile.id));
    setSource(activeMembers.find((member) => member.profile.id !== nextCanonical && member.included)?.profile.id ?? "");
    setNote(group.review_note ?? "");
    setPreview(null); setConfirmation("");
  }

  async function refresh() {
    setBusy(true);
    try { await api("/api/admin/users/duplicates", { action: "refresh" }); await load(); toast.success("Ricerca duplicati aggiornata"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }

  async function review(state: string) {
    if (!selected) return;
    setBusy(true);
    try {
      await api("/api/admin/users/duplicates", { group_id: selected.id, state, canonical_user_id: canonical || null, included_user_ids: included, review_note: note });
      await load(); toast.success("Revisione salvata");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }

  async function buildPreview() {
    if (!source || !canonical) return;
    setBusy(true);
    try {
      const json = await api("/api/admin/users/duplicates/preview", { source_user_id: source, canonical_user_id: canonical });
      setPreview(json.data); setConfirmation("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }

  async function execute() {
    if (!selected || !preview) return;
    setBusy(true);
    try {
      await api("/api/admin/users/duplicates/execute", {
        group_id: selected.id, source_user_id: source, canonical_user_id: canonical,
        fingerprint: preview.fingerprint, confirmation, reason: note || "Merge duplicato approvato da revisione admin",
      });
      toast.success("Merge completato"); setPreview(null); setConfirmation(""); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }

  return <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 18 }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <div><Link href="/admin/users" style={{ fontWeight: 800 }}>← Utenti</Link><h1 style={{ fontSize: 30, margin: "8px 0 4px" }}>Revisione duplicati</h1><p style={{ color: "#64748b", margin: 0 }}>Suggerimenti da email/telefono normalizzati. Nessun merge è automatico.</p></div>
      <button className="base44-primary-btn" disabled={busy} onClick={refresh}><RefreshCw size={16} /> {busy ? "Attendi…" : "Aggiorna candidati"}</button>
    </header>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,.8fr) minmax(0,1.6fr)", gap: 16 }} className="duplicate-review-grid">
      <section style={panel}>
        <strong>{loading ? "Caricamento…" : `${groups.length} gruppi`}</strong>
        <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
          {groups.map((group) => <button key={group.id} onClick={() => choose(group)} style={{ ...groupButton, borderColor: selectedId === group.id ? "#4f46e5" : "#e2e8f0" }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{group.signal_type === "normalized_email" ? "Email" : group.signal_type === "normalized_phone" ? "Telefono" : "Segnale debole"}</b><Status value={group.state} /></span>
            <span style={{ wordBreak: "break-all", color: "#475569" }}>{group.signal_value}</span>
            <small>{group.members.length} profili · confidenza {group.confidence}</small>
          </button>)}
          {!loading && groups.length === 0 && <p style={{ color: "#64748b" }}>Esegui la ricerca per creare la coda locale.</p>}
        </div>
      </section>
      <section style={panel}>
        {!selected ? <p style={{ color: "#64748b" }}>Seleziona un gruppo per ispezionarlo.</p> : <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><b>Segnale</b><div>{selected.signal_value}</div></div><Status value={selected.state} /></div>
          {selected.warning_flags.length > 0 && <div style={warning}><ShieldAlert size={18} /> {selected.warning_flags.join(", ")}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
            {selected.members.map(({ profile }) => <article key={profile.id} style={{ border: canonical === profile.id ? "2px solid #4f46e5" : "1px solid #e2e8f0", borderRadius: 14, padding: 13 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" disabled={profile.identity_status !== "active"} checked={included.includes(profile.id)} onChange={(event) => setIncluded((old) => event.target.checked ? [...new Set([...old, profile.id])] : old.filter((id) => id !== profile.id))} /> {profile.identity_status === "active" ? "Incluso" : "Profilo già unito"}</label>
              <h3 style={{ margin: "10px 0 3px" }}>{profile.full_name}</h3><div>{profile.email}</div><div>{profile.phone}</div>
              <p style={{ margin: "8px 0", fontSize: 13 }}>Auth: <b>{profile.auth_linked ? "collegata" : "no"}</b> · creato {new Date(profile.created_at).toLocaleDateString("it-IT")}</p>
              <div style={{ fontSize: 12 }}>Consensi: {Object.entries(profile.consents).filter(([, value]) => value).map(([key]) => key).join(", ") || "nessuno"}</div>
              <div style={{ fontSize: 12, marginTop: 5 }}>Riferimenti: {Object.entries(profile.reference_counts).map(([key, value]) => `${key} ${value}`).join(" · ")}</div>
              <button disabled={profile.identity_status !== "active"} onClick={() => { setCanonical(profile.id); setSource(selected.members.find((member) => member.profile.identity_status === "active" && member.profile.id !== profile.id && included.includes(member.profile.id))?.profile.id ?? ""); setPreview(null); }} style={miniButton}>{selected.recommended_user_id === profile.id ? "Consigliato · " : ""}Usa come canonico</button>
            </article>)}
          </div>
          <label style={label}>Profilo sorgente<select className="base44-input" value={source} onChange={(event) => { setSource(event.target.value); setPreview(null); }}><option value="">Seleziona</option>{selected.members.filter((member) => member.profile.identity_status === "active" && member.profile.id !== canonical && included.includes(member.profile.id)).map((member) => <option key={member.profile.id} value={member.profile.id}>{member.profile.full_name}</option>)}</select></label>
          <label style={label}>Nota di revisione<textarea className="base44-input" value={note} onChange={(event) => setNote(event.target.value)} style={{ minHeight: 76, padding: 10 }} /></label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={() => review("approved")} style={miniButton}>Approva piano</button><button onClick={() => review("rejected")} style={miniButton}>Rifiuta gruppo</button><button onClick={() => review("manual_only")} style={miniButton}>Solo revisione manuale</button><button onClick={buildPreview} disabled={!source || !canonical || busy} className="base44-primary-btn"><GitMerge size={16} /> Genera preview</button></div>
          {preview && <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 15, display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0 }}>Preview transazionale</h2><code style={{ fontSize: 11, wordBreak: "break-all" }}>{preview.fingerprint}</code>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}>{Object.entries(preview.counts).map(([key, value]) => <div key={key} style={metric}><b>{value}</b><span>{key}</span></div>)}</div>
            {preview.conflicts.length ? <div style={warning}><AlertTriangle size={18} /> Merge bloccato: {preview.conflicts.join(", ")}</div> : <div style={success}><CheckCircle2 size={18} /> Nessun conflitto bloccante rilevato.</div>}
            {preview.warnings?.length > 0 && <div style={warning}><ShieldAlert size={18} /> Attenzioni: {preview.warnings.join(", ")}</div>}
            <p style={{ margin: 0, fontSize: 13 }}>Consensi: evidenza più antica per privacy/termini/età; marketing conservativo. Reversal: condizionale, con attori storici preservati.</p>
            {!preview.conflicts.length && <div style={{ display: "grid", gap: 8 }}><label style={label}>Digita MERGE per confermare<input className="base44-input" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="base44-primary-btn" disabled={confirmation !== "MERGE" || selected.state !== "approved" || busy} onClick={execute}>Esegui merge confermato</button>{selected.state !== "approved" && <small>Salva prima il gruppo nello stato approvato.</small>}</div>}
          </div>}
        </div>}
      </section>
    </div>
    <style jsx>{`@media(max-width:800px){.duplicate-review-grid{grid-template-columns:1fr!important}}`}</style>
  </div>;
}

function Status({ value }: { value: string }) { return <span style={{ borderRadius: 999, padding: "5px 9px", background: value === "conflict" ? "#fee2e2" : value === "merged" ? "#dcfce7" : "#eef2ff", fontSize: 11, fontWeight: 850 }}>{value}</span>; }
const panel: React.CSSProperties = { background: "white", border: "1px solid #e2e8f0", borderRadius: 18, padding: 16, minWidth: 0 };
const groupButton: React.CSSProperties = { display: "grid", gap: 5, textAlign: "left", background: "white", border: "1px solid", borderRadius: 12, padding: 11, cursor: "pointer" };
const miniButton: React.CSSProperties = { marginTop: 10, border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 9, minHeight: 36, padding: "0 10px", fontWeight: 750, cursor: "pointer" };
const label: React.CSSProperties = { display: "grid", gap: 6, fontWeight: 750 };
const warning: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: 11, background: "#fff7ed", color: "#9a3412", borderRadius: 10 };
const success: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: 11, background: "#ecfdf5", color: "#065f46", borderRadius: 10 };
const metric: React.CSSProperties = { display: "grid", padding: 9, borderRadius: 9, background: "#f8fafc", fontSize: 12 };
