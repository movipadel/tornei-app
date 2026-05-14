"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  CalendarDays,
  ShoppingBag,
  Loader2,
  MessageCircle,
  Trophy,
  WalletCards,
} from "lucide-react";

import { FaInstagram, FaFacebookF } from "react-icons/fa";
import Link from "next/link";

import PublicNav from "@/components/PublicNav";
import TournamentCard, { PublicTournament } from "@/components/tournaments/TournamentCard";
import RegistrationDialog from "@/components/tournaments/RegistrationDialog";
import UserLoginDialog from "@/components/UserLoginDialog";
import TournamentLiveDialog from "@/components/tournaments/TournamentLiveDialog";

type AppSettings = {
  home_title: string;
  home_subtitle: string;
  home_logo_url: string | null;
};

type User = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  gender: "M" | "F";
  privacy_accepted_at?: string | null;
  terms_accepted_at?: string | null;
  age_confirmed_at?: string | null;
  marketing_accepted?: boolean | null;
  marketing_accepted_at?: string | null;
};

type MyReg = {
  id: string;
  tournament_id: string;
  is_reserve: boolean;
  p1_phone: string;
  p2_phone?: string | null;
};

type HomeCommunication = {
  id: string;
  target: string;
  tournament_id: string | null;
  title: string;
  body: string;
  image_path: string | null;
  cta_label: string | null;
  cta_url: string | null;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
};

type PublicCircuit = {
  id: string;
  name: string;
  slug: string;
  tournament_type: string;
  status: string;
  ranking_groups_count: number;
  played_stages_count: number;
  rules_url: string | null;
  hero_logo_url?: string | null;
  hero_logo_2_url?: string | null;
  hero_logo_3_url?: string | null;
  hero_subtitle?: string | null;
  theme_key?: string | null;
};

