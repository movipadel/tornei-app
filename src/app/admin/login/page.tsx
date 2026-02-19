"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = useMemo(() => saving || !password.trim(), [saving, password]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ password }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Password errata");

      window.location.href = "/admin/tournaments";
    } catch (e: any) {
      setError(e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="base44-bg">
      {/* Mobile-first: “sheet” centrata, su desktop diventa card */}
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "18px 18px 14px",
              paddingTop: "max(18px, env(safe-area-inset-top))",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", lineHeight: 1.15 }}>Accesso Gestione</div>
            <div style={{ marginTop: 6, color: "#64748b" }}>Inserisci la password per accedere alla gestione tornei.</div>
          </div>

          {/* Body */}
          <div
            className="base44-card"
            style={{
              flex: 1,
              borderRadius: 0,
              borderLeft: 0,
              borderRight: 0,
              boxShadow: "none",
              overflow: "hidden",
            }}
          >
            {/* su desktop torna “card” */}
            <div
              className="base44-card-inner"
              style={{
                padding: 18,
              }}
            >
              <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontWeight: 800, color: "#334155" }}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="base44-input"
                    placeholder="••••••••"
                    autoFocus
                    required
                    // extra safety iOS zoom
                    style={{ fontSize: 16 }}
                  />
                  {error ? <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600 }}>{error}</div> : null}
                </div>

                <button className="base44-primary-btn" type="submit" disabled={disabled} style={{ opacity: disabled ? 0.75 : 1 }}>
                  {saving ? "Accesso..." : "Accedi"}
                </button>

                <Link href="/" className="base44-csv-btn" style={{ display: "inline-flex", justifyContent: "center" }}>
                  ← Torna alle iscrizioni
                </Link>
              </form>
            </div>
          </div>

          {/* Footer safe area */}
          <div
            style={{
              height: "calc(10px + env(safe-area-inset-bottom))",
            }}
          />
        </div>
      </div>

      {/* Desktop polish: centra e arrotonda */}
      <style>{`
        @media (min-width: 640px) {
          .base44-card {
            border-radius: 16px !important;
            border-left: 1px solid #e2e8f0 !important;
            border-right: 1px solid #e2e8f0 !important;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06) !important;
          }
        }
      `}</style>
    </div>
  );
}
