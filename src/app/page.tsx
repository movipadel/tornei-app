"use client";

import { ArrowRight, CalendarDays, Clock3, Coins, Dumbbell, Globe2, History, MapPin, MessageCircle, ShoppingBag, Store, Ticket, UsersRound, WalletCards } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FaFacebookF, FaInstagram, FaYoutube } from "react-icons/fa";
import { toast } from "sonner";
import UserLoginDialog from "@/components/UserLoginDialog";
import { OPEN_PUBLIC_QR_EVENT } from "@/components/public/publicEvents";
import { MembershipCardModal, type MembershipCardEligibility, type MembershipCardMembership } from "@/components/public/MembershipCardModal";
import { PublicHomeHeaderSlot } from "@/components/public/PublicHomeHeaderSlot";
import { publicLegalLinks, publicSocialLinks } from "@/components/public/publicLinks";
import { PublicModal } from "@/components/public/PublicModal";
import { MediaFrame, PublicButton, PublicCard, PublicCarousel, PublicState, StatusBadge, publicStyles } from "@/components/public/PublicPrimitives";
import RegistrationDialog from "@/components/tournaments/RegistrationDialog";
import TournamentLiveDialog from "@/components/tournaments/TournamentLiveDialog";
import type { PublicTournament } from "@/components/tournaments/TournamentCard";
import type { ContentItem } from "@/lib/padelleria";
import { filterHomeTournaments } from "@/lib/homeTournamentWindow";
import { getTournamentHomeBackground, normalizeTournamentHomeCategory } from "@/lib/tournamentHomeBackground";
import home from "./HomeV2.module.css";

type User = { id: string; full_name: string; phone: string; email: string; gender: "M" | "F"; privacy_accepted_at?: string | null; terms_accepted_at?: string | null; age_confirmed_at?: string | null; marketing_accepted?: boolean | null; marketing_accepted_at?: string | null };
type MyReg = { id: string; tournament_id: string; is_reserve: boolean; p1_phone: string; p2_phone?: string | null };
type HomeCommunication = { id: string; target: string; tournament_id: string | null; title: string; body: string; image_path: string | null; cta_label: string | null; cta_url: string | null; created_at: string; read_at: string | null; dismissed_at: string | null };
type PublicCircuit = { id: string; name: string; slug: string; tournament_type: string; status: string; home_image_url: string | null; ranking_groups_count: number; played_stages_count: number; rules_url: string | null };
type HomeTournament = PublicTournament & { circuit_id?: string | null };
type MondayLeagueHero = { visible: true; eyebrow: string; title: string; seasonName: string } | { visible: false };
type MoviBackHome = {
  points: number | null;
  membershipStatus: string | null;
  membershipCode: string | null;
  membership: MembershipCardMembership | null;
  eligibility: (MembershipCardEligibility & { can_redeem: boolean }) | null;
};

const normalizePhone = (value: string) => String(value ?? "").replace(/\s+/g, "").trim();
const isValidPhone = (value: string) => normalizePhone(value).length >= 8;
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const firstName = (user: User | null) => user?.full_name?.trim().split(/\s+/)[0] || null;

function formatDate(iso: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!iso) return "—";
  const value = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (!Number.isFinite(value.getTime())) return "—";
  return value.toLocaleDateString("it-IT", options ?? { day: "numeric", month: "short", year: "numeric" });
}

function contentImage(item: ContentItem) {
  const images = item.media.filter((media) => media.media_type === "image" && media.url);
  return images.find((media) => media.role === "cover")?.url ?? images[0]?.url ?? undefined;
}

function SectionHeader({ title, copy, href, linkLabel }: { title: string; copy?: string; href?: string; linkLabel?: string }) {
  return <div className={home.sectionHead}><div><h2 className={home.sectionTitle}>{title}</h2>{copy ? <p className={home.sectionCopy}>{copy}</p> : null}</div>{href && linkLabel ? <Link className={home.textLink} href={href}>{linkLabel}</Link> : null}</div>;
}

