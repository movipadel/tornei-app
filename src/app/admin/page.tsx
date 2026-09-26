"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type ComponentType } from "react";
import { toast } from "sonner";
import { BellRing, CalendarDays, Gift, GitMerge, Home, Loader2, Network, ScanLine, Settings, ShieldAlert, ShoppingBag, Store, Trophy, UsersRound } from "lucide-react";
import s from "./dashboard.module.css";

type DashboardCard = { title: string; description: string; href: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> };
type DashboardArea = { id: string; title: string; description: string; tone: "daily" | "competition" | "community" | "loyalty" | "control"; featured?: boolean; cards: DashboardCard[] };

const areas: DashboardArea[] = [
  { id: "daily", title: "Operatività quotidiana", description: "Le attività da presidiare ogni giorno, dalle richieste al contatto con i giocatori.", tone: "daily", featured: true, cards: [
    { title: "Richieste Gioca / Allenati", description: "Gestisci richieste di partite e allenamenti.", href: "/admin/requests", icon: CalendarDays },
    { title: "Giocatori", description: "Anagrafica, livello e preferenze di gioco.", href: "/admin/players", icon: UsersRound },
    { title: "Scanner QR Code", description: "Accredita punti o scansiona codici premio.", href: "/staff", icon: ScanLine },
    { title: "Comunicazioni", description: "Notifiche e comunicazioni agli utenti.", href: "/admin/comunicazioni", icon: BellRing },
  ] },
  { id: "competitions", title: "Competizioni", description: "Tornei, circuiti e campionati nello stesso spazio operativo.", tone: "competition", cards: [
    { title: "Tornei", description: "Crea, modifica, genera e gestisci tornei.", href: "/admin/tournaments", icon: Trophy },
    { title: "Circuiti", description: "Gestisci circuiti e classifiche giocatori.", href: "/admin/circuits", icon: Network },
    { title: "Monday League", description: "Configura il campionato a squadre.", href: "/admin/monday-league", icon: CalendarDays },
  ] },
  { id: "community", title: "Community e contenuti", description: "Racconta il mondo MOVI e cura la rete dei partner.", tone: "community", cards: [
    { title: "Contenuti Padelleria", description: "Gestisci Succede ed È successo in Padelleria.", href: "/admin/padelleria", icon: CalendarDays },
    { title: "Partner MOVI", description: "Gestisci partner e vantaggi per la community MOVI.", href: "/admin/partners", icon: Store },
  ] },
  { id: "loyalty", title: "Loyalty e commerciale", description: "Fidelizzazione, catalogo e operatività degli ordini.", tone: "loyalty", cards: [
    { title: "MoviBack", description: "Gestione utenti, punti e premi.", href: "/admin/moviback", icon: Gift },
    { title: "Store MOVI", description: "Gestisci prodotti, categorie, linee, varianti e stock.", href: "/admin/store/products", icon: Store },
    { title: "Ordini Store", description: "Gestisci ordini, incassi, stati e riepiloghi fornitore.", href: "/admin/store-orders", icon: ShoppingBag },
  ] },
  { id: "control", title: "Controllo e amministrazione", description: "Verifiche, correzioni e accessi tecnici meno frequenti.", tone: "control", cards: [
    { title: "Duplicati e identità da verificare", description: "Risolvi duplicati, conflitti e collegamenti incerti.", href: "/admin/users/duplicates", icon: GitMerge },
    { title: "Problemi di accesso", description: "Gestisci richieste di aiuto e onboarding da completare.", href: "/admin/users/access-problems", icon: ShieldAlert },
    { title: "Gestione staff", description: "Crea e gestisci accessi admin e staff.", href: "/admin/users", icon: Settings },
  ] },
];

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) outputArray[index] = rawData.charCodeAt(index);
  return outputArray;
}

export default function AdminHomePage() {
  const [pushLoading, setPushLoading] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (!("Notification" in window)) { setPushPermission("unsupported"); return; }
    setPushPermission(Notification.permission);
  }, []);

  async function enableAdminPush() {
    if (pushLoading) return;
    try {
      setPushLoading(true);
      if (!("serviceWorker" in navigator)) throw new Error("Il browser non supporta i service worker.");
      if (!("PushManager" in window)) throw new Error("Il browser non supporta le notifiche push.");
      if (!("Notification" in window)) throw new Error("Il browser non supporta le notifiche.");
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) throw new Error("VAPID public key mancante.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Permesso notifiche non concesso.");
      const registration = await navigator.serviceWorker.register("/admin-push-sw.js");
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
      const response = await fetch("/api/admin/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Errore registrazione notifiche.");
      toast.success("Notifiche admin attivate su questo dispositivo.");
      setPushPermission(Notification.permission);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Errore attivazione notifiche.");
    } finally { setPushLoading(false); }
  }

  return <div className={s.page}><div className={s.shell}>
    <header className={s.header}><div>
      <Image className={s.logo} src="/home/movi-logo.png" alt="Movi" width={134} height={44} priority/>
      <p className={s.kicker}>Centro operativo MOVI</p>
      <h1>Dashboard Admin</h1>
      <p className={s.intro}>Parti dalle attività quotidiane, poi passa alla gestione sportiva, editoriale e commerciale.</p>
    </div><Link href="/" className={s.homeLink} aria-label="Home pubblica"><Home size={20} strokeWidth={1.6}/></Link></header>

    {pushPermission !== "granted" && pushPermission !== "unsupported" && <button type="button" onClick={enableAdminPush} disabled={pushLoading} className={s.pushButton}>
      {pushLoading ? <Loader2 size={18} className="animate-spin"/> : <BellRing size={18} strokeWidth={1.8}/>} {pushLoading ? "Attivazione notifiche..." : "Attiva notifiche admin su questo dispositivo"}
    </button>}

    <div className={s.areas}>{areas.map((area, areaIndex) => <section key={area.id} className={`${s.area} ${s[area.tone]} ${area.featured ? s.featured : ""}`} aria-labelledby={`${area.id}-title`}>
      <div className={s.areaHeader}><span className={s.areaIndex}>{String(areaIndex + 1).padStart(2, "0")}</span><div><h2 id={`${area.id}-title`}>{area.title}</h2><p>{area.description}</p></div></div>
      <div className={s.cardGrid}>{area.cards.map(card => { const Icon = card.icon; return <Link key={card.title} href={card.href} className={s.card}>
        <span className={s.icon}><Icon size={area.featured ? 26 : 23} strokeWidth={1.65}/></span>
        <span className={s.cardCopy}><strong>{card.title}</strong><small>{card.description}</small></span>
        <span className={s.arrow} aria-hidden="true">→</span>
      </Link>; })}</div>
    </section>)}</div>
  </div></div>;
}
