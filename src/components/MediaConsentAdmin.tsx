"use client";

import { useEffect, useState } from "react";

export type MediaConsentState = { status: string; effective_at: string | null; source: string | null };
const labels: Record<string, string> = { granted: "Consentito", not_granted: "Non consentito", revoked: "Revocato", not_collected: "Non raccolto" };

export default function MediaConsentAdmin({ userId, state, available, onSaved }: { userId: string; state: MediaConsentState; available: boolean; onSaved: () => Promise<void> }) {
  const [source, setSource] = useState<"admin_assisted" | "paper_import">("admin_assisted");
  const [confirmed, setConfirmed] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    void fetch("/api/staff/me", { cache: "no-store" }).then(response => response.ok ? response.json() : null)
      .then(data => setCanEdit(data?.role === "admin")).catch(() => setCanEdit(false));
  }, []);
  async function record(status: "granted" | "not_granted" | "revoked") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/users/${userId}/media-consent`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, source, confirmed, evidence_reference: evidence, notes }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Consenso non registrato");
      setConfirmed(false); setEvidence(""); setNotes("");
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Consenso non registrato"); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="admin-media-consent-title" style={{ display: "grid", gap: 10 }}>
    <h3 id="admin-media-consent-title">Uso di foto e video</h3>
    {!available ? <p>La gestione del consenso media sarà disponibile dopo l’aggiornamento del database.</p> : null}
    {available ? <>
    <p>Media: <strong>{labels[state.status] ?? "Non raccolto"}</strong>{state.effective_at ? ` · ${new Date(state.effective_at).toLocaleDateString("it-IT")}` : ""}{state.source ? ` · ${state.source}` : ""}</p>
    {canEdit ? <>
    <label>Fonte<select value={source} onChange={event => setSource(event.target.value as "admin_assisted" | "paper_import")}><option value="admin_assisted">Raccolto da Admin</option><option value="paper_import">Modulo cartaceo</option></select></label>
    <label>Riferimento prova<input value={evidence} onChange={event => setEvidence(event.target.value)} /></label>
    <label>Nota / motivo<input value={notes} onChange={event => setNotes(event.target.value)} /></label>
    <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Confermo di aver raccolto il consenso</label>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      <button type="button" style={{ minHeight: 44 }} disabled={busy || !confirmed || (!evidence.trim() && !notes.trim())} onClick={() => void record("granted")}>Registra consenso</button>
      <button type="button" style={{ minHeight: 44 }} disabled={busy} onClick={() => void record("not_granted")}>Non consentito</button>
      <button type="button" style={{ minHeight: 44 }} disabled={busy || !notes.trim()} onClick={() => void record("revoked")}>Revoca</button>
    </div>
    </> : null}
    {error ? <p role="alert">{error}</p> : null}
    </> : null}
  </section>;
}
