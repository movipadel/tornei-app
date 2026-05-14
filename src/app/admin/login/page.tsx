"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ScanLine } from "lucide-react";

type Mode = "admin" | "staff";

export default function AdminLoginPage() {
  const [mode, setMode] = useState<Mode>("admin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = useMemo(
    () => saving || !email.trim() || !password.trim(),
    [saving, email, password]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setError(null);
    setSaving(true);

    try {
      const endpoint = mode === "admin" ? "/api/admin/login" : "/api/staff/login";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        credentials: "include",
        body: new URLSearchParams({ email, password }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.error ||
            (mode === "admin" ? "Accesso admin non riuscito" : "Accesso staff non riuscito")
        );
      }

      window.location.href = mode === "admin" ? "/admin" : "/staff";
    } catch (e: any) {
      setError(e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
        color: "white",
      }}
    >
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 18,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 460,
            borderRadius: 28,
            padding: 20,
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "0 24px 70px rgba(0,0,0,0.34)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div
            style={{
              width: 58,
              height: 36,
              backgroundImage: "url('/home/movi-logo.png')",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "left center",
              opacity: 0.95,
            }}
          />

          <div
            style={{
              marginTop: 18,
              fontSize: 11,
              fontWeight: 750,
              color: "rgba(255,255,255,0.52)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Area riservata MOVI
          </div>

          <div
            style={{
              marginTop: 8,
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: -0.9,
              lineHeight: 1,
            }}
          >
            {mode === "admin" ? "Accesso admin" : "Accesso staff"}
          </div>

          <div
            style={{
              marginTop: 9,
              color: "rgba(255,255,255,0.60)",
              fontSize: 14,
              fontWeight: 560,
              lineHeight: 1.35,
            }}
          >
            {mode === "admin"
              ? "Accedi alla gestione completa dell'app MOVI."
              : "Accedi allo scanner QR e alle funzioni operative staff."}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginTop: 18,
              padding: 4,
              borderRadius: 18,
              background: "rgba(255,255,255,0.055)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode("admin");
                setError(null);
                setPassword("");
              }}
              style={{
                minHeight: 42,
                borderRadius: 14,
                border: 0,
                background:
                  mode === "admin"
                    ? "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)"
                    : "transparent",
                color: mode === "admin" ? "#ffffff" : "rgba(255,255,255,0.62)",
                fontWeight: 900,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <ShieldCheck className="w-4 h-4" />
              Admin
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("staff");
                setError(null);
                setPassword("");
              }}
              style={{
                minHeight: 42,
                borderRadius: 14,
                border: 0,
                background:
                  mode === "staff"
                    ? "linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)"
                    : "transparent",
                color: mode === "staff" ? "#ffffff" : "rgba(255,255,255,0.62)",
                fontWeight: 900,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <ScanLine className="w-4 h-4" />
              Staff
            </button>
          </div>

          <form
            onSubmit={submit}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginTop: 20,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 13,
                  fontWeight: 800,
                  marginBottom: 7,
                }}
              >
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                autoFocus
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 13,
                  fontWeight: 800,
                  marginBottom: 7,
                }}
              >
                Password
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                required
                style={inputStyle}
              />
            </div>

            {error ? (
              <div style={{ color: "#fb7185", fontSize: 13, fontWeight: 750 }}>
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={disabled}
              style={{
                minHeight: 48,
                borderRadius: 16,
                border: 0,
                background:
                  mode === "admin"
                    ? "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)"
                    : "linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)",
                color: "#ffffff",
                fontWeight: 900,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.7 : 1,
              }}
            >
              {saving
                ? "Accesso..."
                : mode === "admin"
                  ? "Accedi come admin"
                  : "Accedi come staff"}
            </button>

            <Link
              href="/"
              style={{
                minHeight: 42,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.09)",
                background: "rgba(255,255,255,0.035)",
                color: "rgba(255,255,255,0.72)",
                fontWeight: 800,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ← Torna alla home
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.07)",
  color: "#ffffff",
  padding: "0 13px",
  outline: "none",
  fontWeight: 650,
  fontSize: 16,
};