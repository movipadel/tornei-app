"use client";

import { useState } from "react";
import Link from "next/link";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      <div style={{ maxWidth: "520px", margin: "0 auto", padding: "56px 16px" }}>
        <div className="base44-card">
          <div className="base44-card-inner">
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Accesso Gestione</div>
            <div style={{ marginTop: 6, color: "#64748b" }}>
              Inserisci la password per accedere alla gestione tornei.
            </div>

            <form onSubmit={submit} style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 700, color: "#334155" }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="base44-input"
                  placeholder="••••••••"
                  autoFocus
                  required
                />
                {error ? <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div> : null}
              </div>

              <button className="base44-primary-btn" type="submit" disabled={saving} style={{ opacity: saving ? 0.75 : 1 }}>
                {saving ? "Accesso..." : "Accedi"}
              </button>

              <div style={{ marginTop: 6, textAlign: "center" }}>
                <Link href="/" className="base44-csv-btn" style={{ display: "inline-block" }}>
                  ← Torna alle iscrizioni
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
