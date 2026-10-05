"use client";

import { usePathname } from "next/navigation";
import { PublicBottomNav } from "./PublicBottomNav";
import { PublicHeader } from "./PublicHeader";
import { PublicShellProvider } from "./PublicShellContext";
import styles from "./PublicUI.module.css";

const EXACT_EXCEPTIONS = new Set([
  "/accedi", "/registrati", "/attiva-account", "/accesso-precedente",
  "/password-dimenticata", "/reset-password",
]);

function isExcluded(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/") ||
    pathname === "/staff" || pathname.startsWith("/staff/") ||
    pathname.startsWith("/riscatto-premio/") || EXACT_EXCEPTIONS.has(pathname);
}

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isExcluded(pathname)) return children;
  return <PublicShellProvider>
    <div className={styles.root} data-public-ui-root>
      <a href="#public-main-content" className={styles.skipLink}>Vai al contenuto</a>
      <PublicHeader
        stickySentinelId="public-sticky-sentinel"
        slot={pathname === "/" ? <div id="public-home-header-slot" /> : undefined}
      />
      <div id="public-main-content" className={styles.shellContent} tabIndex={-1}>{children}</div>
      <PublicBottomNav demo={pathname === "/dev/public-ui"} />
    </div>
  </PublicShellProvider>;
}
