"use client";

import Link from "next/link";
import { useState } from "react";

type State = "lookup" | "found" | "password" | "sent" | "already_linked" | "multiple_profiles" | "name_mismatch" | "assistance_required" | "not_found" | "help_sent";
type Profile = { full_name: string; phone: string; email: string; moviback: boolean; tournaments: boolean };

async function post(path: string, body: Record<string, unknown> = {}) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Operazione non riuscita");
  return data;
}

export default function LegacyProfileActivation() {
  const [state, setState] = useState<State>("lookup");
  const [form, setForm] = useState({ full_name: "", phone: "", password: "", password_confirm: "" });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function lookup(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
    try {
      const data = await post("/api/auth/legacy-profile/lookup", form);
      setProfile(data.profile ?? null); setState(data.state as State);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Operazione non riuscita"); }
    finally { setBusy(false); }
  }
  async function activate(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
    try { await post("/api/auth/legacy-profile/activate", form); setState("sent"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Operazione non riuscita"); }
    finally { setBusy(false); }
  }
  async function help(kind?: string) {
    if (busy) return; setBusy(true); setMessage("");
    try { await post("/api/auth/legacy-profile/help", kind ? { kind } : {}); setState("help_sent"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Operazione non riuscita"); }
    finally { setBusy(false); }
  }
  function restart() { setState("lookup"); setProfile(null); setMessage(""); }

  return <main style={page}><section style={card}>
    <Link href="/accedi" style={back}>â† Torna allâ€™accesso</Link>
    {state === "lookup" && <>
      <h1 style={title}>Attiva il mio profilo</h1>
      <p style={copy}>Hai giÃ  giocato o partecipato ad attivitÃ  MOVI?</p>
      <form onSubmit={lookup} style={grid}>
        <Field label="Nome e cognome" value={form.full_name} autoComplete="name" onChange={(full_name) => setForm({ ...form, full_name })} />
        <Field label="Numero di telefono" value={form.phone} autoComplete="tel" inputMode="tel" onChange={(phone) => setForm({ ...form, phone })} />
        <button disabled={busy} style={primary}>{busy ? "Cerchiamoâ€¦" : "Cerca il mio profilo"}</button>
      </form>
    </>}
    {state === "found" && profile && <>
      <h1 style={title}>Abbiamo trovato il tuo profilo</h1>
      <div style={summary}><strong style={{ fontSize: 20 }}>{profile.full_name}</strong><span>Telefono: {profile.phone}</span><span>Email: {profile.email}</span>
        {profile.moviback && <span>MoviBack: profilo presente</span>}{profile.tournaments && <span>Tornei: storico presente</span>}</div>
      <button style={primary} onClick={() => setState("password")}>Ãˆ il mio profilo</button>
      <button style={secondary} onClick={restart}>Non Ã¨ il mio profilo</button>
      <p style={{ ...copy, marginTop: 20 }}>Non hai piÃ¹ accesso a questa email?</p>
      <button disabled={busy} style={linkButton} onClick={() => help("email_inaccessible")}>Chiedi aiuto a MOVI</button>
    </>}
    {state === "password" && <>
      <h1 style={title}>Crea la tua password</h1><p style={copy}>Invieremo una sola conferma allâ€™email del profilo.</p>
      <form onSubmit={activate} style={grid}>
        <Field label="Nuova password" type="password" autoComplete="new-password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
        <Field label="Conferma password" type="password" autoComplete="new-password" value={form.password_confirm} onChange={(password_confirm) => setForm({ ...form, password_confirm })} />
        <button disabled={busy} style={primary}>{busy ? "Invioâ€¦" : "Attiva il mio profilo"}</button>
      </form>
    </>}
    {state === "sent" && <><h1 style={title}>Controlla la tua email</h1><p style={copy}>Ti abbiamo inviato un link per confermare il nuovo accesso MOVI.</p>
      <button disabled={busy} style={secondary} onClick={async () => { setBusy(true); await post("/api/auth/legacy-profile/resend").catch(() => undefined); setMessage("Email inviata di nuovo."); setBusy(false); }}>Invia di nuovo</button></>}
    {state === "already_linked" && <><h1 style={title}>Il tuo nuovo accesso MOVI Ã¨ giÃ  attivo.</h1><Link style={linkPrimary} href="/accedi">Accedi</Link><Link style={linkSecondary} href="/password-dimenticata">Password dimenticata?</Link></>}
    {state === "multiple_profiles" && <><h1 style={title}>Abbiamo trovato piÃ¹ profili associati ai tuoi dati.</h1><p style={copy}>Li sistemiamo noi senza perdere punti, tornei o storico.</p><button disabled={busy} style={primary} onClick={() => help()}>Avvisa MOVI</button></>}
    {(state === "name_mismatch" || state === "assistance_required") && <><h1 style={title}>Serve il nostro aiuto</h1><p style={copy}>Non possiamo mostrare o collegare automaticamente il profilo con questi dati.</p>{state === "name_mismatch" && <button disabled={busy} style={primary} onClick={() => help()}>Chiedi aiuto a MOVI</button>}<button style={secondary} onClick={restart}>Controlla i dati</button></>}
    {state === "not_found" && <><h1 style={title}>Non abbiamo trovato un vecchio profilo con questi dati.</h1><button style={secondary} onClick={restart}>Controlla i dati</button><Link style={linkPrimary} href="/registrati">Non sono mai stato registrato â€” Crea nuovo profilo</Link></>}
    {state === "help_sent" && <><h1 style={title}>Richiesta inviata</h1><p style={copy}>MOVI controllerÃ  il problema senza modificare il tuo profilo.</p><Link style={linkPrimary} href="/accedi">Torna allâ€™accesso</Link></>}
    {message && <p role="status" style={notice}>{message}</p>}
  </section></main>;
}

function Field({ label, value, onChange, type = "text", autoComplete, inputMode }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }) {
  return <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>{label}<input required minLength={type === "password" ? 8 : undefined} style={input} type={type} inputMode={inputMode} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
const page: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "linear-gradient(135deg,#eef2ff,#f8fafc)" };
const card: React.CSSProperties = { width: "min(100%,520px)", background: "white", borderRadius: 22, padding: 24, boxShadow: "0 18px 55px rgba(15,23,42,.12)" };
const title: React.CSSProperties = { fontSize: 28, margin: "18px 0 8px" }; const copy: React.CSSProperties = { color: "#475569", lineHeight: 1.5 };
const grid: React.CSSProperties = { display: "grid", gap: 14 }; const input: React.CSSProperties = { minHeight: 48, border: "1px solid #cbd5e1", borderRadius: 12, padding: "0 12px", font: "inherit" };
const primary: React.CSSProperties = { width: "100%", minHeight: 50, border: 0, borderRadius: 13, background: "#4f46e5", color: "white", fontWeight: 900, marginTop: 10, cursor: "pointer" };
const secondary: React.CSSProperties = { ...primary, background: "white", color: "#4338ca", border: "1px solid #c7d2fe" }; const linkButton: React.CSSProperties = { border: 0, background: "transparent", color: "#4338ca", fontWeight: 850, cursor: "pointer" };
const linkPrimary: React.CSSProperties = { ...primary, display: "grid", placeItems: "center", textDecoration: "none", boxSizing: "border-box" }; const linkSecondary: React.CSSProperties = { ...linkPrimary, background: "white", color: "#4338ca", border: "1px solid #c7d2fe" };
const summary: React.CSSProperties = { display: "grid", gap: 8, padding: 16, borderRadius: 14, background: "#f8fafc", color: "#334155" }; const back: React.CSSProperties = { color: "#4338ca", fontWeight: 800 };
const notice: React.CSSProperties = { padding: 12, borderRadius: 10, background: "#eef2ff", color: "#312e81", fontWeight: 700 };