const normalizePhone = (s: string) => String(s ?? "").replace(/\s+/g, "").trim();
const isValidPhone = (p: string) => normalizePhone(p).length >= 8;

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [loadingMy, setLoadingMy] = useState(false);

  const [tournaments, setTournaments] = useState<PublicTournament[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [circuits, setCircuits] = useState<PublicCircuit[]>([]);

  // user session (opzionale)
  const [user, setUser] = useState<User | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  // fallback phone (se NON loggato)
  const [phone, setPhone] = useState("");
  const [myRegs, setMyRegs] = useState<MyReg[]>([]);
  const [moviBackPoints, setMoviBackPoints] = useState<number | null>(null);
  const [communications, setCommunications] = useState<HomeCommunication[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const unreadNotifications = communications.filter((n) => !n.read_at).length;
  const missingRequiredConsents =
  Boolean(user) &&
  (!user?.privacy_accepted_at ||
    !user?.terms_accepted_at ||
    !user?.age_confirmed_at);

  const [selectedTournament, setSelectedTournament] = useState<PublicTournament | null>(null);
  const [pendingTournament, setPendingTournament] = useState<PublicTournament | null>(null);

  const effectivePhone = user?.phone ? normalizePhone(user.phone) : normalizePhone(phone);

  // ✅ auto-refresh lista tornei (quando la pagina è visibile)
  const listTimerRef = useRef<number | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);

  async function loadAll(opts?: { silent?: boolean }) {
    const silent = Boolean(opts?.silent);

    // evita fetch sovrapposti
    listAbortRef.current?.abort();
    const ac = new AbortController();
    listAbortRef.current = ac;

    if (!silent) setLoading(true);

    try {
      const [tRes, sRes, meRes, cRes, mbRes, commRes] = await Promise.all([
  fetch("/api/tournaments", { cache: "no-store", signal: ac.signal }),
  fetch("/api/app-settings", { cache: "no-store", signal: ac.signal }),
  fetch("/api/user/me", { cache: "no-store", signal: ac.signal }),
  fetch("/api/circuits", { cache: "no-store", signal: ac.signal }),
  fetch("/api/moviback/me", { cache: "no-store", signal: ac.signal }),
  fetch("/api/user/communications", { cache: "no-store", signal: ac.signal }),
]);

      const tJson = await tRes.json().catch(() => ({}));
      if (!tRes.ok) throw new Error(tJson.error || "Errore caricamento tornei");
      setTournaments((tJson.data ?? []) as PublicTournament[]);

      const sJson = await sRes.json().catch(() => ({}));
      if (sRes.ok) setSettings(sJson as AppSettings);
      else setSettings({ home_title: "Tornei", home_subtitle: "", home_logo_url: null });

      const meJson = await meRes.json().catch(() => ({}));
      setUser(meJson.user ?? null);

      const cJson = await cRes.json().catch(() => ({}));
if (cRes.ok) setCircuits((cJson.data ?? []) as PublicCircuit[]);
else setCircuits([]);
const mbJson = await mbRes.json().catch(() => ({}));
if (mbRes.ok && mbJson?.membership?.status === "approved") {
  setMoviBackPoints(Number(mbJson.points ?? 0));
} else {
  setMoviBackPoints(null);
}
const commJson = await commRes.json().catch(() => ({}));
if (commRes.ok) {
  setCommunications((commJson.data ?? []) as HomeCommunication[]);
} else {
  setCommunications([]);
}
    } catch (e: any) {
      // Abort = normale durante refresh/cleanup
      if (e?.name === "AbortError") return;

      if (!silent) toast.error(e?.message ?? "Errore");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function searchMy(phoneValue: string) {
    const p = normalizePhone(phoneValue);
    if (!isValidPhone(p)) {
      setMyRegs([]);
      return;
    }

    setLoadingMy(true);
    try {
      // Il search server fa match parziale, noi filtriamo ESATTO qui.
      const res = await fetch("/api/registrations/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore ricerca");

      const rows = (json.data ?? []) as any[];
      const exact = rows.filter((r) => {
        const p1 = normalizePhone(r.p1_phone ?? "");
        const p2 = normalizePhone(r.p2_phone ?? "");
        return p === p1 || (p2 && p === p2);
      });

      setMyRegs(
        exact.map((r) => ({
          id: r.id,
          tournament_id: r.tournament_id,
          is_reserve: Boolean(r.is_reserve),
          p1_phone: r.p1_phone,
          p2_phone: r.p2_phone ?? null,
        }))
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setLoadingMy(false);
    }
  }

  async function cancelRegistrationByTournament(tournamentId: string) {
    try {
      const p = effectivePhone;
      if (!isValidPhone(p)) throw new Error("Inserisci il numero completo (o salva i tuoi dati)");

      const reg = myRegs.find((r) => r.tournament_id === tournamentId);
      if (!reg) return;

      const ok = confirm("Vuoi cancellare la tua iscrizione?");
      if (!ok) return;

      const res = await fetch(`/api/registrations/${reg.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore cancellazione");

      toast.success("Iscrizione cancellata");
      await searchMy(p);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  async function updateNotificationState(
  communicationId: string,
  action: "read" | "dismiss"
) {
  try {
    const res = await fetch("/api/user/communications/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communication_id: communicationId, action }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json.error || "Errore aggiornamento notifica");
    }

    setCommunications((prev) =>
      action === "dismiss"
        ? prev.filter((n) => n.id !== communicationId)
        : prev.map((n) =>
            n.id === communicationId
              ? { ...n, read_at: new Date().toISOString() }
              : n
          )
    );
  } catch (e: any) {
    toast.error(e?.message || "Errore");
  }
}

async function markAllNotificationsRead() {
  try {
    const ids = communications.filter((n) => !n.read_at).map((n) => n.id);

    if (ids.length === 0) return;

    const res = await fetch("/api/user/communications/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communication_ids: ids, action: "read_all" }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json.error || "Errore aggiornamento notifiche");
    }

    const now = new Date().toISOString();

    setCommunications((prev) =>
      prev.map((n) => ({
        ...n,
        read_at: n.read_at || now,
      }))
    );
  } catch (e: any) {
    toast.error(e?.message || "Errore");
  }
}

  function statusForTournament(tournamentId: string): "none" | "main" | "reserve" {
    const p = effectivePhone;
    if (!isValidPhone(p)) return "none";

    const r = myRegs.find((x) => x.tournament_id === tournamentId);
    if (!r) return "none";
    return r.is_reserve ? "reserve" : "main";
  }

  function canUserJoinTournament(t: PublicTournament): boolean {
    // regola sesso solo se loggato
    if (!user?.gender) return true;

    if (t.category === "Femminile" && user.gender === "M") return false;
    if (t.category === "Maschile" && user.gender === "F") return false;

    return true;
  }

    const upcomingTournaments = tournaments
  .filter((t) => {
    if (!t.date) return false;

    const tournamentDate = new Date(`${t.date}T${t.time || "00:00"}`);

    const now = new Date();

    // Lunedì della settimana corrente
    const startOfCurrentWeek = new Date(now);
    const day = startOfCurrentWeek.getDay(); // 0 domenica, 1 lunedì...
    const diffToMonday = day === 0 ? -6 : 1 - day;

    startOfCurrentWeek.setDate(startOfCurrentWeek.getDate() + diffToMonday);
    startOfCurrentWeek.setHours(0, 0, 0, 0);

    // Domenica della seconda settimana successiva
    const endOfSecondNextWeek = new Date(startOfCurrentWeek);
    endOfSecondNextWeek.setDate(startOfCurrentWeek.getDate() + 20);
    endOfSecondNextWeek.setHours(23, 59, 59, 999);

    return tournamentDate >= now && tournamentDate <= endOfSecondNextWeek;
  })
  .sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time || "00:00"}`).getTime();
    const dateB = new Date(`${b.date}T${b.time || "00:00"}`).getTime();
    return dateA - dateB;
  })
  .slice(0, 5);

function formatTournamentDay(t: PublicTournament) {
  const d = new Date(`${t.date}T${t.time || "00:00"}`);

  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: d.toLocaleDateString("it-IT", { month: "short" }).toUpperCase(),
  };
}

function formatTournamentTime(t: PublicTournament) {
  return t.time ? t.time.slice(0, 5) : "";
}

function shortLocation(location: string) {
  return String(location || "")
    .replace(/^Movi Club\s+/i, "")
    .replace(/^MOVI Club\s+/i, "")
    .trim();
}

function tournamentTypeDateStyle(type: string): React.CSSProperties {
  const t = String(type || "").toLowerCase();

  if (t.includes("baraonda")) {
    return {
      background: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
      color: "#1f2937",
      border: "1px solid rgba(245,158,11,0.55)",
      boxShadow: "0 8px 18px rgba(245,158,11,0.18)",
    };
  }

  if (t.includes("coppie")) {
    return {
      background: "linear-gradient(135deg, #14b8a6 0%, #2dd4bf 100%)",
      color: "#042f2e",
      border: "1px solid rgba(45,212,191,0.55)",
      boxShadow: "0 8px 18px rgba(45,212,191,0.16)",
    };
  }

  return {
    background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
    color: "#ffffff",
    border: "1px solid rgba(99,102,241,0.45)",
    boxShadow: "0 8px 18px rgba(99,102,241,0.18)",
  };
}

function tournamentMeta(t: PublicTournament) {
  return [t.category, t.level, formatTournamentTime(t), shortLocation(t.location)]
    .filter(Boolean)
    .join(" • ");
}
const premiumActionStyle = (accent: string): React.CSSProperties => ({
  height: 58,
  minHeight: 58,
  borderRadius: 18,
  padding: "0 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 12,
  textDecoration: "none",
  color: "white",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: `0 0 0 1px rgba(255,255,255,0.02), 0 14px 30px rgba(0,0,0,0.16), 0 0 22px ${accent}20`,
  backdropFilter: "blur(14px)",
  transition: "transform 160ms ease, box-shadow 160ms ease",
willChange: "transform",
});

const legalFooterLink: React.CSSProperties = {
  color: "rgba(255,255,255,0.42)",
  textDecoration: "none",
};

const premiumIconStyle = (accent: string): React.CSSProperties => ({
  width: 36,
  height: 36,
  borderRadius: 13,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 36px",
  color: "#ffffff",
  background: `linear-gradient(135deg, ${accent}, rgba(255,255,255,0.10))`,
  boxShadow: `0 10px 22px ${accent}30`,
});

const premiumEyebrowStyle: React.CSSProperties = {
  display: "block",
  color: "rgba(255,255,255,0.50)",
  fontSize: 11,
  lineHeight: 1,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const premiumTitleStyle: React.CSSProperties = {
  display: "block",
  marginTop: 6,
  color: "#ffffff",
  fontSize: 18,
  lineHeight: 1,
  fontWeight: 820,
  letterSpacing: -0.5,
};

const premiumTitleSmallStyle: React.CSSProperties = {
  ...premiumTitleStyle,
  fontSize: 16,
};

const premiumArrowStyle: React.CSSProperties = {
  marginLeft: "auto",
  width: 30,
  height: 30,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.86)",
  fontSize: 18,
  fontWeight: 800,
  flexShrink: 0,
};

const premiumTextStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 2,
  minWidth: 0,
};

const premiumInlineTitleStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 36,
  color: "#ffffff",
  fontSize: 17,
  lineHeight: 1,
  fontWeight: 760,
  letterSpacing: -0.35,
  whiteSpace: "nowrap",
};

const summaryItemStyle: React.CSSProperties = {
  minHeight: 76,
  padding: "12px 8px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  color: "rgba(255,255,255,0.86)",
  textAlign: "center",
};

const notificationSmallBtn: React.CSSProperties = {
  minHeight: 32,
  padding: "0 11px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.78)",
  fontSize: 12,
  fontWeight: 850,
  cursor: "pointer",
};


  useEffect(() => {
    loadAll();

    // ✅ timer refresh lista tornei (solo quando la pagina è visibile)
    listTimerRef.current = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadAll({ silent: true });
    }, 15000);

    const onVis = () => {
      if (document.visibilityState === "visible") loadAll({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      listAbortRef.current?.abort();
      listAbortRef.current = null;

      if (listTimerRef.current) window.clearInterval(listTimerRef.current);
      listTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
  if (!user) return;

  const missing =
    !user.privacy_accepted_at ||
    !user.terms_accepted_at ||
    !user.age_confirmed_at;

  if (missing) {
    setPendingTournament(null);
    setUserDialogOpen(true);
  }
}, [user]);

  // quando cambia telefono (guest) o user.phone, aggiorna myRegs (debounce)
  useEffect(() => {
    const p = effectivePhone;
    const t = setTimeout(() => searchMy(p), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.phone, phone]);

  if (loading) {
    return (
      <div className="base44-home-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#4f46e5" }} />
      </div>
    );
  }

  return (
    <div
  className="base44-home-wrap"
  style={{
    background:
      "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
    minHeight: "100dvh",
  }}
>
      <PublicNav />

      <div
  className="base44-home-container"
  style={{
    paddingTop: 0,
  }}
>
     {/* HERO / APP LAUNCHER PREMIUM */}
<section
  style={{
    position: "relative",
    marginBottom: 28,
    padding: "12px 18px 22px",
    borderRadius: 0,
    overflow: "hidden",
    color: "white",
  }}
>
  <div
    aria-hidden
    style={{
      position: "absolute",
      inset: "-80px -40px auto -40px",
      height: 420,
      background:
        "radial-gradient(circle at 20% 0%, rgba(14,165,233,0.32), transparent 35%), radial-gradient(circle at 85% 10%, rgba(99,102,241,0.36), transparent 38%)",
      pointerEvents: "none",
    }}
  />

  <div style={{ position: "relative", zIndex: 1 }}>
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 18,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            width: 54,
            height: 34,
            backgroundImage: "url('/home/movi-logo.png')",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "left center",
            opacity: 0.92,
          }}
        />

        <div
          style={{
            marginTop: 16,
            fontSize: 11,
            fontWeight: 650,
            color: "rgba(255,255,255,0.52)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          MOVI App
        </div>

        <h1
          style={{
            margin: "8px 0 0",
            fontSize: "clamp(27px, 6.6vw, 36px)",
            lineHeight: 1,
            fontWeight: 850,
            letterSpacing: -1.2,
            color: "#ffffff",
            whiteSpace: "nowrap",
          }}
        >
          Ciao {user?.full_name?.split(" ")?.[0] || "benvenuto"}
        </h1>

        <p
          style={{
            margin: "10px 0 0",
            maxWidth: "100%",
            color: "rgba(255,255,255,0.62)",
            fontSize: 14,
            lineHeight: 1.25,
            fontWeight: 520,
            whiteSpace: "nowrap",
          }}
        >
          Il mondo MOVI in un’unica app.
        </p>
      </div>

      {user ? (
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/user/logout", { method: "POST" });
            toast.success("Sei uscito");
            setUser(null);
            setMyRegs([]);
            setCommunications([]);
          }}
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.86)",
            borderRadius: 999,
            padding: "8px 13px",
            fontWeight: 750,
            fontSize: 13,
            cursor: "pointer",
            backdropFilter: "blur(12px)",
            flexShrink: 0,
          }}
        >
          Esci
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setUserDialogOpen(true)}
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.86)",
            borderRadius: 999,
            padding: "8px 13px",
            fontWeight: 750,
            fontSize: 13,
            cursor: "pointer",
            backdropFilter: "blur(12px)",
            flexShrink: 0,
          }}
        >
          Accedi
        </button>
      )}
    </div>

    <div
  style={{
    marginBottom: 16,
    borderRadius: 22,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    overflow: "hidden",
    backdropFilter: "blur(14px)",
  }}
