import Link from "next/link";
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

          <AdminLogoutButton/>
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}