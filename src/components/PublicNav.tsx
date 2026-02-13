"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trophy, Settings } from "lucide-react";
import AdminLoginDialog from "@/components/AdminLoginDialog";

export default function PublicNav() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  async function checkAdmin() {
    try {
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      setAdminAuthed(res.ok);
    } catch {
      setAdminAuthed(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkAdmin();
  }, []);

  async function goAdmin() {
    try {
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      if (res.ok) {
        window.location.href = "/admin/tournaments";
        return;
      }
      setLoginOpen(true);
    } catch {
      setLoginOpen(true);
    }
  }

  const gestioneStyle: React.CSSProperties = adminAuthed
    ? {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontWeight: 800,
        color: "#4338ca", // indigo-700
        background: "rgba(238,242,255,0.9)", // indigo-50
        border: "1px solid #c7d2fe", // indigo-200
        padding: "8px 12px",
        borderRadius: 999,
        cursor: "pointer",
      }
    : {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontWeight: 700,
        color: "#475569",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        padding: "8px 10px",
        borderRadius: 12,
      };

  return (
    <>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            maxWidth: "64rem",
            margin: "0 auto",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 800,
              color: "#0f172a",
              textDecoration: "none",
            }}
          >
            <Trophy className="w-5 h-5" style={{ color: "#4f46e5" }} />
            Tornei
          </Link>

          <button
            type="button"
            onClick={goAdmin}
            style={gestioneStyle}
            title={adminAuthed ? "Sei già loggato: vai in gestione" : "Gestione"}
          >
            <Settings className="w-4 h-4" />
            Gestione
            {/* piccolo indicatore discreto mentre controlla */}
            {checking ? (
              <span style={{ marginLeft: 2, color: "#94a3b8", fontWeight: 700 }}>…</span>
            ) : null}
          </button>
        </div>
      </nav>

      <AdminLoginDialog
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={async () => {
          setAdminAuthed(true);
          setLoginOpen(false);
          window.location.href = "/admin/tournaments";
        }}
      />
    </>
  );
}
