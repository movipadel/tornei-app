import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="base44-bg" style={{ minHeight: "100vh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 60,
          background: "rgba(3,7,18,0.78)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.075)",
        }}
      >
        <div
          style={{
            maxWidth: "72rem",
            margin: "0 auto",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Link
            href="/admin"
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
              Dashboard
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Link
              href="/admin/moviback/redemptions"
              style={{
                minHeight: 38,
                padding: "0 12px",
                borderRadius: 999,
                border: "1px solid rgba(245,158,11,0.24)",
                background: "rgba(245,158,11,0.10)",
                color: "#fde68a",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontSize: 13,
                fontWeight: 850,
              }}
            >
              <PackageCheck size={16} />
              <span>Richieste premio</span>
            </Link>
            <AdminLogoutButton />
          </div>
        </div>
      </div>

      <div
        style={{
          maxWidth: "72rem",
          margin: "0 auto",
          padding: "22px 16px 40px",
        }}
      >
        {children}
      </div>
    </div>
  );
}
