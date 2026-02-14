import Link from "next/link";
import { Trophy, LogOut } from "lucide-react";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="base44-bg">
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 60,
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "10px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link
              href="/admin/tournaments"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 800,
                color: "#0f172a",
                textDecoration: "none",
              }}
              title="Gestione Tornei"
            >
              <Trophy className="w-5 h-5" style={{ color: "#4f46e5" }} />
              Tornei
            </Link>

            <div style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
              <Link
                href="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 700,
                  color: "#475569",
                  textDecoration: "none",
                }}
                title="Vai alla pagina iscrizioni"
              >
                Iscrizioni
              </Link>

            <AdminLogoutButton />

            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "24px 16px 40px" }}>
        {children}
      </div>
    </div>
  );
}
