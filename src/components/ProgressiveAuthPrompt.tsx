"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Migration = { status: string; activation_available: boolean; message?: string };
const DISMISS_KEY = "movi:legacy-access-reminder-dismissed";

export default function ProgressiveAuthPrompt() {
  const pathname = usePathname();
  const [migration, setMigration] = useState<Migration | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const resumeAttempted = useRef(false);

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/staff") || pathname.startsWith("/dev/") || pathname === "/attiva-account" || pathname === "/accedi") return;
    setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
    let active = true;
    const load = () => fetch("/api/user/me", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then(async (data) => {
        if (!active) return;
        if (data?.onboarding?.resume_available && !resumeAttempted.current) {
          resumeAttempted.current = true;
          const response = await fetch("/api/auth/onboarding/resume", { method: "POST" });
          const result = await response.json().catch(() => ({}));
          if (!active) return;
          if (response.ok && result.state === "linked") {
            window.location.reload();
            return;
          }
          if (response.ok && result.state === "review_required") {
            setMigration({
              status: "review_required",
              activation_available: false,
              message: "Abbiamo trovato più profili associati ai tuoi dati. Li sistemiamo noi senza perdere punti, tornei o storico.",
            });
            return;
          }
          if (response.ok && result.state === "conflict") {
            setMigration({
              status: "conflict",
              activation_available: false,
              message: "Il tuo profilo resta invariato. Contatta MOVI e lo sistemiamo.",
            });
            return;
          }
        }
        setMigration(data?.migration ?? null);
      })
      .catch(() => undefined);
    void load();
    const sessionChanged = () => {
      window.sessionStorage.removeItem(DISMISS_KEY);
      setDismissed(false);
      void load();
    };
    window.addEventListener("movi:user-session-changed", sessionChanged);
    return () => { active = false; window.removeEventListener("movi:user-session-changed", sessionChanged); };
  }, [pathname]);

  if (!migration?.activation_available || migration.status === "linked" || dismissed) return null;

  function dismiss() {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  async function activate() {
    setBusy(true);
    try {
      const response = await fetch("/api/user/activation/start", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.redirect_to) window.location.href = data.redirect_to;
      else setMigration((old) => old ? { ...old, activation_available: false, status: String(data.status ?? "conflict") } : old);
    } finally {
      setBusy(false);
    }
  }

  const publicShellOffset = !pathname.startsWith("/admin") && !pathname.startsWith("/staff") && !["/accedi", "/registrati", "/attiva-account", "/accesso-precedente", "/password-dimenticata", "/reset-password"].includes(pathname) && !pathname.startsWith("/riscatto-premio/");

  return <aside aria-live="polite" aria-label="Attiva il nuovo accesso MOVI" style={{ ...shell, bottom: publicShellOffset ? "calc(80px + env(safe-area-inset-bottom))" : 16 }}>
    <div><strong>MOVI ha un nuovo sistema di accesso.</strong>
      <p style={{ margin: "4px 0 0", fontSize: 13 }}>{migration.message ?? "Il tuo profilo esiste già. Non devi registrarti di nuovo: dati, attività e MoviBack restano disponibili. Devi solo attivare il nuovo accesso per evitare problemi futuri."}</p>
    </div>
    <div style={actions}>
      <button type="button" onClick={activate} disabled={busy} style={button}>{busy ? "Attendi…" : "Attiva ora il mio profilo"}</button>
      <button type="button" onClick={dismiss} disabled={busy} style={secondaryButton}>Lo farò più tardi</button>
    </div>
  </aside>;
}

const shell: React.CSSProperties = {
  position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 70, margin: "0 auto", maxWidth: 760,
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap",
  padding: "14px 16px", borderRadius: 16, color: "#1e1b4b", background: "#eef2ff",
  border: "1px solid #c7d2fe", boxShadow: "0 16px 45px rgba(15,23,42,.18)",
};
const button: React.CSSProperties = { minHeight: 42, border: 0, borderRadius: 10, padding: "0 15px", background: "#4f46e5", color: "white", fontWeight: 800, cursor: "pointer" };
const actions: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const secondaryButton: React.CSSProperties = { ...button, border: "1px solid #a5b4fc", background: "white", color: "#3730a3" };
