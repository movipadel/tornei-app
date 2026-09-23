"use client";

import Link from "next/link";
import { CheckCircle2, ChevronDown, RefreshCw, ShieldAlert, UserCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Profile = {
  id: string; full_name: string; phone: string; email: string; created_at: string;
  auth_linked: boolean; identity_status: string; reference_counts: Record<string, number>;
  moviback: Array<{ status: string; ledger_balance: number }>;
  monday_league: Array<{ team_name: string; active: boolean; captain: boolean }>;
};
type Group = {
  id: string; signal_type: string; state: string; is_stale: boolean;
  recommended_user_id: string | null; warning_flags: string[]; recommendation_reasons: string[];
  members: Array<{ included: boolean; profile?: Profile }>;
};
type Preview = {
  state: "ready" | "attention" | "resolved"; group_id: string; requested_group_id: string;
  recovered_group?: boolean; profile_count: number; keep_user_id: string;
  keep_profile?: { full_name: string; phone: string; email: string; gender: string };
  final_fields?: Record<string, string>; totals?: Record<string, number>;
  blockers?: Array<{ code: string; message: string }>;
  field_choices?: Array<{ field: string; question: string; options: Array<{ user_id: string; value: string }> }>;
  new_access_pending?: boolean; technical?: unknown;
};
type ResolveResult = {
  state: "completed" | "attention"; completed?: Array<{ operation_id: string }>;
  blockers?: Array<{ code: string; message: string }>;
  auth_continuation?: { state: string } | null;
};

async function api(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok && !json.data) throw new Error(json.error || "Operazione non riuscita");
  return json;
}
const reasonLabel = (type: string) => type === "normalized_email" ? "Stessa email" : type === "normalized_phone" ? "Stesso telefono" : "Dati molto simili";
const statusLabel = (group: Group) => group.state === "merged" ? "RISOLTO" : group.state === "approved" ? "PRONTO" : group.state === "conflict" || group.state === "manual_only" || group.is_stale ? "RICHIEDE ATTENZIONE" : "DA CONTROLLARE";
const groupName = (group: Group) => group.members.find((member) => member.profile?.id === group.recommended_user_id)?.profile?.full_name ?? group.members.find((member) => member.profile?.identity_status === "active")?.profile?.full_name ?? "Persona da verificare";

