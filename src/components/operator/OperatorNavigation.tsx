"use client";

import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { usePathname } from "next/navigation";
import type { OperatorRole } from "@/lib/operatorAuthorizationCore";
import type { OperatorPermissionKey } from "@/lib/operatorPermissions";
import styles from "./OperatorNavigation.module.css";

export type OperatorNavigationItem = {
  key: string;
  label: string;
  description: string;
  destination: string;
  permission?: OperatorPermissionKey;
  adminOnly?: boolean;
};

export function OperatorNavigation({
  role,
  operationalItems,
  adminOnlyItems = [],
}: {
  role: OperatorRole;
  operationalItems: readonly OperatorNavigationItem[];
  adminOnlyItems?: readonly OperatorNavigationItem[];
}) {
  const pathname = usePathname();
  const renderLink = (item: OperatorNavigationItem) => {
    const current = pathname === item.destination || pathname.startsWith(`${item.destination}/`);
    return (
      <Link key={item.key} href={item.destination} className={styles.link} aria-current={current ? "page" : undefined}>
        <span className={styles.copy}><strong>{item.label}</strong><small>{item.description}</small></span>
        <ExternalLink size={15} className={styles.arrow} aria-hidden="true" />
      </Link>
    );
  };

  return (
    <details className={styles.navigation}>
      <summary className={styles.summary} aria-label="Apri navigazione aree operative">
        <span className={styles.summaryText}>Aree operative</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <nav className={styles.menu} aria-label="Aree operative">
        <span className={styles.sectionLabel}>Moduli operativi</span>
        {operationalItems.map(renderLink)}
        {role === "admin" && adminOnlyItems.length > 0 ? (
          <><div className={styles.divider} /><span className={styles.sectionLabel}>Solo Admin</span>{adminOnlyItems.map(renderLink)}</>
        ) : null}
      </nav>
    </details>
  );
}