>
  <div style={summaryItemStyle}>
    <Trophy className="w-4 h-4" strokeWidth={1.6} style={{ color: "#a78bfa" }} />
    <strong>{myRegs.length}</strong>
    <span>Iscrizioni</span>
  </div>

  <div style={{ ...summaryItemStyle, borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
  <WalletCards className="w-4 h-4" strokeWidth={1.6} style={{ color: "#2dd4bf" }} />
  <strong>{moviBackPoints !== null ? moviBackPoints : "—"}</strong>
  <span>MoviBack</span>
</div>

  <button
  type="button"
  onClick={() => setNotificationsOpen(true)}
  style={{
    ...summaryItemStyle,
    position: "relative",
    borderLeft: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    borderTop: 0,
    borderRight: 0,
    borderBottom: 0,
    cursor: "pointer",
    width: "100%",
    fontFamily: "inherit",
  }}
>
  <div style={{ position: "relative" }}>
    <Bell className="w-4 h-4" strokeWidth={1.6} style={{ color: "#38bdf8" }} />

    {unreadNotifications > 0 ? (
      <span
        style={{
          position: "absolute",
          top: -10,
          right: -14,
          minWidth: 18,
          height: 18,
          padding: "0 5px",
          borderRadius: 999,
          background: "#ef4444",
          color: "white",
          fontSize: 10,
          fontWeight: 950,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: "2px solid rgba(15,23,42,0.95)",
          lineHeight: 1,
        }}
      >
        {unreadNotifications > 9 ? "9+" : unreadNotifications}
      </span>
    ) : null}
  </div>

  <strong>{communications.length}</strong>
  <span>Notifiche</span>
</button>
</div>

    <div style={{ display: "grid", gap: 10 }}>
  {/* ROW 1 */}
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
    }}
  >
    <Link
      href="/tornei"
      style={premiumActionStyle("#7c3aed")}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <span style={premiumIconStyle("#7c3aed")}>
        <Trophy className="w-4 h-4" strokeWidth={1.6} />
      </span>
      <span style={premiumInlineTitleStyle}>Tornei</span>
    </Link>

    <Link
      href="/prenota"
      style={premiumActionStyle("#0ea5e9")}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <span style={premiumIconStyle("#0ea5e9")}>
        <CalendarDays className="w-4 h-4" strokeWidth={1.6} />
      </span>
      <span style={premiumInlineTitleStyle}>Prenota</span>
    </Link>
  </div>

  {/* ROW 2 */}
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
    }}
  >
    <Link
      href="/moviback"
      style={premiumActionStyle("#14b8a6")}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <span style={premiumIconStyle("#14b8a6")}>
        <WalletCards className="w-4 h-4" strokeWidth={1.6} />
      </span>
      <span style={premiumInlineTitleStyle}>MoviBack</span>
    </Link>

    <Link
      href="/store"
      style={premiumActionStyle("#d4af37")}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <span style={premiumIconStyle("#d4af37")}>
        <ShoppingBag className="w-4 h-4" strokeWidth={1.6} />
      </span>
      <span style={premiumInlineTitleStyle}>Store</span>
    </Link>
  </div>

  {/* ROW 3 */}
  <Link
    href="/contatti"
    style={premiumActionStyle("#38bdf8")}
    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
  >
    <span style={premiumIconStyle("#38bdf8")}>
      <MessageCircle className="w-4 h-4" strokeWidth={1.6} />
    </span>

    <span style={premiumInlineTitleStyle}>Contattaci</span>

    <span style={premiumArrowStyle}>→</span>
  </Link>
    </div>
  </div>