export default function DuplicateUsersPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keepId, setKeepId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setGroups((await api("/api/admin/users/duplicates")).data ?? []); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => groups.filter((group) => filter === "resolved" ? group.state === "merged" : group.state !== "merged"), [groups, filter]);
  const selected = useMemo(() => groups.find((group) => group.id === selectedId) ?? null, [groups, selectedId]);
  const activeProfiles = useMemo(() => selected?.members.map((member) => member.profile).filter((profile): profile is Profile => Boolean(profile) && profile!.identity_status === "active") ?? [], [selected]);

  function openGroup(group: Group) {
    const active = group.members.map((member) => member.profile).filter((profile): profile is Profile => Boolean(profile) && profile!.identity_status === "active");
    const recommended = active.find((profile) => profile.id === group.recommended_user_id) ?? active.find((profile) => profile.auth_linked) ?? active[0];
    setSelectedId(group.id); setKeepId(recommended?.id ?? ""); setPreview(null); setResult(null); setChoices({}); setConfirming(false);
  }
  async function scan() {
    setBusy(true);
    try { await api("/api/admin/users/duplicates", { action: "scan" }); await load(); toast.success("Elenco aggiornato"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }
  async function review(profileId = keepId, nextChoices = choices) {
    if (!selected || !profileId) return;
    setBusy(true); setKeepId(profileId); setResult(null);
    try {
      const data = (await api("/api/admin/users/duplicates/preview", { group_id: selected.id, keep_user_id: profileId, field_choices: nextChoices })).data as Preview;
      setPreview(data);
      if (data.recovered_group) toast.success("Gruppo aggiornato con i profili ancora attivi");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }
  async function resolve() {
    if (!selected || !keepId) return;
    setBusy(true); setConfirming(false);
    try {
      const data = (await api("/api/admin/users/duplicates/resolve", { group_id: selected.id, keep_user_id: keepId, field_choices: choices })).data as ResolveResult;
      setResult(data);
      if (data.state === "completed") { toast.success("Profili uniti correttamente"); await load(); }
      else toast.error(data.blockers?.[0]?.message ?? "Serve una verifica");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setBusy(false); }
  }

  return <main style={S.shell}>
    <header style={S.header}><div><Link href="/admin/users" style={{ fontWeight: 800 }}>← Utenti</Link><h1 style={{ margin: "8px 0 4px", fontSize: 32 }}>Profili duplicati</h1><p style={S.lead}>Qui trovi persone che potrebbero avere più profili MOVI. Scegli quello da mantenere: MOVI conserverà automaticamente punti, tornei, ordini e storico quando è sicuro farlo.</p></div><button className="base44-primary-btn" onClick={scan} disabled={busy}><RefreshCw size={17} /> Aggiorna elenco</button></header>
    <nav style={S.tabs}><button style={tab(filter === "open")} onClick={() => setFilter("open")}>Da controllare</button><button style={tab(filter === "resolved")} onClick={() => setFilter("resolved")}>Risolti</button></nav>
    <div className="duplicate-review-grid" style={S.layout}>
      <section style={S.panel}><b>{loading ? "Caricamento…" : `${visible.length} gruppi`}</b><div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {visible.map((group) => <button key={group.id} onClick={() => openGroup(group)} style={{ ...S.groupCard, borderColor: selectedId === group.id ? "#4f46e5" : "#e2e8f0" }}><span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{groupName(group)}</strong><Status value={statusLabel(group)} /></span><span>{group.members.filter((member) => member.profile?.identity_status === "active").length} profili</span><small style={S.muted}>{reasonLabel(group.signal_type)}</small>{group.warning_flags.includes("activation_review_required") && <small style={{ color: "#92400e", fontWeight: 800 }}>Nuovo accesso in attesa</small>}</button>)}
        {!loading && !visible.length && <p style={S.muted}>Nessun gruppo in questa sezione.</p>}
      </div></section>
      <section style={S.panel}>
        {!selected && <p style={S.muted}>Seleziona una persona per iniziare.</p>}
        {selected && !result && <div style={{ display: "grid", gap: 20 }}><Step number="1" title="Scegli il profilo da mantenere" /><div style={S.profileGrid}>{activeProfiles.map((profile) => <ProfileCard key={profile.id} profile={profile} recommended={selected.recommended_user_id === profile.id} selected={keepId === profile.id} busy={busy} onChoose={() => void review(profile.id)} />)}</div>
          {selected.members.some((member) => member.profile?.identity_status === "merged") && <div style={S.info}><CheckCircle2 size={18} /> I profili già uniti sono stati esclusi automaticamente. Puoi completare quelli rimasti.</div>}
          {preview && <><Step number="2" title="Controlla il risultato" />{preview.state === "resolved" ? <div style={S.success}><CheckCircle2 size={20} /> Questo gruppo è già risolto.</div> : <ReviewCard preview={preview} />}
            {preview.field_choices?.map((choice) => <fieldset key={choice.field} style={S.choiceBox}><legend><b>{choice.question}</b></legend>{choice.options.map((option) => <label key={option.user_id} style={{ display: "flex", gap: 8, padding: 6 }}><input type="radio" name={choice.field} checked={choices[choice.field] === option.user_id} onChange={() => { const next = { ...choices, [choice.field]: option.user_id }; setChoices(next); void review(keepId, next); }} />{option.value}</label>)}</fieldset>)}
            {preview.state === "ready" && <div style={{ display: "grid", gap: 10 }}><div style={S.success}><CheckCircle2 size={20} /><div><b>Pronto per l’unione</b><div>Tutti i controlli di sicurezza sono superati.</div></div></div><Step number="3" title="Unisci tutti i profili sicuri" /><button className="base44-primary-btn" style={{ minHeight: 52, fontSize: 16 }} onClick={() => setConfirming(true)} disabled={busy}>UNISCI PROFILI</button></div>}
            {preview.state === "attention" && <div style={S.warning}><ShieldAlert size={20} /><div><b>Serve una scelta prima di continuare</b>{preview.blockers?.map((blocker) => <p key={blocker.code} style={{ margin: "5px 0 0" }}>{blocker.message}</p>)}</div></div>}
            {preview.new_access_pending && <div style={S.info}><UserCheck size={19} /><div><b>Nuovo accesso in attesa</b><div>Dopo l’unione MOVI proverà a completare il collegamento Auth in modo sicuro.</div></div></div>}
            <details style={S.advanced}><summary><ChevronDown size={16} /> Dettagli tecnici</summary><pre style={S.technical}>{JSON.stringify({ group_id: preview.group_id, requested_group_id: preview.requested_group_id, technical: preview.technical, blockers: preview.blockers }, null, 2)}</pre></details>
          </>}
        </div>}
        {result?.state === "completed" && <div style={{ display: "grid", gap: 16 }}><div style={S.success}><CheckCircle2 size={22} /><div><h2 style={{ margin: 0 }}>Profili uniti correttamente</h2><div>L’unione è stata verificata.</div></div></div><ul style={S.checks}><li>✓ Profilo principale conservato</li><li>✓ MoviBack conservato</li><li>✓ Tornei conservati</li><li>✓ Ordini conservati</li><li>✓ Nessun dato perso</li></ul>{result.auth_continuation && <div style={S.info}><UserCheck size={18} /> {result.auth_continuation.state === "linked" ? "Nuovo accesso completato" : "Nuovo accesso ancora in attesa di verifica"}</div>}<button className="base44-primary-btn" onClick={() => { setSelectedId(null); setPreview(null); setResult(null); setFilter("open"); }}>TORNA AI DUPLICATI</button><details style={S.advanced}><summary><ChevronDown size={16} /> Dettagli tecnici</summary><pre style={S.technical}>{JSON.stringify(result, null, 2)}</pre></details></div>}
        {result?.state === "attention" && <div style={S.warning}><ShieldAlert size={20} /><div><b>L’unione si è fermata in sicurezza</b>{result.blockers?.map((blocker) => <p key={blocker.code}>{blocker.message}</p>)}<button className="base44-primary-btn" onClick={() => void review()}>Riapri il riepilogo</button></div></div>}
      </section>
    </div>
    {confirming && preview?.keep_profile && <div role="dialog" aria-modal="true" aria-label="Conferma unione" style={S.modalBackdrop}><div style={S.modal}><h2 style={{ marginTop: 0 }}>Confermi l’unione di {preview.profile_count} profili?</h2><p>Il profilo che resterà è <b>{preview.keep_profile.full_name}</b>.</p><div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}><button style={S.secondary} onClick={() => setConfirming(false)}>Annulla</button><button className="base44-primary-btn" onClick={() => void resolve()} disabled={busy}>{busy ? "Attendi…" : "Conferma unione"}</button></div></div></div>}
  </main>;
}

function Step({ number, title }: { number: string; title: string }) { return <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={S.stepNumber}>{number}</span><h2 style={{ margin: 0, fontSize: 21 }}>{title}</h2></div>; }
function Status({ value }: { value: string }) { const attention = value === "RICHIEDE ATTENZIONE"; const done = value === "RISOLTO"; return <span style={{ ...S.status, background: attention ? "#fff7ed" : done ? "#ecfdf5" : "#eef2ff", color: attention ? "#9a3412" : done ? "#047857" : "#3730a3" }}>{value}</span>; }
function ProfileCard({ profile, recommended, selected, busy, onChoose }: { profile: Profile; recommended: boolean; selected: boolean; busy: boolean; onChoose: () => void }) {
  const counts = profile.reference_counts ?? {};
  const points = profile.moviback.reduce((sum, membership) => sum + membership.ledger_balance, 0);
  const tournaments = (counts.tournament_registrations ?? 0) + (counts.tournament_participants ?? 0);
  const orders = counts.store_orders ?? 0;
  const moviback = profile.moviback.length ? `${profile.moviback.map((membership) => membership.status).join(", ")} · ${points} punti` : "non presente";
  return <article style={{ ...S.profileCard, borderColor: selected ? "#4f46e5" : "#dbe2ea", boxShadow: selected ? "0 0 0 2px #c7d2fe" : "none" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>{recommended ? <span style={S.recommendedBadge}>Consigliato</span> : <span />}{profile.auth_linked && <span style={S.authBadge}>Accesso collegato</span>}</div><h3 style={{ margin: "10px 0 5px" }}>{profile.full_name}</h3><div>{profile.phone}</div><div style={{ overflowWrap: "anywhere" }}>{profile.email}</div><small style={S.muted}>Creato il {new Date(profile.created_at).toLocaleDateString("it-IT")}</small><div style={S.evidence}><span>Accesso Auth: <b>{profile.auth_linked ? "sì" : "no"}</b></span><span>MoviBack: <b>{moviback}</b></span><span>Tornei: <b>{tournaments}</b></span><span>Ordini Store: <b>{orders}</b></span><span>Monday League: <b>{profile.monday_league.length ? profile.monday_league.map((entry) => `${entry.team_name}${entry.captain ? " (capitano)" : ""}`).join(", ") : "nessun ruolo"}</b></span><span>Comunicazioni/storico: <b>{(counts.communication_states ?? 0) + (counts.communications ?? 0)}</b></span><span>Certificato medico: <b>{counts.medical_certificates ? "presente" : "non presente"}</b></span></div>{recommended && <p style={{ fontSize: 13, color: "#4338ca" }}>È il profilo con lo storico principale: {points} punti MoviBack, {tournaments} tornei e {orders} ordini.</p>}<button className="base44-primary-btn" style={{ width: "100%" }} onClick={onChoose} disabled={busy}>{selected && busy ? "Verifica…" : "TIENI QUESTO PROFILO"}</button></article>;
}
function ReviewCard({ preview }: { preview: Preview }) { const totals = preview.totals ?? {}; return <div style={S.reviewCard}><h3 style={{ marginTop: 0 }}>Questo è ciò che resterà</h3><div style={S.reviewGrid}><Info label="Profilo principale" value={preview.keep_profile?.full_name ?? ""} /><Info label="MoviBack" value={`${totals.moviback_points ?? 0} punti conservati`} /><Info label="Tornei" value={`${(totals.tournament_registrations ?? 0) + (totals.tournament_participants ?? 0)} partecipazioni conservate`} /><Info label="Store" value={`${totals.store_orders ?? 0} ordini conservati`} /><Info label="Certificato medico" value={totals.medical_certificates ? "Conservato" : "Non presente"} /><Info label="Monday League" value={preview.blockers?.some((blocker) => blocker.code.includes("league")) ? "Richiede attenzione" : "Nessun conflitto"} /></div>{preview.final_fields && <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #dbeafe" }}><b>Dati finali</b><div style={{ marginTop: 5 }}>Nome: {preview.final_fields.full_name}<br />Telefono: {preview.final_fields.phone}<br />Email: {preview.final_fields.email}<br />Genere: {preview.final_fields.gender}</div></div>}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div style={{ display: "grid", gap: 3 }}><small>{label}</small><b>{value}</b></div>; }

const tab = (active: boolean): React.CSSProperties => ({ border: "1px solid #cbd5e1", borderRadius: 999, padding: "9px 15px", fontWeight: 800, cursor: "pointer", background: active ? "#312e81" : "white", color: active ? "white" : "#334155" });
const S: Record<string, React.CSSProperties> = {
  shell: { maxWidth: 1240, margin: "0 auto", display: "grid", gap: 18, paddingBottom: 40 }, header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }, lead: { color: "#475569", margin: 0, maxWidth: 760, lineHeight: 1.55 }, tabs: { display: "flex", gap: 8, flexWrap: "wrap" }, layout: { display: "grid", gridTemplateColumns: "minmax(260px,.75fr) minmax(0,1.65fr)", gap: 16 }, panel: { background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, minWidth: 0 }, groupCard: { display: "grid", gap: 5, width: "100%", textAlign: "left", background: "white", border: "2px solid", borderRadius: 13, padding: 12, cursor: "pointer" }, profileGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(245px,1fr))", gap: 12 }, profileCard: { border: "1px solid", borderRadius: 15, padding: 14, display: "grid", gap: 6, minWidth: 0 }, evidence: { display: "grid", gap: 4, padding: "10px 0", fontSize: 13, borderTop: "1px solid #e2e8f0", marginTop: 6 }, recommendedBadge: { background: "#e0e7ff", color: "#3730a3", padding: "4px 8px", borderRadius: 999, fontSize: 12, fontWeight: 900 }, authBadge: { background: "#ecfdf5", color: "#047857", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800 }, status: { borderRadius: 999, padding: "4px 7px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" }, stepNumber: { display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: "50%", color: "white", background: "#4f46e5", fontWeight: 900 }, reviewCard: { padding: 16, borderRadius: 15, background: "#eff6ff", border: "1px solid #bfdbfe" }, reviewGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }, success: { display: "flex", gap: 10, alignItems: "flex-start", padding: 14, borderRadius: 13, background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }, warning: { display: "flex", gap: 10, alignItems: "flex-start", padding: 14, borderRadius: 13, background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa" }, info: { display: "flex", gap: 9, alignItems: "flex-start", padding: 12, borderRadius: 12, background: "#eef2ff", color: "#3730a3" }, choiceBox: { border: "1px solid #fdba74", borderRadius: 12, padding: 12 }, advanced: { borderTop: "1px solid #e2e8f0", paddingTop: 10, color: "#475569" }, technical: { overflow: "auto", maxHeight: 320, padding: 10, background: "#0f172a", color: "#e2e8f0", borderRadius: 10, fontSize: 11 }, checks: { listStyle: "none", display: "grid", gap: 7, padding: 0, margin: 0, fontWeight: 700 }, modalBackdrop: { position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,.55)", display: "grid", placeItems: "center", padding: 16 }, modal: { width: "min(480px,100%)", background: "white", borderRadius: 18, padding: 22, boxShadow: "0 24px 70px rgba(15,23,42,.3)" }, secondary: { minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 10, background: "white", padding: "0 15px", fontWeight: 800, cursor: "pointer" }, muted: { color: "#64748b" },
};
