import Image from "next/image";
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { AdminAreaScope } from "@/components/admin/AdminAreaScope";
import { AdminThemeSelector } from "@/components/admin/AdminThemeSelector";
import "./admin-ui.css";

const adminThemeBootstrap = `(()=>{try{const r=document.currentScript?.parentElement;if(!r)return;const k="movi-admin-theme-v1";const v=localStorage.getItem(k);const m=v==="light"||v==="dark"||v==="system"?v:"system";const d=matchMedia("(prefers-color-scheme: dark)").matches;r.dataset.adminThemeMode=m;r.dataset.adminTheme=m==="system"?(d?"dark":"light"):m}catch{}})();`;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAreaScope>
      <script dangerouslySetInnerHTML={{ __html: adminThemeBootstrap }} />
      <div className="admin-shell">
        <header className="admin-topbar">
          <div className="admin-topbar__inner">
            <Link href="/admin" className="admin-brand" aria-label="Torna alla Dashboard Admin">
              <Image src="/home/movi-logo.png" alt="Movi" width={88} height={28} priority />
              <span>Dashboard</span>
            </Link>
            <div className="admin-topbar__actions">
              <AdminThemeSelector />
              <Link href="/admin/moviback/redemptions" className="admin-reward-link">
                <PackageCheck size={16} aria-hidden="true" />
                <span>Richieste premio</span>
              </Link>
              <AdminLogoutButton />
            </div>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </AdminAreaScope>
  );
}
