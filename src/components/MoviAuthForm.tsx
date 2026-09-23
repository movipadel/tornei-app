"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Mode = "login" | "activate" | "signup" | "forgot" | "reset";
type Result = "review" | "conflict" | "no-profile" | null;

async function post(path: string, body: Record<string, unknown> = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error ?? "Operazione non riuscita"));
  return data;
}

export default function MoviAuthForm({ mode }: { mode: Mode }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [legacyVerified, setLegacyVerified] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [emailLocked, setEmailLocked] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean>>({ gender: "M" });

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const isLegacyVerified = query.get("verified") === "1";
    const queryResult = query.get("result");
    setLegacyVerified(isLegacyVerified);
    setResult(queryResult === "review" || queryResult === "conflict" || queryResult === "no-profile" ? queryResult : null);

    if (mode === "activate" && !isLegacyVerified && !queryResult) {
      fetch("/api/user/me", { cache: "no-store" })
        .then(async (response) => response.ok ? response.json() : null)
        .then((data) => {
          const email = typeof data?.user?.email === "string" ? data.user.email : "";
          if (email) {
            setForm((old) => ({ ...old, email }));
            setEmailLocked(true);
          }
        })
        .catch(() => undefined);
    }

    // Compatibility only: users already on the pre-hotfix verified URL can resume.
    // New signups are finalized by /auth/callback and never see this step.
    if (mode === "signup" && isLegacyVerified) {
      setBusy(true);
      post("/api/auth/signup/finalize")
        .then((data) => finishCompatibility("signup", String(data.state ?? "")))
        .catch(() => setResult("conflict"))
        .finally(() => setBusy(false));
    }
  }, [mode]);

  const set = (name: string, value: string | boolean) => setForm((old) => ({ ...old, [name]: value }));

  function finishCompatibility(flow: "activation" | "signup", state: string) {
    if (state === "linked") {
      window.location.replace(flow === "activation" ? "/?auth=activated" : "/?auth=registered");
      return;
    }
    setResult(state === "review_required" ? "review" : state === "no_profile" ? "no-profile" : "conflict");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        await post("/api/auth/login", form);
        window.location.href = "/";
        return;
      }
      if (mode === "forgot") {
        await post("/api/auth/password-reset/request", form);
        setSent(true);
      } else if (mode === "reset") {
        await post("/api/auth/password-reset/complete", form);
        setMessage("Password aggiornata. Ora puoi accedere.");
      } else if (mode === "activate" && legacyVerified) {
        const data = await post("/api/auth/activation/complete", form);
        finishCompatibility("activation", String(data.state ?? ""));
      } else if (mode === "activate") {
        await post("/api/auth/activation/request", form);
        setSent(true);
      } else {
        await post("/api/auth/signup", form);
        setSent(true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await post("/api/auth/resend", { email: form.email, flow: mode === "activate" ? "activation" : "signup" });
      setMessage("Email inviata di nuovo.");
    } catch {
      setMessage("Riprova tra poco.");
    } finally {
      setBusy(false);
    }
  }

  if (result) return <ResultCard result={result} />;

  if (sent) {
    const canResend = mode === "activate" || mode === "signup";
    return <Shell>
      <h1 style={headingStyle}>Controlla la tua email</h1>
      <p style={copyStyle}>Ti abbiamo inviato un link a <strong>{maskEmail(String(form.email ?? ""))}</strong>. Aprilo per confermare l’indirizzo e completare l’accesso MOVI.</p>
      {canResend && <button type="button" disabled={busy} onClick={resend} style={secondaryButtonStyle}>
        {busy ? "Invio…" : "Non hai ricevuto l’email? Invia di nuovo"}
      </button>}
      {message && <p role="status" style={messageStyle}>{message}</p>}
    </Shell>;
  }

  const passwordStep = mode === "reset" || (mode === "activate" && legacyVerified);
  return <Shell>
    <h1 style={headingStyle}>{title(mode)}</h1>
    <p style={copyStyle}>{subtitle(mode, legacyVerified)}</p>
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      {mode === "signup" && !legacyVerified && <>
        <Field name="full_name" autoComplete="name" label="Nome e cognome" value={form.full_name} onChange={(v) => set("full_name", v)} />
        <Field name="phone" autoComplete="tel" inputMode="tel" label="Telefono" value={form.phone} onChange={(v) => set("phone", v)} />
        <label style={labelStyle}>Genere
          <select name="gender" style={inputStyle} value={String(form.gender)} onChange={(e) => set("gender", e.target.value)}>
            <option value="M">Uomo</option><option value="F">Donna</option>
          </select>
        </label>
      </>}
      {!passwordStep && !legacyVerified && <Field name="email" autoComplete="email" label="Email" type="email" readOnly={emailLocked} value={form.email} onChange={(v) => set("email", v)} />}
      {(mode === "login" || mode === "signup" || mode === "activate" || passwordStep) && !(mode === "signup" && legacyVerified) && <Field
        name="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        label={mode === "login" ? "Password" : "Nuova password"}
        type="password"
        value={form.password}
        onChange={(v) => set("password", v)}
      />}
      {(mode === "signup" || mode === "activate" || mode === "reset") && !(mode === "signup" && legacyVerified) && <Field
        name="password_confirm"
        autoComplete="new-password"
        label="Conferma password"
        type="password"
        value={form.password_confirm}
        onChange={(v) => set("password_confirm", v)}
      />}
      {mode === "signup" && !legacyVerified && <>
        <Check name="privacy_accepted" label="Accetto la Privacy Policy" checked={form.privacy_accepted} onChange={(v) => set("privacy_accepted", v)} />
        <Check name="terms_accepted" label="Accetto i Termini di utilizzo" checked={form.terms_accepted} onChange={(v) => set("terms_accepted", v)} />
        <Check name="age_confirmed" label="Confermo di avere almeno 18 anni" checked={form.age_confirmed} onChange={(v) => set("age_confirmed", v)} />
        <Check name="marketing_accepted" label="Acconsento alle comunicazioni marketing" checked={form.marketing_accepted} onChange={(v) => set("marketing_accepted", v)} optional />
      </>}
      {!(mode === "signup" && legacyVerified) && <button disabled={busy} style={buttonStyle}>{busy ? "Attendi…" : action(mode, legacyVerified)}</button>}
    </form>
    {message && <p role="status" style={messageStyle}>{message}</p>}
    <AuthLinks mode={mode} />
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main style={pageStyle}><section style={cardStyle}>
    <Link href="/" style={{ color: "#4338ca", fontWeight: 800 }}>← MOVI</Link>
    {children}
  </section></main>;
}

