"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Mode = "login" | "activate" | "signup" | "forgot" | "reset";

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
  const [verified, setVerified] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean>>({ gender: "M" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isVerified = new URLSearchParams(window.location.search).get("verified") === "1";
    setVerified(isVerified);
    if (mode === "signup" && isVerified) {
      setBusy(true);
      post("/api/auth/signup/finalize")
        .then((data) => setMessage(stateMessage(String(data.state ?? ""))))
        .catch((error: Error) => setMessage(error.message))
        .finally(() => setBusy(false));
    }
  }, [mode]);

  const set = (name: string, value: string | boolean) => setForm((old) => ({ ...old, [name]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        await post("/api/auth/login", form);
        window.location.href = "/";
        return;
      }
      if (mode === "forgot") {
        const data = await post("/api/auth/password-reset/request", form);
        setMessage(String(data.message ?? "Controlla la tua email."));
      } else if (mode === "reset") {
        await post("/api/auth/password-reset/complete", form);
        setMessage("Password aggiornata. Ora puoi accedere.");
      } else if (mode === "activate" && verified) {
        const data = await post("/api/auth/activation/complete", form);
        setMessage(stateMessage(String(data.state ?? "")));
      } else if (mode === "activate") {
        const data = await post("/api/auth/activation/request", form);
        setMessage(String(data.message ?? "Controlla la tua email."));
      } else {
        const data = await post("/api/auth/signup", form);
        setMessage(String(data.message ?? "Controlla la tua email."));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  const passwordStep = mode === "reset" || (mode === "activate" && verified);

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <Link href="/" style={{ color: "#4338ca", fontWeight: 800 }}>← MOVI</Link>
        <h1 style={{ fontSize: 28, margin: "16px 0 6px" }}>{title(mode)}</h1>
        <p style={{ color: "#475569", marginTop: 0 }}>{subtitle(mode, verified)}</p>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          {mode === "signup" && !verified && (
            <>
              <Field label="Nome e cognome" value={form.full_name} onChange={(v) => set("full_name", v)} />
              <Field label="Telefono mobile" value={form.phone} onChange={(v) => set("phone", v)} />
              <label style={labelStyle}>Genere
                <select style={inputStyle} value={String(form.gender)} onChange={(e) => set("gender", e.target.value)}>
                  <option value="M">Uomo</option><option value="F">Donna</option>
                </select>
              </label>
            </>
          )}
          {!passwordStep && !verified && <Field label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} />}
          {(mode === "login" || mode === "signup" || passwordStep) && !verified && mode !== "activate" && (
            <Field label="Password" type="password" value={form.password} onChange={(v) => set("password", v)} />
          )}
          {(mode === "signup" || mode === "reset" || (mode === "activate" && verified)) && (
            <>
              {mode !== "signup" && <Field label="Nuova password" type="password" value={form.password} onChange={(v) => set("password", v)} />}
              <Field label="Conferma password" type="password" value={form.password_confirm} onChange={(v) => set("password_confirm", v)} />
            </>
          )}
          {mode === "signup" && !verified && (
            <>
              <Check label="Accetto la Privacy Policy" checked={form.privacy_accepted} onChange={(v) => set("privacy_accepted", v)} />
              <Check label="Accetto i Termini di utilizzo" checked={form.terms_accepted} onChange={(v) => set("terms_accepted", v)} />
              <Check label="Confermo di avere almeno 18 anni" checked={form.age_confirmed} onChange={(v) => set("age_confirmed", v)} />
              <Check label="Acconsento alle comunicazioni marketing" checked={form.marketing_accepted} onChange={(v) => set("marketing_accepted", v)} />
            </>
          )}
          {!(mode === "signup" && verified) && (
            <button disabled={busy} style={buttonStyle}>{busy ? "Attendi…" : action(mode, verified)}</button>
          )}
        </form>
        {message && <p role="status" style={messageStyle}>{message}</p>}
        <nav style={{ display: "grid", gap: 7, marginTop: 18, fontSize: 14 }}>
          {mode !== "login" && <Link href="/accedi">Nuovo accesso con email e password</Link>}
          {mode !== "activate" && <Link href="/attiva-account">Attiva il nuovo accesso MOVI</Link>}
          {mode !== "signup" && <Link href="/registrati">Crea un nuovo account</Link>}
          {mode === "login" && <Link href="/password-dimenticata">Password dimenticata</Link>}
          <Link href="/">Accesso precedente (temporaneo)</Link>
        </nav>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: unknown; onChange: (v: string) => void; type?: string }) {
  return <label style={labelStyle}>{label}<input required style={inputStyle} type={type} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} minLength={type === "password" ? 8 : undefined} /></label>;
}

function Check({ label, checked, onChange }: { label: string; checked: unknown; onChange: (v: boolean) => void }) {
  return <label style={{ display: "flex", gap: 8, fontSize: 14 }}><input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} required={!label.includes("marketing")} />{label}</label>;
}

function title(mode: Mode) {
  return mode === "login" ? "Accedi" : mode === "activate" ? "Attiva il nuovo accesso MOVI" : mode === "signup" ? "Crea il tuo account MOVI" : mode === "forgot" ? "Password dimenticata" : "Imposta una nuova password";
}
function subtitle(mode: Mode, verified: boolean) {
  if (mode === "activate") return verified ? "Email verificata. Scegli una password per collegare il profilo esistente." : "Verifica l'email già associata al tuo profilo MOVI.";
  if (mode === "signup" && verified) return "Email verificata: stiamo creando il profilo in modo sicuro.";
  return mode === "signup" ? "La registrazione sarà completata solo dopo la verifica email." : "Le risposte email non rivelano se un account esiste.";
}
function action(mode: Mode, verified: boolean) {
  if (mode === "login") return "Accedi";
  if (mode === "activate") return verified ? "Crea password e collega profilo" : "Invia email di verifica";
  if (mode === "signup") return "Registrati";
  if (mode === "forgot") return "Invia link di recupero";
  return "Aggiorna password";
}
function stateMessage(state: string) {
  if (state === "linked") return "Operazione completata. Il tuo profilo MOVI è pronto.";
  if (state === "review_required") return "Abbiamo trovato più profili. È necessaria una verifica manuale; nessun profilo è stato unito.";
  if (state === "no_profile") return "Non esiste un profilo associabile. Puoi creare un nuovo account.";
  if (state === "conflict") return "Esiste già un profilo con questi dati. Usa l'attivazione dell'account esistente.";
  return "La richiesta non può essere completata in questo momento.";
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "linear-gradient(135deg,#eef2ff,#f8fafc)" };
const cardStyle: React.CSSProperties = { width: "min(100%,520px)", background: "white", borderRadius: 22, padding: 26, boxShadow: "0 18px 55px rgba(15,23,42,.12)" };
const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontWeight: 700, fontSize: 14 };
const inputStyle: React.CSSProperties = { minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 12px", font: "inherit" };
const buttonStyle: React.CSSProperties = { minHeight: 46, border: 0, borderRadius: 12, background: "#4f46e5", color: "white", fontWeight: 850, cursor: "pointer" };
const messageStyle: React.CSSProperties = { padding: 12, borderRadius: 10, background: "#eef2ff", color: "#312e81", fontWeight: 650 };
