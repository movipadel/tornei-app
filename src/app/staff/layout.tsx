import Link from "next/link";
import { PackageCheck, ScanLine } from "lucide-react";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#020617",
        color: "white",
      }}
    >
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

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link
              href="/staff/rewards"
              style={{
                minHeight: 38,
                padding: "0 11px",
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
            <Link
              href="/staff/scanner"
              aria-label="Scanner QR"
              style={{ color: "white", display: "inline-flex", padding: 8 }}
            >
              <ScanLine size={19} />
            </Link>
            <AdminLogoutButton />
          </div>
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}