function EditorialCarousel({ title, label, items, href }: { title: string; label: string; items: ContentItem[]; href: string }) {
  return <section className={home.section}><SectionHeader title={title} href={href} linkLabel="Vedi tutti" /><PublicCarousel label={label}>{items.map((item) => {
    const image = contentImage(item);
    return <Link className={`${home.carouselItem} ${home.editorialCardLink}`} href={`/padelleria/${item.id}`} aria-label={`Apri ${item.title}`} key={item.id}><PublicCard family="editorial" className={home.editorialCard}><MediaFrame src={image} alt={image ? item.title : ""} /><div className={home.editorialBody}><span className={home.editorialDate}>{formatDate(item.occurred_at ?? item.visible_from ?? item.published_at)}</span><h3>{item.title}</h3>{item.excerpt ? <p>{item.excerpt}</p> : null}</div></PublicCard></Link>;
  })}</PublicCarousel></section>;
}

function HomeTournamentCard({ tournament, circuit, status, onRegister }: { tournament: HomeTournament; circuit?: PublicCircuit; status: "none" | "main" | "reserve"; onRegister: () => void }) {
  const background = getTournamentHomeBackground(tournament.type, tournament.category);
  const category = normalizeTournamentHomeCategory(tournament.category);
  const dateBadgeCategoryClass = category === "maschile" ? home.tournamentDateBadgeMaschile
    : category === "femminile" ? home.tournamentDateBadgeFemminile
    : category === "misto" ? home.tournamentDateBadgeMisto
    : category === "open" ? home.tournamentDateBadgeOpen
    : home.tournamentDateBadgeDefault;
  return <PublicCard family="compact" className={home.tournamentCard}>
    <div className={home.tournamentBackground} style={{ backgroundImage: `url("${background}")` }} aria-hidden />
    <div className={home.tournamentScrim} aria-hidden />
    <div className={home.tournamentBody}>
      <div className={home.tournamentInfo}>
        <div className={home.tournamentBadges}>
          <div className={`${home.tournamentDateBadge} ${dateBadgeCategoryClass}`}><strong>{formatDate(tournament.date, { day: "2-digit" })}</strong><span>{formatDate(tournament.date, { month: "short" })}</span></div>
          {circuit ? <span className={home.tournamentCircuit}>{circuit.name}</span> : null}
        </div>
        <h3>{tournament.name}</h3>
        <div className={home.tournamentClassification}>{tournament.level ? <span>Livello {tournament.level}</span> : null}<span>{[tournament.category, tournament.type].filter(Boolean).join(" · ")}</span></div>
        <div className={home.metaLine}><CalendarDays size={15} aria-hidden />{formatDate(tournament.date, { weekday: "long", day: "numeric", month: "long" })}{tournament.time ? <><Clock3 size={15} aria-hidden /><span>{tournament.time.slice(0, 5)}</span></> : null}</div>
        {tournament.location ? <div className={home.metaLine}><MapPin size={15} aria-hidden />{tournament.location}</div> : null}
      </div>
      <div className={home.tournamentAction}>{tournament.hasLive ? <TournamentLiveDialog tournamentId={tournament.id} tournamentName={tournament.name} trigger={<PublicButton variant="danger">LIVE</PublicButton>} /> : status === "main" ? <StatusBadge tone="success">Iscritto</StatusBadge> : status === "reserve" ? <StatusBadge tone="warning">Riserva</StatusBadge> : <PublicButton onClick={onRegister}>Iscriviti</PublicButton>}</div>
    </div>
  </PublicCard>;
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [homeError, setHomeError] = useState("");
  const [tournaments, setTournaments] = useState<HomeTournament[]>([]);
  const [circuits, setCircuits] = useState<PublicCircuit[]>([]);
  const [succede, setSuccede] = useState<ContentItem[]>([]);
  const [past, setPast] = useState<ContentItem[]>([]);
  const [sectionErrors, setSectionErrors] = useState({ moviback: "", circuits: "", succede: "", past: "" });
  const [mondayLeagueHero, setMondayLeagueHero] = useState<MondayLeagueHero>({ visible: false });
  const [user, setUser] = useState<User | null>(null);
  const [moviBack, setMoviBack] = useState<MoviBackHome>({ points: null, membershipStatus: null, membershipCode: null, membership: null, eligibility: null });
  const [myRegs, setMyRegs] = useState<MyReg[]>([]);
  const [communications, setCommunications] = useState<HomeCommunication[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<PublicTournament | null>(null);
  const [pendingTournament, setPendingTournament] = useState<PublicTournament | null>(null);
  const listTimerRef = useRef<number | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const notificationFocusRef = useRef<HTMLElement | null>(null);
  const effectivePhone = normalizePhone(user?.phone ?? "");
  const unreadNotifications = communications.filter((notification) => !notification.read_at).length;
  const missingRequiredConsents = Boolean(user) && (!user?.privacy_accepted_at || !user?.terms_accepted_at || !user?.age_confirmed_at);

  async function loadAll(opts?: { silent?: boolean; includeBootstrap?: boolean }) {
    const silent = Boolean(opts?.silent);
    const includeBootstrap = opts?.includeBootstrap !== false;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    if (!silent) { setLoading(true); setHomeError(""); }
    try {
      const [tRes, settingsRes, meRes, circuitsRes, moviBackRes, communicationsRes, leagueRes, succedeRes, pastRes] = await Promise.all([
        fetch("/api/tournaments?scope=home", { cache: "no-store", signal: controller.signal }),
        includeBootstrap ? fetch("/api/app-settings", { cache: "no-store", signal: controller.signal }) : Promise.resolve(null),
        includeBootstrap ? fetch("/api/user/me", { cache: "no-store", signal: controller.signal }) : Promise.resolve(null),
        fetch("/api/circuits", { cache: "no-store", signal: controller.signal }),
        fetch("/api/moviback/me", { cache: "no-store", signal: controller.signal }),
        fetch("/api/user/communications", { cache: "no-store", signal: controller.signal }),
        fetch("/api/monday-league/hero", { cache: "no-store", signal: controller.signal }),
        includeBootstrap ? fetch("/api/padelleria?kind=succede&limit=6", { cache: "no-store", signal: controller.signal }) : Promise.resolve(null),
        includeBootstrap ? fetch("/api/padelleria?kind=e_successo&limit=6", { cache: "no-store", signal: controller.signal }) : Promise.resolve(null),
      ]);
      const tournamentJson = await tRes.json().catch(() => ({}));
      if (!tRes.ok) throw new Error(tournamentJson.error || "Errore caricamento tornei");
      setTournaments((tournamentJson.data ?? []) as HomeTournament[]);
      if (settingsRes) await settingsRes.json().catch(() => ({}));
      if (meRes) { const json = await meRes.json().catch(() => ({})); setUser(meRes.ok ? json.user ?? null : null); }
      const circuitsJson = await circuitsRes.json().catch(() => ({}));
      if (circuitsRes.ok) { setCircuits((circuitsJson.data ?? []) as PublicCircuit[]); setSectionErrors((current) => ({ ...current, circuits: "" })); }
      else { setCircuits([]); setSectionErrors((current) => ({ ...current, circuits: circuitsJson.error || "Circuiti non disponibili" })); }
      const moviBackJson = await moviBackRes.json().catch(() => ({}));
      if (moviBackRes.ok) {
        const approved = moviBackJson?.membership?.status === "approved";
        setMoviBack({
          points: approved && Number.isFinite(Number(moviBackJson.points)) ? Number(moviBackJson.points) : null,
          membershipStatus: moviBackJson?.membership?.status ?? null,
          membershipCode: approved && moviBackJson?.membership?.membership_code ? String(moviBackJson.membership.membership_code) : null,
          membership: moviBackJson?.membership ? {
            status: moviBackJson.membership.status,
            membership_code: moviBackJson.membership.membership_code ?? null,
          } : null,
          eligibility: moviBackJson?.eligibility ? {
            can_use_card: moviBackJson.eligibility.can_use_card === true,
            can_redeem: moviBackJson.eligibility.can_redeem === true,
            human_message: moviBackJson.eligibility.human_message ?? null,
          } : null,
        });
        setSectionErrors((current) => ({ ...current, moviback: "" }));
      } else { setMoviBack({ points: null, membershipStatus: null, membershipCode: null, membership: null, eligibility: null }); setSectionErrors((current) => ({ ...current, moviback: moviBackJson.error || "MoviBack non disponibile" })); }
      const communicationsJson = await communicationsRes.json().catch(() => ({}));
      setCommunications(communicationsRes.ok ? (communicationsJson.data ?? []) as HomeCommunication[] : []);
      const leagueJson = await leagueRes.json().catch(() => ({ visible: false }));
      setMondayLeagueHero(leagueRes.ok && leagueJson.visible ? leagueJson as MondayLeagueHero : { visible: false });
      if (succedeRes) { const json = await succedeRes.json().catch(() => ({})); setSuccede(succedeRes.ok ? (json.data ?? []) as ContentItem[] : []); setSectionErrors((current) => ({ ...current, succede: succedeRes.ok ? "" : json.error || "Contenuti non disponibili" })); }
      if (pastRes) { const json = await pastRes.json().catch(() => ({})); setPast(pastRes.ok ? (json.data ?? []) as ContentItem[] : []); setSectionErrors((current) => ({ ...current, past: pastRes.ok ? "" : json.error || "Contenuti non disponibili" })); }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (!silent) setHomeError(errorMessage(error, "Home temporaneamente non disponibile"));
    } finally { if (!silent) setLoading(false); }
  }

  async function searchMy(phone: string) {
    const normalized = normalizePhone(phone);
    if (!isValidPhone(normalized)) { setMyRegs([]); return; }
    try {
      const response = await fetch("/api/registrations/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: normalized }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Errore ricerca iscrizioni");
      const exact = ((json.data ?? []) as MyReg[]).filter((registration) => normalized === normalizePhone(registration.p1_phone) || normalized === normalizePhone(registration.p2_phone ?? ""));
      setMyRegs(exact.map((registration) => ({ ...registration, is_reserve: Boolean(registration.is_reserve), p2_phone: registration.p2_phone ?? null })));
    } catch (error) { toast.error(errorMessage(error, "Errore ricerca iscrizioni")); }
  }

  async function cancelRegistrationByTournament(tournamentId: string) {
    try {
      if (!isValidPhone(effectivePhone)) throw new Error("Accedi con il tuo profilo per gestire l’iscrizione");
      const registration = myRegs.find((item) => item.tournament_id === tournamentId);
      if (!registration || !confirm("Vuoi cancellare la tua iscrizione?")) return;
      const response = await fetch(`/api/registrations/${registration.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: effectivePhone }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Errore cancellazione");
      toast.success("Iscrizione cancellata"); await searchMy(effectivePhone); await loadAll();
    } catch (error) { toast.error(errorMessage(error, "Errore cancellazione")); }
  }

  async function updateNotificationState(communicationId: string, action: "read" | "dismiss") {
    try {
      const response = await fetch("/api/user/communications/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ communication_id: communicationId, action }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Errore aggiornamento notifica");
      setCommunications((current) => action === "dismiss" ? current.filter((item) => item.id !== communicationId) : current.map((item) => item.id === communicationId ? { ...item, read_at: new Date().toISOString() } : item));
    } catch (error) { toast.error(errorMessage(error, "Errore aggiornamento notifica")); }
  }

  async function markAllNotificationsRead() {
    const ids = communications.filter((notification) => !notification.read_at).map((notification) => notification.id);
    if (!ids.length) return;
    try {
      const response = await fetch("/api/user/communications/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ communication_ids: ids, action: "read_all" }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Errore aggiornamento notifiche");
      const now = new Date().toISOString();
      setCommunications((current) => current.map((notification) => ({ ...notification, read_at: notification.read_at || now })));
    } catch (error) { toast.error(errorMessage(error, "Errore aggiornamento notifiche")); }
  }

  function statusForTournament(tournamentId: string): "none" | "main" | "reserve" {
    if (!isValidPhone(effectivePhone)) return "none";
    const registration = myRegs.find((item) => item.tournament_id === tournamentId);
    return registration ? registration.is_reserve ? "reserve" : "main" : "none";
  }
  function canUserJoinTournament(tournament: PublicTournament) {
    if (!user?.gender) return true;
    return !((tournament.category === "Femminile" && user.gender === "M") || (tournament.category === "Maschile" && user.gender === "F"));
  }
  function openTournamentRegistration(tournament: PublicTournament) {
    if (!user) { setPendingTournament(tournament); setUserDialogOpen(true); return; }
    if (!canUserJoinTournament(tournament)) { toast.error("Non puoi iscriverti a questo torneo"); return; }
    setSelectedTournament(tournament);
  }
  function changeNotifications(next: boolean) {
    setNotificationsOpen(next);
    if (!next && notificationFocusRef.current) { const target = notificationFocusRef.current; notificationFocusRef.current = null; window.requestAnimationFrame(() => target.focus()); }
  }

  useEffect(() => {
    const openNotifications = () => { notificationFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setNotificationsOpen(true); };
    const openFromHash = () => { if (window.location.hash === "#notifiche") setNotificationsOpen(true); };
    window.addEventListener("movi:open-notifications", openNotifications); window.addEventListener("hashchange", openFromHash); openFromHash();
    return () => { window.removeEventListener("movi:open-notifications", openNotifications); window.removeEventListener("hashchange", openFromHash); };
  }, []);
  useEffect(() => {
    void loadAll();
    listTimerRef.current = window.setInterval(() => { if (document.visibilityState === "visible") void loadAll({ silent: true, includeBootstrap: false }); }, 15000);
    const onVisibility = () => { if (document.visibilityState === "visible") void loadAll({ silent: true }); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); listAbortRef.current?.abort(); if (listTimerRef.current) window.clearInterval(listTimerRef.current); };
  }, []);
  useEffect(() => { if (user && (!user.privacy_accepted_at || !user.terms_accepted_at || !user.age_confirmed_at)) { setPendingTournament(null); setUserDialogOpen(true); } }, [user]);
  useEffect(() => { const timer = window.setTimeout(() => { void searchMy(effectivePhone); }, 300); return () => window.clearTimeout(timer); }, [effectivePhone]);

  const upcomingTournaments = filterHomeTournaments(tournaments);

  if (loading) return <main className={home.page}><div className={home.skeletonGrid} aria-label="Caricamento Home"><div className={home.skeletonBlock} /><div className={home.skeletonBlock} /><div className={home.skeletonBlock} /></div></main>;
  if (homeError) return <main className={home.page}><PublicState kind="error" title="Home non disponibile" message={homeError} action={<PublicButton variant="secondary" onClick={() => void loadAll()}>Riprova</PublicButton>} /></main>;

  const name = firstName(user);
  const hasUsableMoviBack = moviBack.membershipStatus === "approved" && moviBack.eligibility?.can_use_card === true;
  const canRedeemMoviBackRewards = moviBack.membershipStatus === "approved" && moviBack.eligibility?.can_redeem === true;
  const moviBackStatus = moviBack.membershipStatus === "pending_review"
    ? { label: "In revisione", tone: "warning" as const }
    : moviBack.membershipStatus === "rejected"
      ? { label: "Non approvata", tone: "error" as const }
      : moviBack.membershipStatus === "suspended"
        ? { label: "Tessera sospesa", tone: "error" as const }
        : moviBack.membershipStatus === "approved" && !hasUsableMoviBack
          ? { label: "Tessera non disponibile", tone: "warning" as const }
          : { label: "Tessera attiva", tone: "success" as const };
  return <>
    <PublicHomeHeaderSlot><div className={home.headerGreeting}><div><h1>{name ? `Ciao ${name}.` : "Ciao."}</h1><p>Che facciamo oggi?</p></div>{user ? <button className={home.headerUtility} type="button" onClick={async () => { await fetch("/api/user/logout", { method: "POST" }); setUser(null); setMyRegs([]); setCommunications([]); toast.success("Sei uscito"); }}>Esci</button> : <Link className={home.textLink} href="/accedi">Accedi</Link>}</div></PublicHomeHeaderSlot>
    <main className={home.page}><div className={home.stack}>
      <section className={home.section}>{sectionErrors.moviback ? <><SectionHeader title="MoviBack" /><PublicState kind="error" title="MoviBack non disponibile" message={sectionErrors.moviback} action={<PublicButton variant="secondary" onClick={() => void loadAll()}>Riprova</PublicButton>} /></> : <PublicCard family="highlight" className={home.moviback}>
        <div className={home.movibackTop}><h2 className={home.movibackTitle}>MoviBack</h2><button className={home.qrAction} type="button" onClick={(event) => window.dispatchEvent(new CustomEvent(OPEN_PUBLIC_QR_EVENT, { detail: { membershipCode: moviBack.membershipCode ?? undefined, returnFocus: event.currentTarget } }))}>Mostra QR<ArrowRight size={17} aria-hidden /></button></div>
        <div className={`${home.balanceRow} ${!moviBack.membership ? home.balanceRowAccess : ""}`}>
          <span className={home.balanceIcon} aria-hidden><Coins size={29} /></span>
          <div className={home.balanceCopy}><span className={home.pointsLabel}>Punti disponibili</span><strong className={home.points}>{moviBack.points ?? "—"}<small>punti</small></strong></div>
          <div className={home.membershipState}>{!moviBack.membership
            ? <Link className={home.movibackAccessCta} href="/moviback">Accedi a MoviBack<ArrowRight size={17} aria-hidden /></Link>
            : <StatusBadge tone={moviBackStatus.tone}>{moviBackStatus.label}</StatusBadge>}
          </div>
        </div>
        <div className={home.movibackLinks}>
          {canRedeemMoviBackRewards
            ? <Link className={home.miniAction} href="/moviback/premi"><Ticket size={19} aria-hidden />Premi</Link>
            : <span className={`${home.miniAction} ${home.miniActionDisabled}`} aria-disabled="true"><Ticket size={19} aria-hidden />Premi</span>}
          {hasUsableMoviBack
            ? <Link className={home.miniAction} href="/moviback"><History size={19} aria-hidden />Storico</Link>
            : <span className={`${home.miniAction} ${home.miniActionDisabled}`} aria-disabled="true"><History size={19} aria-hidden />Storico</span>}
          <MembershipCardModal user={user} membership={moviBack.membership} eligibility={moviBack.eligibility} trigger={<button className={home.miniAction} type="button"><WalletCards size={19} aria-hidden />La mia tessera</button>} />
        </div>
      </PublicCard>}</section>
      <section className={home.section} aria-label="Azioni principali"><div className={home.primaryGrid}><Link className={`${home.quickAction} ${home.quickActionPlay}`} href="/richieste/gioca"><span className={home.quickIcon}><UsersRound size={28} aria-hidden /></span><strong>Gioca</strong><span className={home.quickCopy}>Trova una partita.</span><span className={home.quickArrow} aria-hidden><ArrowRight size={17} /></span></Link><Link className={`${home.quickAction} ${home.quickActionTrain}`} href="/richieste/allenati"><span className={home.quickIcon}><Dumbbell size={28} aria-hidden /></span><strong>Allenati</strong><span className={home.quickCopy}>Trova il gruppo giusto.</span><span className={home.quickArrow} aria-hidden><ArrowRight size={17} /></span></Link><Link className={`${home.quickAction} ${home.quickActionBook}`} href="/prenota"><span className={home.quickIcon}><CalendarDays size={28} aria-hidden /></span><strong>Prenota</strong><span className={home.quickCopy}>Prenota un campo.</span><span className={home.quickArrow} aria-hidden><ArrowRight size={17} /></span></Link></div></section>
      <div id="public-sticky-sentinel" className={home.sentinel} aria-hidden />
      <section className={home.section}><SectionHeader title="Tornei in evidenza" copy="Questa settimana e la prossima." href="/tornei" linkLabel="Vedi tutti" />{upcomingTournaments.length ? <div className={home.tournamentList}>{upcomingTournaments.map((tournament) => <HomeTournamentCard tournament={tournament} circuit={circuits.find((circuit) => circuit.id === tournament.circuit_id)} status={statusForTournament(tournament.id)} onRegister={() => openTournamentRegistration(tournament)} key={tournament.id} />)}</div> : <PublicState kind="empty" title="Nessun torneo nelle prossime due settimane" message="Consulta il calendario completo per tutte le prossime date." action={<Link className={`${publicStyles.button} ${publicStyles.tertiary}`} href="/tornei">Vai ai tornei</Link>} />}{myRegs.length ? <div className={home.registrationList} aria-label="Le tue iscrizioni">{myRegs.map((registration) => { const tournament = tournaments.find((item) => item.id === registration.tournament_id); return tournament ? <div className={home.registrationRow} key={registration.id}><div><strong>{tournament.name}</strong><span>{registration.is_reserve ? "Lista riserve" : "Iscrizione confermata"}</span></div><PublicButton variant="danger" onClick={() => void cancelRegistrationByTournament(tournament.id)}>Cancella</PublicButton></div> : null; })}</div> : null}</section>
      {succede.length ? <EditorialCarousel title="Succede in Padelleria" label="Succede in Padelleria" items={succede} href="/padelleria" /> : sectionErrors.succede ? <section className={home.section}><SectionHeader title="Succede in Padelleria" /><PublicState kind="error" title="Contenuti non disponibili" message={sectionErrors.succede} action={<PublicButton variant="secondary" onClick={() => void loadAll()}>Riprova</PublicButton>} /></section> : null}
      {mondayLeagueHero.visible ? <section className={home.section} aria-label="Monday League"><Link className={`${home.leagueBanner} ${home.leagueBannerLink}`} href="/monday-league" aria-label="Apri Monday League" /></section> : null}
      {circuits.length || sectionErrors.circuits ? <section id="circuiti" className={home.section}><SectionHeader title="I tuoi circuiti" />{circuits.length ? <PublicCarousel label="I tuoi circuiti">{circuits.map((circuit) => <Link className={`${home.carouselItem} ${home.circuitCardLink}`} href={`/circuiti/${circuit.slug}`} aria-label={`Apri circuito ${circuit.name}`} key={circuit.id}><PublicCard family="compact" className={`${home.circuitCard} ${circuit.home_image_url ? home.circuitImageCard : ""}`}>{circuit.home_image_url ? <Image className={home.circuitImage} src={circuit.home_image_url} alt={`Circuito ${circuit.name}`} fill sizes="(min-width: 1024px) 324px, (min-width: 768px) 317px, 84vw" unoptimized /> : <><span className={home.circuitAccent} aria-hidden /><span className={home.circuitStatus}><span aria-hidden />{circuit.status === "active" ? "In corso" : "Concluso"}</span><h3>{circuit.name}</h3><div className={home.circuitStats}><span><strong>{circuit.ranking_groups_count}</strong> classifiche</span><span><strong>{circuit.played_stages_count}</strong> tappe giocate</span></div></>}</PublicCard></Link>)}</PublicCarousel> : <PublicState kind="error" title="Circuiti non disponibili" message={sectionErrors.circuits} action={<PublicButton variant="secondary" onClick={() => void loadAll()}>Riprova</PublicButton>} />}</section> : null}
      {past.length ? <EditorialCarousel title="È successo in Padelleria" label="È successo in Padelleria" items={past} href="/padelleria?view=archivio" /> : sectionErrors.past ? <section className={home.section}><SectionHeader title="È successo in Padelleria" /><PublicState kind="error" title="Contenuti non disponibili" message={sectionErrors.past} action={<PublicButton variant="secondary" onClick={() => void loadAll()}>Riprova</PublicButton>} /></section> : null}
      <section className={home.section} aria-label="Servizi rapidi"><div className={home.serviceGrid}><Link className={home.serviceLink} href="/le-mie-attivita"><CalendarDays size={21} aria-hidden /><span className={home.serviceText}>Le mie attività</span></Link><Link className={home.serviceLink} href="/store"><ShoppingBag size={21} aria-hidden /><span className={home.serviceText}>Store MOVI</span></Link><Link className={home.serviceLink} href="/partner"><Store size={21} aria-hidden /><span className={home.serviceText}>Partner</span></Link><Link className={home.serviceLink} href="/contatti"><MessageCircle size={21} aria-hidden /><span className={home.serviceText}>Contattaci</span></Link></div></section>
      <footer className={home.brandFooter}><div className={home.socials} aria-label="Collegamenti esterni MOVI">{publicSocialLinks.map((link) => <a className={home.socialLink} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`${link.label}, si apre in una nuova scheda`} title={link.label} key={link.href}>{link.kind === "facebook" ? <FaFacebookF aria-hidden /> : link.kind === "instagram" ? <FaInstagram aria-hidden /> : link.kind === "youtube" ? <FaYoutube aria-hidden /> : <Globe2 size={20} aria-hidden />}</a>)}</div><nav className={home.footer} aria-label="Link legali">{publicLegalLinks.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}</nav></footer>
    </div></main>
    <PublicModal open={notificationsOpen} onOpenChange={changeNotifications} title="Notifiche" description={unreadNotifications ? `${unreadNotifications} non lette` : "Tutto letto"}>{communications.length ? <><div className={home.notificationTools}><PublicButton variant="tertiary" disabled={!unreadNotifications} onClick={() => void markAllNotificationsRead()}>Segna tutte come lette</PublicButton></div><div className={home.notificationList}>{communications.map((notification) => <article className={`${home.notification} ${!notification.read_at ? home.notificationUnread : ""}`} key={notification.id}><h3>{notification.title}</h3><p>{notification.body}</p><div className={home.notificationActions}>{notification.cta_url ? <a className={`${publicStyles.button} ${publicStyles.secondary}`} href={notification.cta_url} onClick={() => { if (!notification.read_at) void updateNotificationState(notification.id, "read"); }}>{notification.cta_label || "Apri"}</a> : null}{!notification.read_at ? <PublicButton variant="tertiary" onClick={() => void updateNotificationState(notification.id, "read")}>Segna come letta</PublicButton> : null}<PublicButton variant="tertiary" onClick={() => void updateNotificationState(notification.id, "dismiss")}>Elimina</PublicButton></div></article>)}</div></> : <PublicState kind="empty" title="Nessuna notifica" message="Le nuove comunicazioni compariranno qui." />}</PublicModal>
    <RegistrationDialog tournament={selectedTournament} open={Boolean(selectedTournament)} onClose={() => setSelectedTournament(null)} user={user} onSuccess={async () => { setSelectedTournament(null); window.scrollTo({ top: 0, behavior: "smooth" }); await loadAll(); if (isValidPhone(effectivePhone)) await searchMy(effectivePhone); }} />
    <UserLoginDialog open={userDialogOpen} existingUser={user} onClose={() => { if (missingRequiredConsents) { toast.error("Devi confermare Privacy, Termini e maggiore età per continuare"); return; } setUserDialogOpen(false); setPendingTournament(null); }} onSaved={async (savedUser) => { setUser(savedUser); toast.success("Dati salvati"); const tournament = pendingTournament; setUserDialogOpen(false); setPendingTournament(null); if (tournament) { await searchMy(normalizePhone(savedUser.phone)); const blocked = (tournament.category === "Femminile" && savedUser.gender === "M") || (tournament.category === "Maschile" && savedUser.gender === "F"); if (blocked) { toast.error("Non puoi iscriverti a questo torneo"); return; } setSelectedTournament(tournament); } }} />
  </>;
}
