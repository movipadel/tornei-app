"use client";

import { Bell, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./PublicUI.module.css";

function HeaderActions({ onNotifications, hidden = false }: { onNotifications: () => void; hidden?: boolean }) {
  return <div className={styles.headerActions}>
    <button type="button" className={styles.iconButton} aria-label="Apri notifiche" onClick={onNotifications} tabIndex={hidden ? -1 : undefined}><Bell size={20} aria-hidden /></button>
    <Link href="/profilo" className={styles.iconButton} aria-label="Apri profilo" tabIndex={hidden ? -1 : undefined}><UserRound size={20} aria-hidden /></Link>
  </div>;
}

export function PublicHeader({ slot, stickySentinelId }: { slot?: React.ReactNode; stickySentinelId?: string }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const node = (stickySentinelId ? document.getElementById(stickySentinelId) : null) ?? sentinelRef.current;
    if (!node || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [stickySentinelId]);
  function openNotifications() {
    if (window.location.pathname === "/") window.dispatchEvent(new CustomEvent("movi:open-notifications"));
    else window.location.assign("/#notifiche");
  }
  return <>
    <header className={styles.expandedHeader}>
      <div className={`${styles.headerInner} ${styles.headerRow}`}>
        <Link href="/" className={styles.brandLink} aria-label="MOVI Padelleria, Home"><img src="/branding/movi-padelleria.png" alt="MOVI Padelleria" className={styles.brandFull} /></Link>
        <HeaderActions onNotifications={openNotifications} />
      </div>
      {slot ? <div className={styles.headerSlot}>{slot}</div> : null}
    </header>
    <div ref={sentinelRef} className={styles.headerSentinel} aria-hidden />
    <header className={`${styles.compactHeader} ${compact ? styles.compactVisible : ""}`} aria-hidden={!compact}>
      <div className={`${styles.headerInner} ${styles.headerRow}`}>
        <Link href="/" className={styles.brandLink} tabIndex={compact ? undefined : -1} aria-label="MOVI, Home"><img src="/branding/movi-monviso.png" alt="MOVI" className={styles.brandCompact} /></Link>
        <HeaderActions onNotifications={openNotifications} hidden={!compact} />
      </div>
    </header>
  </>;
}
