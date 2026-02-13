"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trophy } from "lucide-react";

import PublicNav from "@/components/PublicNav";
import TournamentCard, { PublicTournament } from "@/components/tournaments/TournamentCard";
import RegistrationDialog from "@/components/tournaments/RegistrationDialog";
import UserLoginDialog from "@/components/UserLoginDialog";

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
};

type MyReg = {
  id: string;
  tournament_id: string;
  is_reserve: boolean;
  p1_phone: string;
  p2_phone?: string | null;
};

const normalizePhone = (s: string) => String(s ?? "").replace(/\s+/g, "").trim();
const isValidPhone = (p: string) => normalizePhone(p).length >= 8;

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [loadingMy, setLoadingMy] = useState(false);

  const [tournaments, setTournaments] = useState<PublicTournament[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // user session (opzionale)
  const [user, setUser] = useState<User | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  // fallback phone (se NON loggato)
  const [phone, setPhone] = useState("");
  const [myRegs, setMyRegs] = useState<MyReg[]>([]);

  const [selectedTournament, setSelectedTournament] = useState<PublicTournament | null>(null);

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
      const [tRes, sRes, meRes] = await Promise.all([
        fetch("/api/tournaments", { cache: "no-store", signal: ac.signal }),
        fetch("/api/app-settings", { cache: "no-store", signal: ac.signal }),
        fetch("/api/user/me", { cache: "no-store", signal: ac.signal }),
      ]);

      const tJson = await tRes.json().catch(() => ({}));
      if (!tRes.ok) throw new Error(tJson.error || "Errore caricamento tornei");
      setTournaments((tJson.data ?? []) as PublicTournament[]);

      const sJson = await sRes.json().catch(() => ({}));
      if (sRes.ok) setSettings(sJson as AppSettings);
      else setSettings({ home_title: "Tornei", home_subtitle: "", home_logo_url: null });

      const meJson = await meRes.json().catch(() => ({}));
      setUser(meJson.user ?? null);
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
    <div className="base44-home-wrap">
      <PublicNav />

      <div className="base44-home-container">
        {/* HERO */}
        <div className="base44-hero">
          {settings?.home_logo_url ? (
  <div
    style={{
      position: "relative",
      width: "100%",
      height: "clamp(190px, 38vw, 320px)",
      borderRadius: 24,
      overflow: "hidden",
      marginBottom: 20,
      boxShadow: "0 14px 40px rgba(15,23,42,0.18)",
      border: "1px solid rgba(226,232,240,0.9)",
      background: "#0f172a",
    }}
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={settings.home_logo_url}
      alt="Hero"
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        transform: "scale(1.02)", // micro “premium”
        filter: "saturate(1.02) contrast(1.02)",
      }}
    />

    {/* overlay elegante: gradiente + vignetta soft */}
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.15) 45%, rgba(255,255,255,0.00) 100%)",
      }}
    />
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(1200px 380px at 20% 0%, rgba(255,255,255,0.08), rgba(255,255,255,0) 60%)",
        mixBlendMode: "soft-light",
      }}
    />

    {/* testo: elegante, leggibile su qualsiasi foto */}
    <div
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      
      </div>

      {settings?.home_subtitle ? (
        <div
          style={{
            color: "rgba(255,255,255,0.92)",
            fontWeight: 800,
            fontSize: "clamp(16px, 4.2vw, 22px)",
            lineHeight: 1.15,
            textShadow: "0 8px 18px rgba(15,23,42,0.45)",
          }}
        >
          {settings.home_subtitle}
        </div>
      ) : null}
    </div>
  
) : (
            <div
              className="base44-hero-logo base44-hero-logo--fallback"
              style={{
                width: "clamp(72px, 16vw, 110px)",
                height: "clamp(72px, 16vw, 110px)",
                borderRadius: 22,
                marginBottom: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#eef2ff",
                color: "#4f46e5",
              }}
            >
              <Trophy className="w-10 h-10" />
            </div>
          )}

          <h1 className="base44-hero-title">{settings?.home_title ?? "Tornei"}</h1>
          <div className="base44-hero-subtitle">{settings?.home_subtitle ?? ""}</div>

          {/* USER BOX */}
          <div className="base44-phone-box">
            {user ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  style={{
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: "12px 14px",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>{user.full_name}</div>
                  <div style={{ color: "#64748b", marginTop: 2, fontSize: 13 }}>
                    {user.phone} • {user.gender === "M" ? "Uomo" : "Donna"} • {user.email}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button className="base44-csv-btn" onClick={() => setUserDialogOpen(true)}>
                    Modifica dati
                  </button>
                  <button
                    className="base44-csv-btn"
                    style={{ color: "#dc2626" }}
                    onClick={async () => {
                      await fetch("/api/user/logout", { method: "POST" });
                      toast.success("Sei uscito");
                      setUser(null);
                      setMyRegs([]);
                    }}
                  >
                    Esci
                  </button>
                </div>
              </div>
            ) : (
              <>
                <input
                  className="base44-input"
                  placeholder="Telefono (opzionale per vedere iscrizioni)..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <div className="base44-help">
                  Vuoi precompilare e vedere subito le tue iscrizioni?{" "}
                  <button
                    type="button"
                    className="base44-csv-btn"
                    style={{ display: "inline-block", marginLeft: 6 }}
                    onClick={() => setUserDialogOpen(true)}
                  >
                    Inserisci i tuoi dati
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* LIST */}
        {loadingMy ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "18px 0" }}>
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#4f46e5" }} />
          </div>
        ) : null}

        {tournaments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "52px 0" }}>
            <div style={{ fontWeight: 800, color: "#0f172a" }}>Nessun torneo disponibile</div>
            <div style={{ color: "#64748b", marginTop: 6 }}>Controlla più tardi</div>
          </div>
        ) : (
          <div className="base44-grid">
            {tournaments.map((t) => {
              const status = statusForTournament(t.id);
              const allowed = canUserJoinTournament(t);

              return (
                <TournamentCard
                  key={t.id}
                  tournament={t}
                  hasLive={!!t.hasLive}
                  status={status}
                  onRegister={(tt) => {
                    if (user && !allowed) {
                      toast.error("Non puoi iscriverti a questo torneo");
                      return;
                    }
                    setSelectedTournament(tt);
                  }}
                  onCancel={() => cancelRegistrationByTournament(t.id)}
                />
              );
            })}
          </div>
        )}

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
          onClose={() => setUserDialogOpen(false)}
          onSaved={(u) => {
            setUser(u);
            toast.success("Dati salvati");
          }}
        />
      </div>
    </div>
  );
}
