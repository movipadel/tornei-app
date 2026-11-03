"use client";

import Link from "next/link";
import Image from "next/image";
import { type ComponentType } from "react";
import PushEnrollmentCard from "@/components/PushEnrollmentCard";
import { BellRing, CalendarDays, Gift, GitMerge, Home, Network, ScanLine, Settings, ShieldAlert, ShoppingBag, Store, Trophy, UsersRound } from "lucide-react";
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

export default function AdminHomePage() {
  return <div className={s.page}><div className={s.shell}>
    <header className={s.header}><div>
      <Image className={s.logo} src="/home/movi-logo.png" alt="Movi" width={134} height={44} priority/>
      <p className={s.kicker}>Centro operativo MOVI</p>
      <h1>Dashboard Admin</h1>
      <p className={s.intro}>Parti dalle attività quotidiane, poi passa alla gestione sportiva, editoriale e commerciale.</p>
    </div><Link href="/" className={s.homeLink} aria-label="Home pubblica"><Home size={20} strokeWidth={1.6}/></Link></header>

    <div className={s.areas}>{areas.map((area, areaIndex) => <section key={area.id} className={`${s.area} ${s[area.tone]} ${area.featured ? s.featured : ""}`} aria-labelledby={`${area.id}-title`}>
      <div className={s.areaHeader}><span className={s.areaIndex}>{String(areaIndex + 1).padStart(2, "0")}</span><div><h2 id={`${area.id}-title`}>{area.title}</h2><p>{area.description}</p></div></div>
      <div className={s.cardGrid}>{area.cards.map(card => { const Icon = card.icon; return <Link key={card.title} href={card.href} className={s.card}>
        <span className={s.icon}><Icon size={area.featured ? 26 : 23} strokeWidth={1.65}/></span>
        <span className={s.cardCopy}><strong>{card.title}</strong><small>{card.description}</small></span>
        <span className={s.arrow} aria-hidden="true">→</span>
      </Link>; })}</div>
    </section>)}</div>
    <PushEnrollmentCard audience="staff" variant="compact" />
  </div></div>;
}
