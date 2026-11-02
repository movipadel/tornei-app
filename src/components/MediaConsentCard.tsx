"use client";

import { useEffect, useState } from "react";

type State = { available: boolean; status: string; effective_at: string | null; adult_confirmed: boolean };
const labels: Record<string, string> = { granted: "Consentito", not_granted: "Non consentito", revoked: "Revocato", not_collected: "Non raccolto" };

export default function MediaConsentCard({ className }: { className?: string }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    const response = await fetch("/api/user/media-consent", { cache: "no-store" });
    const json = await response.json();
    if (response.ok) setState(json.data);
    else setError(json.error ?? "Consenso non disponibile");
  }
  useEffect(() => { void load(); }, []);
  async function change(status: "granted" | "not_granted" | "revoked") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/user/media-consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Consenso non registrato");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Consenso non registrato"); }
    finally { setBusy(false); }
  }
  return <section className={className} aria-labelledby="media-consent-title">
    <h2 id="media-consent-title">Uso di foto e video</h2>
    {state && !state.available ? <p>La gestione del consenso media sarà disponibile dopo l’aggiornamento del database.</p> : null}
    {!state || state.available ? <>
    <p>Autorizzi MOVI a usare foto e video in cui sei riconoscibile sui canali social e nei materiali promozionali. La scelta è facoltativa e revocabile.</p>
    <p>Stato: <strong>{state ? labels[state.status] ?? "Non raccolto" : "Caricamento…"}</strong>{state?.effective_at ? ` · ${new Date(state.effective_at).toLocaleDateString("it-IT")}` : ""}</p>
    {state && !state.adult_confirmed ? <p>Per concedere il consenso devi prima confermare di avere almeno 18 anni.</p> : null}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {state?.status !== "granted" ? <button type="button" style={{ minHeight: 44 }} disabled={busy || !state?.adult_confirmed} onClick={() => void change("granted")}>Concedi consenso</button> : null}
      {state?.status !== "not_granted" ? <button type="button" style={{ minHeight: 44 }} disabled={busy} onClick={() => void change("not_granted")}>Non consentire</button> : null}
      {state?.status === "granted" ? <button type="button" style={{ minHeight: 44 }} disabled={busy} onClick={() => void change("revoked")}>Revoca consenso</button> : null}
    </div>
    {error ? <p role="alert">{error}</p> : null}
    </> : null}
  </section>;
}
