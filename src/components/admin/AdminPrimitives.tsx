import type { ReactNode } from "react";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export function AdminPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function AdminPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`admin-panel ${className}`.trim()}>{children}</section>;
}

export function AdminNotice({ children, tone = "info" }: { children: ReactNode; tone?: Tone }) {
  return <div className="admin-notice" data-tone={tone} role={tone === "danger" ? "alert" : "status"}>{children}</div>;
}

export function AdminBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className="admin-badge" data-tone={tone}>{children}</span>;
}

export function AdminEmptyState({ children }: { children: ReactNode }) {
  return <div className="admin-empty-state">{children}</div>;
}