function ResultCard({ result }: { result: Exclude<Result, null> }) {
  const review = result === "review";
  const noProfile = result === "no-profile";
  return <Shell>
    <h1 style={headingStyle}>{review ? "Ci pensiamo noi" : noProfile ? "Profilo non trovato" : "Serve il nostro aiuto"}</h1>
    <p style={copyStyle}>{review
      ? "Abbiamo trovato più profili associati ai tuoi dati. Li sistemiamo noi senza perdere punti, tornei o storico."
      : noProfile
        ? "Non abbiamo trovato un profilo da collegare. Puoi creare un nuovo account MOVI."
        : "Non siamo riusciti a completare automaticamente il nuovo accesso. Il tuo profilo e i tuoi dati restano invariati. Contatta MOVI e lo sistemiamo."}</p>
    <Link href={noProfile ? "/registrati" : "/"} style={linkButtonStyle}>{noProfile ? "Crea un account" : "Torna all’app"}</Link>
  </Shell>;
}

function AuthLinks({ mode }: { mode: Mode }) {
  if (mode === "login") return <nav style={navStyle}>
    <Link href="/password-dimenticata">Password dimenticata?</Link>
    <Link href="/registrati">Crea un account</Link>
    <Link href="/accesso-precedente">Usa l’accesso precedente</Link>
  </nav>;
  if (mode === "signup") return <nav style={navStyle}><Link href="/accedi">Hai già un account? Accedi</Link></nav>;
  if (mode === "forgot" || mode === "reset") return <nav style={navStyle}><Link href="/accedi">Torna all’accesso</Link></nav>;
  return null;
}

