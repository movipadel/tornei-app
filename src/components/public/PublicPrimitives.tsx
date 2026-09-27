"use client";

import { AlertTriangle, Check, CircleAlert, ImageIcon, LoaderCircle } from "lucide-react";
import { forwardRef } from "react";
import styles from "./PublicUI.module.css";

export type PublicButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export const PublicButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: PublicButtonVariant; loading?: boolean }>(
  function PublicButton({ variant = "primary", loading = false, disabled, children, className = "", ...props }, ref) {
    return <button ref={ref} className={`${styles.button} ${styles[variant]} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading ? <><LoaderCircle size={18} className="animate-spin" aria-hidden /> Invio…</> : children}</button>;
  }
);

export function PublicCard({ family = "standard", children, className = "" }: { family?: "standard" | "highlight" | "compact" | "editorial"; children: React.ReactNode; className?: string }) {
  const familyClass = family === "highlight" ? styles.highlightCard : family === "compact" ? styles.compactCard : family === "editorial" ? styles.editorialCard : "";
  return <article className={`${styles.card} ${familyClass} ${className}`}>{children}</article>;
}

export function MediaFrame({ src, alt, ratio = "landscape", position = "50% 50%", fit = "cover", overlay = false, loading = false }: { src?: string; alt: string; ratio?: "landscape" | "square"; position?: string; fit?: "cover" | "contain"; overlay?: boolean; loading?: boolean }) {
  return <div className={`${styles.mediaFrame} ${styles[ratio]} ${fit === "contain" ? styles.mediaContain : ""} ${overlay ? styles.mediaOverlay : ""} ${loading ? styles.skeleton : ""}`} style={{ "--media-position": position, "--media-fit": fit } as React.CSSProperties} aria-busy={loading || undefined}>
    {!loading && src ? <img src={src} alt={alt} loading="lazy" /> : !loading ? <div className={styles.mediaFallback}><ImageIcon aria-hidden /><span className={styles.micro}>Immagine non disponibile</span></div> : <span className="sr-only">Caricamento immagine</span>}
  </div>;
}

export function PublicCarousel({ label, children }: { label: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (items.length === 0) return null;
  return <div className={styles.carousel} role="region" aria-label={label} tabIndex={0}>{items}</div>;
}

export function PublicField({ label, optional, error, children }: { label: string; optional?: boolean; error?: string; children: React.ReactNode }) {
  return <label className={styles.field}><span className={styles.label}>{label} {optional ? <span className={styles.optional}>(opzionale)</span> : null}</span>{children}{error ? <span className={styles.fieldError}>{error}</span> : null}</label>;
}

export type PublicStateKind = "loading" | "empty" | "error" | "success" | "warning";
export function PublicState({ kind, title, message, action }: { kind: PublicStateKind; title: string; message: string; action?: React.ReactNode }) {
  const Icon = kind === "loading" ? LoaderCircle : kind === "success" ? Check : kind === "warning" ? AlertTriangle : CircleAlert;
  const tone = kind === "success" ? styles.success : kind === "warning" ? styles.warning : kind === "error" ? styles.error : styles.info;
  return <div className={styles.state} role={kind === "error" ? "alert" : "status"} aria-live="polite">
    <span className={`${styles.stateIcon} ${tone}`}><Icon size={20} className={kind === "loading" ? "animate-spin" : ""} aria-hidden /></span>
    <strong>{title}</strong><span className={styles.meta}>{message}</span>{action}
  </div>;
}

export function StatusBadge({ tone = "neutral", children }: { tone?: "success" | "warning" | "error" | "info" | "neutral"; children: React.ReactNode }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

export { styles as publicStyles };
