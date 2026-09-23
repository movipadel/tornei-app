"use client";

import Link from "next/link";
import { useState } from "react";

export type LegacyUser = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  gender: "M" | "F";
  privacy_accepted_at?: string | null;
  terms_accepted_at?: string | null;
  age_confirmed_at?: string | null;
  marketing_accepted?: boolean | null;
  marketing_accepted_at?: string | null;
};

export default function LegacyAccessForm({ onSaved }: { onSaved?: (user: LegacyUser) => void }) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; redirect?: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult({ message: String(data.error ?? "Accesso non disponibile"), redirect: data.redirect_to });
        return;
      }
      window.dispatchEvent(new Event("movi:user-session-changed"));
      onSaved?.(data.user as LegacyUser);
      if (!onSaved) window.location.href = "/";
    } catch {
      setResult({ message: "Accesso temporaneamente non disponibile" });
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
    <label style={labelStyle}>Telefono
      <input className="base44-input" inputMode="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} />
    </label>
    <label style={labelStyle}>Email
      <input className="base44-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
    </label>
    <button className="base44-primary-btn" type="submit" disabled={busy} style={{ minHeight: 46, opacity: busy ? .7 : 1 }}>
      {busy ? "Verifica…" : "Accedi temporaneamente"}
    </button>
    {result && <div role="status" style={messageStyle}>
      <span>{result.message}</span>
      {result.redirect && <Link href={result.redirect} style={{ fontWeight: 850 }}>
        {result.redirect === "/registrati" ? "Registrati con il nuovo accesso MOVI" : "Vai all’accesso email e password"}
      </Link>}
    </div>}
  </form>;
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontWeight: 750, fontSize: 14 };
const messageStyle: React.CSSProperties = { display: "grid", gap: 7, padding: 11, borderRadius: 10, background: "#fff7ed", color: "#9a3412", fontSize: 13 };