function Field({ label, value, onChange, name, type = "text", autoComplete, inputMode, readOnly = false }: {
  label: string; value: unknown; onChange: (v: string) => void; name: string; type?: string;
  autoComplete?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; readOnly?: boolean;
}) {
  return <label style={labelStyle}>{label}<input required name={name} style={{ ...inputStyle, background: readOnly ? "#f1f5f9" : "white" }} type={type} inputMode={inputMode} autoComplete={autoComplete} readOnly={readOnly} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} minLength={type === "password" ? 8 : undefined} /></label>;
}

function Check({ label, checked, onChange, name, optional = false }: { label: string; checked: unknown; onChange: (v: boolean) => void; name: string; optional?: boolean }) {
  return <label style={{ display: "flex", gap: 8, fontSize: 14 }}><input name={name} type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} required={!optional} />{label}</label>;
}

function title(mode: Mode) {
  return mode === "login" ? "Accedi a MOVI" : mode === "activate" ? "Attiva il nuovo accesso" : mode === "signup" ? "Crea il tuo accesso MOVI" : mode === "forgot" ? "Password dimenticata" : "Imposta una nuova password";
}
function subtitle(mode: Mode, legacyVerified: boolean) {
  if (mode === "activate") return legacyVerified ? "Scegli la password per completare il link che hai già aperto." : "Userai email e password senza perdere nulla del tuo profilo.";
  if (mode === "login") return "Inserisci email e password.";
  if (mode === "signup") return "Ti servirà per ritrovare sempre punti, tornei e attività.";
  if (mode === "forgot") return "Inserisci la tua email e ti invieremo un link.";
  return "Scegli la nuova password.";
}
function action(mode: Mode, legacyVerified: boolean) {
  if (mode === "login") return "Accedi";
  if (mode === "activate") return legacyVerified ? "Completa l’attivazione" : "Continua";
  if (mode === "signup") return "Registrati";
  if (mode === "forgot") return "Invia link";
  return "Aggiorna password";
}
function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "il tuo indirizzo";
  return `${name.slice(0, 1)}${"•".repeat(Math.min(Math.max(name.length - 1, 2), 5))}@${domain}`;
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "linear-gradient(135deg,#eef2ff,#f8fafc)" };
const cardStyle: React.CSSProperties = { width: "min(100%,520px)", background: "white", borderRadius: 22, padding: 24, boxShadow: "0 18px 55px rgba(15,23,42,.12)" };
const headingStyle: React.CSSProperties = { fontSize: 28, margin: "16px 0 6px" };
const copyStyle: React.CSSProperties = { color: "#475569", margin: "0 0 18px", lineHeight: 1.5 };
const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontWeight: 700, fontSize: 14 };
const inputStyle: React.CSSProperties = { minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 12px", font: "inherit" };
const buttonStyle: React.CSSProperties = { minHeight: 46, border: 0, borderRadius: 12, background: "#4f46e5", color: "white", fontWeight: 850, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { minHeight: 44, width: "100%", border: "1px solid #c7d2fe", borderRadius: 12, background: "white", color: "#4338ca", fontWeight: 800, cursor: "pointer" };
const linkButtonStyle: React.CSSProperties = { minHeight: 46, display: "grid", placeItems: "center", borderRadius: 12, background: "#4f46e5", color: "white", fontWeight: 850, textDecoration: "none" };
const messageStyle: React.CSSProperties = { padding: 12, borderRadius: 10, background: "#eef2ff", color: "#312e81", fontWeight: 650 };
const navStyle: React.CSSProperties = { display: "grid", gap: 8, marginTop: 18, fontSize: 14 };
