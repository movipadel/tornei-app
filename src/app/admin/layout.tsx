import Image from "next/image";
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { AdminAreaScope } from "@/components/admin/AdminAreaScope";
import { AdminThemeSelector } from "@/components/admin/AdminThemeSelector";
import { OperatorNavigation } from "@/components/operator/OperatorNavigation";
import { getCurrentOperator, getEffectiveOperatorPermissions } from "@/lib/operatorAuthorization";
import { ADMIN_ONLY_NAVIGATION, OPERATOR_PERMISSIONS } from "@/lib/operatorPermissions";
import "./admin-ui.css";

const adminThemeBootstrap = `(()=>{try{const r=document.currentScript?.parentElement;if(!r)return;const k="movi-admin-theme-v1";const v=localStorage.getItem(k);const m=v==="light"||v==="dark"||v==="system"?v:"system";const d=matchMedia("(prefers-color-scheme: dark)").matches;r.dataset.adminThemeMode=m;r.dataset.adminTheme=m==="system"?(d?"dark":"light"):m}catch{}})();`;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const operator = await getCurrentOperator();
  const permissions = operator ? await getEffectiveOperatorPermissions(operator) : [];
  const allowed = new Set(permissions);
  const operationalItems = OPERATOR_PERMISSIONS.filter((item) => allowed.has(item.key));
  const isAdmin = operator?.role === "admin";
  return (
    <AdminAreaScope>
      <script dangerouslySetInnerHTML={{ __html: adminThemeBootstrap }} />
      <div className="admin-shell">
        <header className="admin-topbar">
          <div className="admin-topbar__inner">
            <Link href={isAdmin ? "/admin" : "/staff"} className="admin-brand" aria-label={isAdmin ? "Torna alla Dashboard Admin" : "Torna alla Dashboard operativa"}>
              <Image src="/home/movi-logo.png" alt="Movi" width={88} height={28} priority />
              <span>{isAdmin ? "Dashboard" : "Area operativa"}</span>
            </Link>
            <div className="admin-topbar__actions">
              <AdminThemeSelector />
              {operator && operationalItems.length > 0 ? <OperatorNavigation role={operator.role} operationalItems={operationalItems} adminOnlyItems={isAdmin ? ADMIN_ONLY_NAVIGATION.map((item) => ({ ...item, adminOnly: true })) : []} /> : null}
              {allowed.has("scanner.manage") ? <Link href="/staff/rewards" className="admin-reward-link">
                <PackageCheck size={16} aria-hidden="true" />
                <span>Richieste premio</span>
              </Link> : null}
              <AdminLogoutButton redirectTo={isAdmin ? "/admin/login" : "/staff/login"} />
            </div>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </AdminAreaScope>
  );
}