</section>

               {circuits.length > 0 ? (
  <section style={{ marginTop: 8, marginBottom: 22 }}>
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontWeight: 900,
          fontSize: "clamp(20px, 4vw, 26px)",
          color: "rgba(255,255,255,0.92)",
          lineHeight: 1.05,
          letterSpacing: -0.6,
        }}
      >
        Circuiti MOVI
      </div>

      <div
        style={{
          color: "rgba(255,255,255,0.52)",
          marginTop: 5,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        Classifiche e ranking dei circuiti ufficiali
      </div>
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 14,
      }}
    >
      {circuits.map((c) => {
        const isPadelSeries =
          String(c.theme_key ?? "").toLowerCase() === "padelseries";

        const background = isPadelSeries
          ? "linear-gradient(135deg, rgba(4,22,43,0.92), rgba(15,59,104,0.72), rgba(14,165,233,0.42))"
          : "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(49,46,129,0.72), rgba(79,70,229,0.42))";

        return (
          <div
            key={c.id}
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: 26,
              minHeight: 150,
              padding: 18,
              background,
              color: "white",
              boxShadow: "0 18px 42px rgba(0,0,0,0.22)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(14px)",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at top right, rgba(255,255,255,0.18), transparent 35%)",
                pointerEvents: "none",
              }}
            />

            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 114,
                gap: 14,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 850,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.58)",
                  }}
                >
                  Circuito ufficiale
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontWeight: 900,
                    fontSize: 24,
                    lineHeight: 1,
                    letterSpacing: -0.5,
                    color: "#ffffff",
                  }}
                >
                  {c.name}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "rgba(255,255,255,0.68)",
                    fontWeight: 650,
                    fontSize: 14,
                  }}
                >
                  {c.hero_subtitle || c.tournament_type}
                </div>
              </div>

              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <Link
                  href={`/circuiti/${c.slug}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 38,
                    padding: "0 15px",
                    borderRadius: 999,
                    background: "#ffffff",
                    color: "#0f172a",
                    fontWeight: 850,
                    fontSize: 13,
                    textDecoration: "none",
                  }}
                >
                  Vedi classifica
                </Link>

                {c.rules_url ? (
                  <a
                    href={c.rules_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      color: "rgba(255,255,255,0.68)",
                      fontWeight: 750,
                      fontSize: 13,
                      textDecoration: "none",
                    }}
                  >
                    Regolamento
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </section>
) : null}

{myRegs.length > 0 ? (
  <section style={{ marginTop: 22, marginBottom: 22 }}>
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontWeight: 900,
          fontSize: "clamp(20px, 4vw, 26px)",
          color: "rgba(255,255,255,0.92)",
          lineHeight: 1.1,
          letterSpacing: -0.4,
        }}
      >
        Le tue iscrizioni
      </div>

      <div
        style={{
          color: "rgba(255,255,255,0.52)",
          marginTop: 4,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        Gestisci rapidamente i tornei a cui sei iscritto
      </div>
    </div>

    <div
      style={{
        overflow: "hidden",
        borderRadius: 24,
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 18px 42px rgba(0,0,0,0.18)",
        backdropFilter: "blur(14px)",
      }}
    >
      {myRegs.map((reg, index) => {
        const t = tournaments.find((x) => x.id === reg.tournament_id);
        if (!t) return null;

        const date = formatTournamentDay(t);
        const isReserve = reg.is_reserve;

        return (
          <div
            key={reg.id}
            style={{
              display: "grid",
              gridTemplateColumns: "44px minmax(0, 1fr)",
              gap: 11,
              alignItems: "center",
              padding: "13px 12px",
              borderTop:
                index === 0 ? "none" : "1px solid rgba(255,255,255,0.07)",
              background: isReserve
                ? "linear-gradient(90deg, rgba(245,158,11,0.12), rgba(255,255,255,0.015))"
                : "linear-gradient(90deg, rgba(16,185,129,0.10), rgba(255,255,255,0.015))",
            }}
          >
            <div
              style={{
                width: 44,
                minHeight: 50,
                borderRadius: 15,
                ...tournamentTypeDateStyle(t.type),
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 950, color: "inherit" }}>
                {date.day}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  fontWeight: 900,
                  color: "inherit",
                  opacity: 0.72,
                }}
              >
                {date.month}
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 900,
                  color: "rgba(255,255,255,0.94)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  letterSpacing: -0.25,
                  lineHeight: 1.12,
                }}
              >
                {t.name}
              </div>

              <div
                style={{
                  marginTop: 7,
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {tournamentMeta(t)}
              </div>
            </div>

            <div
              style={{
                gridColumn: "2 / 3",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 8,
                marginTop: 4,
              }}
            >
              <span
                style={{
                  borderRadius: 999,
                  padding: "7px 10px",
                  background: isReserve
                    ? "rgba(245,158,11,0.16)"
                    : "rgba(16,185,129,0.16)",
                  color: isReserve ? "#fbbf24" : "#86efac",
                  border: isReserve
                    ? "1px solid rgba(245,158,11,0.24)"
                    : "1px solid rgba(16,185,129,0.24)",
                  fontSize: 11,
                  fontWeight: 850,
                  whiteSpace: "nowrap",
                }}
              >
                {isReserve ? "Riserva" : "Iscritto"}
              </span>

              <button
                type="button"
                onClick={() => cancelRegistrationByTournament(t.id)}
                aria-label="Cancella iscrizione"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: "1px solid rgba(239,68,68,0.28)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#f87171",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 16,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </section>
) : null}

{upcomingTournaments.length > 0 ? (
  <section style={{ marginTop: 22, marginBottom: 10 }}>
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontWeight: 900,
          fontSize: "clamp(20px, 4vw, 26px)",
          color: "rgba(255,255,255,0.92)",
          lineHeight: 1.1,
          letterSpacing: -0.4,
        }}
      >
        Tornei in arrivo
      </div>

      <div
        style={{
          color: "rgba(255,255,255,0.52)",
          marginTop: 4,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        I tornei delle prossime 2 settimane
      </div>
    </div>

    <div
      style={{
        overflow: "hidden",
        borderRadius: 24,
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 18px 42px rgba(0,0,0,0.18)",
        backdropFilter: "blur(14px)",
      }}
    >
      {upcomingTournaments.map((t, index) => {
        const status = statusForTournament(t.id);
        const allowed = canUserJoinTournament(t);
        const date = formatTournamentDay(t);

        const isRegistered = status === "main";
        const isReserve = status === "reserve";

        return (
          <div
            key={t.id}
            style={{
              display: "grid",
              gridTemplateColumns: "44px minmax(0, 1fr)",
              gap: 11,
              alignItems: "center",
              padding: "13px 12px",
              borderTop:
                index === 0 ? "none" : "1px solid rgba(255,255,255,0.07)",
              background: isRegistered
                ? "linear-gradient(90deg, rgba(16,185,129,0.10), rgba(255,255,255,0.015))"
                : isReserve
                  ? "linear-gradient(90deg, rgba(245,158,11,0.12), rgba(255,255,255,0.015))"
                  : "rgba(255,255,255,0.015)",
            }}
          >
            <div
              style={{
                width: 44,
                minHeight: 50,
                borderRadius: 15,
                ...tournamentTypeDateStyle(t.type),
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 19, fontWeight: 950, color: "inherit" }}>
                {date.day}
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  fontWeight: 900,
                  color: "inherit",
                  opacity: 0.72,
                  textTransform: "uppercase",
                }}
              >
                {date.month}
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 900,
                  color: "rgba(255,255,255,0.94)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  letterSpacing: -0.25,
                  lineHeight: 1.12,
                }}
              >
                {t.name}
              </div>

              <div
                style={{
                  marginTop: 7,
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {tournamentMeta(t)}
              </div>
            </div>

            <div style={{ gridColumn: "2 / 3", marginTop: 4 }}>
              {t.hasLive ? (
                <TournamentLiveDialog
                  tournamentId={t.id}
                  tournamentName={t.name}
                  trigger={
                    <button
                      type="button"
                      style={{
                        background:
                          "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                        color: "white",
                        fontWeight: 900,
                        padding: "8px 12px",
                        fontSize: 11,
                        borderRadius: 999,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        border: "1px solid rgba(255,255,255,0.25)",
                        boxShadow: "0 8px 18px rgba(239,68,68,0.25)",
                        cursor: "pointer",
                      }}
                    >
                      LIVE
                    </button>
                  }
                />
              ) : isRegistered ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 999,
                    padding: "8px 11px",
                    background: "rgba(16,185,129,0.16)",
                    color: "#86efac",
                    border: "1px solid rgba(16,185,129,0.24)",
                    fontSize: 11,
                    fontWeight: 850,
                    whiteSpace: "nowrap",
                  }}
                >
                  Iscritto
                </span>
              ) : isReserve ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 999,
                    padding: "8px 11px",
                    background: "rgba(245,158,11,0.16)",
                    color: "#fbbf24",
                    border: "1px solid rgba(245,158,11,0.24)",
                    fontSize: 11,
                    fontWeight: 850,
                    whiteSpace: "nowrap",
                  }}
                >
                  Riserva
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      setPendingTournament(t);
                      setUserDialogOpen(true);
                      return;
                    }

                    if (!allowed) {
                      toast.error("Non puoi iscriverti a questo torneo");
                      return;
                    }

                    setSelectedTournament(t);
                  }}
                  style={{
                    border: 0,
                    borderRadius: 999,
                    padding: "9px 14px",
                    background: "#4f46e5",
                    color: "white",
                    fontSize: 12,
                    fontWeight: 850,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxShadow: "0 8px 18px rgba(79,70,229,0.24)",
                  }}
                >
                  Iscriviti
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>

    <Link
      href="/tornei"
      style={{
        marginTop: 12,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: 44,
        borderRadius: 16,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "rgba(255,255,255,0.88)",
        fontWeight: 850,
        fontSize: 14,
        textDecoration: "none",
      }}
    >
      Vedi tutti i tornei →
    </Link>
  </section>
) : null}

<footer
  style={{
    marginTop: 36,
    paddingTop: 22,
    borderTop: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
    color: "rgba(255,255,255,0.42)",
    fontSize: 12,
    fontWeight: 750,
  }}
>
  <div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  }}
>
  <a
    href="https://www.instagram.com/movi_padel_clubs"
    target="_blank"
    rel="noreferrer"
    aria-label="Instagram MOVI"
    style={{
      width: 38,
      height: 38,
      borderRadius: 999,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(255,255,255,0.74)",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.08)",
      textDecoration: "none",
      backdropFilter: "blur(10px)",
    }}
  >
    <FaInstagram size={15} />
  </a>

  <a
    href="https://www.facebook.com/MoviPadel"
    target="_blank"
    rel="noreferrer"
    aria-label="Facebook MOVI"
    style={{
      width: 38,
      height: 38,
      borderRadius: 999,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(255,255,255,0.74)",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.08)",
      textDecoration: "none",
      backdropFilter: "blur(10px)",
    }}
  >
    <FaFacebookF size={14} />
  </a>
</div>

  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      flexWrap: "wrap",
    }}
  >
    <Link href="/privacy" style={legalFooterLink}>
      Privacy
    </Link>

    <Link href="/termini" style={legalFooterLink}>
      Termini
    </Link>

    <Link href="/cookie" style={legalFooterLink}>
      Cookie
    </Link>
  </div>
</footer>

{notificationsOpen ? (
  <div
    onClick={() => setNotificationsOpen(false)}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 120,
      background: "rgba(3,7,18,0.72)",
      backdropFilter: "blur(10px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 14,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: 520,
        maxHeight: "82dvh",
        overflow: "hidden",
        borderRadius: 28,
        background:
          "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(3,7,18,0.98))",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 26px 70px rgba(0,0,0,0.45)",
        color: "white",
      }}
    >
      <div
        style={{
          padding: 18,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.5 }}>
            Notifiche
          </div>
          <div
            style={{
              marginTop: 4,
              color: "rgba(255,255,255,0.56)",
              fontSize: 13,
              fontWeight: 650,
            }}
          >
            {unreadNotifications > 0
              ? `${unreadNotifications} non lette`
              : "Tutto letto"}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setNotificationsOpen(false)}
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.07)",
            color: "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {communications.length > 0 ? (
        <div
          style={{
            padding: 12,
            display: "flex",
            justifyContent: "flex-end",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <button
            type="button"
            onClick={markAllNotificationsRead}
            disabled={unreadNotifications === 0}
            style={{
              minHeight: 34,
              padding: "0 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color:
                unreadNotifications === 0
                  ? "rgba(255,255,255,0.35)"
                  : "rgba(255,255,255,0.86)",
              fontSize: 12,
              fontWeight: 850,
              cursor: unreadNotifications === 0 ? "default" : "pointer",
            }}
          >
            Segna tutte come lette
          </button>
        </div>
      ) : null}

      <div
        style={{
          maxHeight: "62dvh",
          overflowY: "auto",
          padding: 12,
        }}
      >
        {communications.length === 0 ? (
          <div
            style={{
              padding: 28,
              textAlign: "center",
              color: "rgba(255,255,255,0.56)",
              fontWeight: 700,
            }}
          >
            Nessuna notifica.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {communications.map((n) => {
              const unread = !n.read_at;

              return (
                <div
                  key={n.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: n.image_path
                      ? "58px minmax(0, 1fr)"
                      : "1fr",
                    gap: 12,
                    padding: 12,
                    borderRadius: 20,
                    background: unread
                      ? "rgba(56,189,248,0.12)"
                      : "rgba(255,255,255,0.055)",
                    border: unread
                      ? "1px solid rgba(56,189,248,0.24)"
                      : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {n.image_path ? (
                    <img
                      src={n.image_path}
                      alt={n.title}
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 16,
                        objectFit: "cover",
                        border: "1px solid rgba(255,255,255,0.10)",
                      }}
                    />
                  ) : null}

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 950,
                          lineHeight: 1.15,
                        }}
                      >
                        {n.title}
                      </div>

                      {unread ? (
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: 999,
                            background: "#38bdf8",
                            flexShrink: 0,
                            marginTop: 4,
                          }}
                        />
                      ) : null}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        color: "rgba(255,255,255,0.62)",
                        fontSize: 13,
                        fontWeight: 600,
                        lineHeight: 1.35,
                      }}
                    >
                      {n.body}
                    </div>

                    <div
                      style={{
                        marginTop: 11,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      {n.cta_url ? (
                        <a
                          href={n.cta_url}
                          onClick={() => {
                            if (unread) updateNotificationState(n.id, "read");
                          }}
                          style={{
                            minHeight: 32,
                            padding: "0 11px",
                            borderRadius: 999,
                            background: "#38bdf8",
                            color: "#082f49",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            textDecoration: "none",
                            fontSize: 12,
                            fontWeight: 950,
                          }}
                        >
                          {n.cta_label || "Apri"}
                        </a>
                      ) : null}

                      {unread ? (
                        <button
                          type="button"
                          onClick={() => updateNotificationState(n.id, "read")}
                          style={notificationSmallBtn}
                        >
                          Segna come letta
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => updateNotificationState(n.id, "dismiss")}
                        style={{
                          ...notificationSmallBtn,
                          color: "#f87171",
                          border: "1px solid rgba(239,68,68,0.24)",
                        }}
                      >
                        Elimina
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  </div>
) : null}

<RegistrationDialog
  tournament={selectedTournament}
  open={!!selectedTournament}
  onClose={() => setSelectedTournament(null)}
  user={user}
  onSuccess={async () => {
    setSelectedTournament(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    await loadAll();
    if (isValidPhone(effectivePhone)) await searchMy(effectivePhone);
  }}
/>

<UserLoginDialog
  open={userDialogOpen}
  onClose={() => {
    if (missingRequiredConsents) {
      toast.error("Devi confermare Privacy, Termini e maggiore età per continuare");
      return;
    }

    setUserDialogOpen(false);
    setPendingTournament(null);
  }}
  onSaved={async (u) => {
  setUser(u);
  toast.success("Dati salvati");

  const tournamentToOpen = pendingTournament;

  setUserDialogOpen(false);
  setPendingTournament(null);

  if (tournamentToOpen) {
    await searchMy(normalizePhone(u.phone));

    const genderBlocked =
      (tournamentToOpen.category === "Femminile" && u.gender === "M") ||
      (tournamentToOpen.category === "Maschile" && u.gender === "F");

    if (genderBlocked) {
      toast.error("Non puoi iscriverti a questo torneo");
      return;
    }

    setSelectedTournament(tournamentToOpen);
  }
}}
/>
      </div>
    </div>
  );
}