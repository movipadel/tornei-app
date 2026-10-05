import Image from "next/image";
import Link from "next/link";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { OperatorNavigation } from "@/components/operator/OperatorNavigation";
import { getCurrentOperator, getEffectiveOperatorPermissions } from "@/lib/operatorAuthorization";
import { OPERATOR_PERMISSIONS } from "@/lib/operatorPermissions";
import "./staff-shell.css";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const operator = await getCurrentOperator();
  const permissions = operator ? await getEffectiveOperatorPermissions(operator) : [];
  const allowed = new Set(permissions);
  const operationalItems = OPERATOR_PERMISSIONS.filter((item) => allowed.has(item.key));

  return (
    <div className="staff-shell" style={{ minHeight: "100dvh", background: "#020617", color: "white" }}>
      {operator ? (
        <header style={{ position: "sticky", top: 0, zIndex: 60, background: "rgba(3,7,18,0.88)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.075)" }}>
          <div style={{ maxWidth: "72rem", minHeight: 64, margin: "0 auto", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Link href="/staff" aria-label="Torna alla Dashboard operativa" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#ffffff", minHeight: 44 }}>
              <Image src="/home/movi-logo.png" alt="Movi" width={88} height={28} priority style={{ height: 28, width: "auto", objectFit: "contain", display: "block", opacity: 0.95 }} />
              <span className="staff-brand-label" style={{ fontWeight: 900, fontSize: 15, color: "rgba(255,255,255,0.92)", letterSpacing: -0.2, lineHeight: 1 }}>Area operativa</span>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {operationalItems.length > 0 ? <OperatorNavigation role={operator.role} operationalItems={operationalItems} /> : null}
              <AdminLogoutButton redirectTo="/staff/login" />
            </div>
          </div>
        </header>
      ) : null}
      <div>{children}</div>
    </div>
  );
}
