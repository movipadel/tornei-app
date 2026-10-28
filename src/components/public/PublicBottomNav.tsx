"use client";

import { CalendarCheck2, Home, QrCode, Trophy, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { PublicModal } from "./PublicModal";
import { PublicButton, PublicState, publicStyles as styles } from "./PublicPrimitives";
import { OPEN_PUBLIC_QR_EVENT, type OpenPublicQrDetail } from "./publicEvents";

type QrState = { kind: "idle" | "loading" | "guest" | "unavailable" | "ready" | "error"; code?: string };

function NavLink({ href, label, active, icon }: { href: string; label: string; active: boolean; icon: React.ReactNode }) {
  return <Link href={href} className={`${styles.navItem} ${active ? styles.navActive : ""}`} aria-current={active ? "page" : undefined}>{icon}<span>{label}</span></Link>;
}

export function PublicBottomNav({ demo = false }: { demo?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<QrState>({ kind: "idle" });
  const returnFocusRef = useRef<HTMLElement | null>(null);

  async function loadQr() {
    if (demo) { setQr({ kind: "ready", code: "DEMO LOCALE — NESSUN CODICE REALE" }); return; }
    setQr({ kind: "loading" });
    try {
      const response = await fetch("/api/moviback/me", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "QR non disponibile");
      if (!data.user) { setQr({ kind: "guest" }); return; }
      if (data.membership?.status !== "approved" || data.eligibility?.can_use_card !== true || !data.membership?.membership_code) { setQr({ kind: "unavailable" }); return; }
      setQr({ kind: "ready", code: String(data.membership.membership_code) });
    } catch { setQr({ kind: "error" }); }
  }
  async function handleOpen(next: boolean) {
    setOpen(next);
    if (next && qr.kind === "idle") await loadQr();
  }

  useEffect(() => {
    const openQr = (event: Event) => {
      const detail = (event as CustomEvent<OpenPublicQrDetail>).detail;
      returnFocusRef.current = detail?.returnFocus ?? null;
      if (detail?.membershipCode) setQr({ kind: "ready", code: detail.membershipCode });
      setOpen(true);
      if (!detail?.membershipCode && qr.kind === "idle") void loadQr();
    };
    window.addEventListener(OPEN_PUBLIC_QR_EVENT, openQr);
    return () => window.removeEventListener(OPEN_PUBLIC_QR_EVENT, openQr);
    // Rebind when QR state changes so the event reads the current request state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr.kind]);

  const isHome = pathname === "/";
  const isTournaments = pathname.startsWith("/tornei");
  const isActivities = pathname.startsWith("/le-mie-attivita");
  const isProfile = pathname.startsWith("/profilo");
  return <>
    <nav className={styles.bottomNav} aria-label="Navigazione principale">
      <div className={styles.navInner}>
        <NavLink href="/" label="Home" active={isHome} icon={<Home size={21} aria-hidden />} />
        <NavLink href="/tornei" label="Tornei" active={isTournaments} icon={<Trophy size={21} aria-hidden />} />
        <PublicModal
          open={open}
          onOpenChange={(next) => void handleOpen(next)}
          onCloseAutoFocus={(event) => {
            if (!returnFocusRef.current) return;
            event.preventDefault();
            const returnFocus = returnFocusRef.current;
            returnFocusRef.current = null;
            window.requestAnimationFrame(() => returnFocus.focus());
          }}
          trigger={<button type="button" className={`${styles.navItem} ${styles.qrNav}`} aria-haspopup="dialog"><span className={styles.qrNavIcon}><QrCode size={25} aria-hidden /></span><span>QR</span></button>}
          title="Il mio QR MoviBack"
          description={demo ? "Dimostrazione locale: nessun dato reale." : "Mostralo alla segreteria per accumulare punti."}
        >
          {qr.kind === "loading" || qr.kind === "idle" ? <PublicState kind="loading" title="Caricamento QR" message="Recupero della tessera in corso." /> : null}
          {qr.kind === "guest" ? <PublicState kind="empty" title="Accedi per vedere il QR" message="Il QR personale è disponibile dopo l’accesso." action={<Link href="/accedi" className={`${styles.button} ${styles.primary}`}>Accedi</Link>} /> : null}
          {qr.kind === "unavailable" ? <PublicState kind="warning" title="Tessera non disponibile" message="Il QR compare quando la tessera MoviBack è utilizzabile." action={<Link href="/moviback" className={`${styles.button} ${styles.secondary}`}>Vai a MoviBack</Link>} /> : null}
          {qr.kind === "error" ? <PublicState kind="error" title="QR non disponibile" message="Controlla la connessione e riprova." action={<PublicButton variant="secondary" onClick={() => void loadQr()}>Riprova</PublicButton>} /> : null}
          {qr.kind === "ready" && qr.code ? <div className={styles.qrPanel}><div className={styles.qrCanvas}><QRCodeCanvas value={demo ? qr.code : `mb:${qr.code}`} size={240} /></div><strong>{demo ? "DEMO LOCALE" : qr.code}</strong><span className={styles.meta}>{demo ? "Contenuto dimostrativo, non scansionabile in produzione." : "Mostra alla segreteria per accumulare punti"}</span></div> : null}
        </PublicModal>
        <NavLink href="/le-mie-attivita" label="Le mie attività" active={isActivities} icon={<CalendarCheck2 size={21} aria-hidden />} />
        <NavLink href="/profilo" label="Profilo" active={isProfile} icon={<UserRound size={21} aria-hidden />} />
      </div>
    </nav>
  </>;
}
