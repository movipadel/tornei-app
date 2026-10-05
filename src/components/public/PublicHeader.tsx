"use client";

import { Bell, Settings, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { operatorDestination, operatorRoleFromResponse, type OperatorRole } from "@/lib/operatorAccess";
import styles from "./PublicUI.module.css";

function ProfileMenu({ operatorRole, hidden }: { operatorRole: OperatorRole | null; hidden: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => firstItemRef.current?.focus());
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className={styles.profileMenuWrap} ref={rootRef}>
    <button
      type="button"
      className={styles.iconButton}
      aria-label="Apri menu profilo"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      tabIndex={hidden ? -1 : undefined}
    >
      <UserRound size={20} aria-hidden />
    </button>
    {open && !hidden ? <div className={styles.profileMenu} role="menu" aria-label="Menu profilo">
      <Link ref={firstItemRef} href="/profilo" className={styles.profileMenuItem} role="menuitem" onClick={() => setOpen(false)}>
        <UserRound size={18} aria-hidden />
        Profilo
      </Link>
      {!operatorRole ? <Link href="/admin/login" className={styles.profileMenuItem} role="menuitem" onClick={() => setOpen(false)}>
        <Settings size={18} aria-hidden />
        Accesso staff
      </Link> : null}
    </div> : null}
  </div>;
}

function HeaderActions({ onNotifications, operatorRole, hidden = false }: { onNotifications: () => void; operatorRole: OperatorRole | null; hidden?: boolean }) {
  const operatorHref = operatorRole ? operatorDestination(operatorRole) : null;
  return <div className={`${styles.headerActions} ${operatorRole ? styles.headerActionsOperator : ""}`}>
    <button type="button" className={styles.iconButton} aria-label="Apri notifiche" onClick={onNotifications} tabIndex={hidden ? -1 : undefined}><Bell size={20} aria-hidden /></button>
    {operatorHref ? <Link
      href={operatorHref}
      className={`${styles.iconButton} ${styles.operatorButton}`}
      aria-label={operatorRole === "admin" ? "Apri area Admin" : "Apri area Staff"}
      tabIndex={hidden ? -1 : undefined}
    ><Settings size={20} aria-hidden /></Link> : null}
    <ProfileMenu key={hidden ? "hidden" : "visible"} operatorRole={operatorRole} hidden={hidden} />
  </div>;
}

export function PublicHeader({ slot, stickySentinelId }: { slot?: React.ReactNode; stickySentinelId?: string }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [operatorRole, setOperatorRole] = useState<OperatorRole | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function checkOperatorSession() {
      try {
        const response = await fetch("/api/staff/me", { cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => null);
        setOperatorRole(operatorRoleFromResponse(response.ok, payload));
      } catch {
        if (!controller.signal.aborted) setOperatorRole(null);
      }
    }
    void checkOperatorSession();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;

    let observedNode: Element | null = null;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { threshold: 0 });

    const observeCurrentSentinel = () => {
      const nextNode = (stickySentinelId ? document.getElementById(stickySentinelId) : null) ?? sentinelRef.current;
      if (!nextNode || nextNode === observedNode) return;
      if (observedNode) observer.unobserve(observedNode);
      observedNode = nextNode;
      observer.observe(nextNode);
    };

    observeCurrentSentinel();
    const mutationObserver = new MutationObserver(observeCurrentSentinel);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
    };
  }, [stickySentinelId]);
  function openNotifications() {
    if (window.location.pathname === "/") window.dispatchEvent(new CustomEvent("movi:open-notifications"));
    else window.location.assign("/#notifiche");
  }
  return <>
    <header className={styles.expandedHeader}>
      <div className={`${styles.headerInner} ${styles.headerRow}`}>
        <Link href="/" className={styles.brandLink} aria-label="MOVI Padelleria, Home"><Image src="/branding/movi-padelleria.png" alt="MOVI Padelleria" width={260} height={48} className={styles.brandFull} priority /></Link>
        <HeaderActions onNotifications={openNotifications} operatorRole={operatorRole} />
      </div>
      {slot ? <div className={styles.headerSlot}>{slot}</div> : null}
    </header>
    <div ref={sentinelRef} className={styles.headerSentinel} aria-hidden />
    <header className={`${styles.compactHeader} ${compact ? styles.compactVisible : ""}`} aria-hidden={!compact}>
      <div className={`${styles.headerInner} ${styles.headerRow}`}>
        <Link href="/" className={styles.brandLink} tabIndex={compact ? undefined : -1} aria-label="MOVI, Home"><Image src="/branding/movi-monviso.png" alt="MOVI" width={42} height={42} className={styles.brandCompact} /></Link>
        <HeaderActions onNotifications={openNotifications} operatorRole={operatorRole} hidden={!compact} />
      </div>
    </header>
  </>;
}
