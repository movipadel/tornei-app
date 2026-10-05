import Link from "next/link";
import { BellRing, CalendarDays, Gift, Network, ScanLine, ShoppingBag, Store, Trophy, UsersRound, type LucideIcon } from "lucide-react";
import type { CurrentOperator } from "@/lib/operatorAuthorizationCore";
import type { OperatorPermission } from "@/lib/operatorPermissions";
import styles from "./staff-dashboard.module.css";

const icons: Record<OperatorPermission["key"], LucideIcon> = {
  "scanner.manage": ScanLine,
  "tournaments.manage": Trophy,
  "circuits.manage": Network,
  "players.manage": UsersRound,
  "requests.manage": CalendarDays,
  "padelleria.manage": CalendarDays,
  "communications.manage": BellRing,
  "moviback.manage": Gift,
  "partners.manage": Store,
  "store.manage": ShoppingBag,
  "monday_league.manage": Trophy,
};

export function StaffDashboard({ operator, modules }: { operator: CurrentOperator; modules: readonly OperatorPermission[] }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Centro operativo MOVI</p>
            <h1>Dashboard operativa</h1>
            <p className={styles.intro}>Accedi alle aree assegnate al tuo profilo operativo.</p>
          </div>
          <div className={styles.identity} aria-label="Operatore corrente">
            <strong>{operator.name}</strong>
            <span>{operator.role === "admin" ? "Admin" : "Staff"}</span>
          </div>
        </header>

        {modules.length > 0 ? (
          <section aria-labelledby="staff-modules-title">
            <h2 id="staff-modules-title" className={styles.sectionTitle}>Aree operative</h2>
            <div className={styles.grid}>
              {modules.map((module) => {
                const Icon = icons[module.key];
                return (
                  <Link key={module.key} href={module.destination} className={styles.card} aria-label={`Apri ${module.label}`}>
                    <span className={styles.icon}><Icon size={25} strokeWidth={1.7} aria-hidden="true" /></span>
                    <span className={styles.copy}><strong>{module.label}</strong><small>{module.description}</small></span>
                    <span className={styles.arrow} aria-hidden="true">→</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : (
          <section className={styles.empty} aria-labelledby="staff-empty-title">
            <h2 id="staff-empty-title">Nessuna area operativa assegnata.</h2>
            <p>Contatta un Admin per richiedere l’accesso alle attività necessarie.</p>
          </section>
        )}
      </div>
    </main>
  );
}
