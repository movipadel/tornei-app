"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Migration = { status: string; activation_available: boolean; message?: string };

export default function ProgressiveAuthPrompt() {
  const pathname = usePathname();
  const [migration, setMigration] = useState<Migration | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/staff") || pathname === "/attiva-account" || pathname === "/accedi") return;
    let active = true;
    const load = () => fetch("/api/user/me", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (active) setMigration(data?.migration ?? null); })
      .catch(() => undefined);
    void load();
    window.addEventListener("movi:user-session-changed", load);
    return () => { active = false; window.removeEventListener("movi:user-session-changed", load); };
  }, [pathname]);

  if (!migration || migration.status === "linked") return null;

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

  return <aside aria-live="polite" style={shell}>
    <div><strong>{migration.status === "review_required" ? "Ci pensiamo noi" : "Attiva il nuovo accesso"}</strong>
      <p style={{ margin: "4px 0 0", fontSize: 13 }}>{migration.message ?? "Userai email e password senza perdere nulla del tuo profilo."}</p>
    </div>
    {migration.activation_available && <button type="button" onClick={activate} disabled={busy} style={button}>
      {busy ? "Attendi…" : "Continua"}
    </button>}
  </aside>;
}

const shell: React.CSSProperties = {
  position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 70, margin: "0 auto", maxWidth: 760,
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap",
  padding: "14px 16px", borderRadius: 16, color: "#1e1b4b", background: "#eef2ff",
  border: "1px solid #c7d2fe", boxShadow: "0 16px 45px rgba(15,23,42,.18)",
};
const button: React.CSSProperties = { minHeight: 42, border: 0, borderRadius: 10, padding: "0 15px", background: "#4f46e5", color: "white", fontWeight: 800, cursor: "pointer" };
