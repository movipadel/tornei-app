"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Settings } from "lucide-react";

export default function PublicNav() {
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

  function goAdmin() {
    window.location.href = adminAuthed ? "/admin" : "/admin/login";
  }

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(3,7,18,0.78)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.075)",
      }}
    >
      <div
        style={{
          maxWidth: "64rem",
          margin: "0 auto",
          padding: "10px 16px 7px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Link
          href="/"
          style={{
            minWidth: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "#ffffff",
          }}
        >
          <img
            src="/home/movi-logo.png"
            alt="Movi"
            style={{
              height: 28,
              width: "auto",
              objectFit: "contain",
              display: "block",
              opacity: 0.95,
            }}
          />

          <span
            style={{
              fontWeight: 900,
              fontSize: 15,
              color: "rgba(255,255,255,0.92)",
              letterSpacing: -0.2,
              lineHeight: 1,
            }}
          >
            Home
          </span>
        </Link>

        <button
          type="button"
          onClick={goAdmin}
          title={adminAuthed ? "Vai in admin" : "Accesso admin"}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(14px)",
            transition: "transform 160ms ease",
            color: adminAuthed ? "#c7d2fe" : "rgba(255,255,255,0.70)",
            background: adminAuthed
              ? "rgba(79,70,229,0.18)"
              : "rgba(255,255,255,0.055)",
            border: adminAuthed
              ? "1px solid rgba(129,140,248,0.25)"
              : "1px solid rgba(255,255,255,0.095)",
          }}
        >
          <Settings className="w-5 h-5" strokeWidth={1.7} />

          {checking ? (
            <span
              style={{
                position: "absolute",
                right: 6,
                top: 5,
                width: 5,
                height: 5,
                borderRadius: 999,
                background: "rgba(255,255,255,0.42)",
              }}
            />
          ) : null}
        </button>
      </div>

    </nav>
  );
}

