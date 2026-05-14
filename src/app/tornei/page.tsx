"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import PublicNav from "@/components/PublicNav";
import TournamentCard, {
  PublicTournament,
} from "@/components/tournaments/TournamentCard";
import RegistrationDialog from "@/components/tournaments/RegistrationDialog";
import UserLoginDialog from "@/components/UserLoginDialog";

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

export default function TorneiPage() {
  const [loading, setLoading] = useState(true);
  const [loadingMy, setLoadingMy] = useState(false);

  const [tournaments, setTournaments] = useState<PublicTournament[]>([]);
  const [user, setUser] = useState<User | null>(null);

  const [phone, setPhone] = useState("");
  const [myRegs, setMyRegs] = useState<MyReg[]>([]);

  const [selectedTournament, setSelectedTournament] =
    useState<PublicTournament | null>(null);
  const [pendingTournament, setPendingTournament] =
    useState<PublicTournament | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  const effectivePhone = user?.phone ? normalizePhone(user.phone) : normalizePhone(phone);

  const listTimerRef = useRef<number | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);

  async function loadAll(opts?: { silent?: boolean }) {
    const silent = Boolean(opts?.silent);

    listAbortRef.current?.abort();
    const ac = new AbortController();
    listAbortRef.current = ac;

    if (!silent) setLoading(true);

    try {
      const [tRes, meRes] = await Promise.all([
        fetch("/api/tournaments", { cache: "no-store", signal: ac.signal }),
        fetch("/api/user/me", { cache: "no-store", signal: ac.signal }),
      ]);

      const tJson = await tRes.json().catch(() => ({}));
      if (!tRes.ok) throw new Error(tJson.error || "Errore caricamento tornei");

      setTournaments((tJson.data ?? []) as PublicTournament[]);

      const meJson = await meRes.json().catch(() => ({}));
      setUser(meJson.user ?? null);
    } catch (e: any) {
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
      if (!isValidPhone(p)) throw new Error("Inserisci il numero completo");

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
    if (!user?.gender) return true;

    if (t.category === "Femminile" && user.gender === "M") return false;
    if (t.category === "Maschile" && user.gender === "F") return false;

    return true;
  }

  useEffect(() => {
    loadAll();

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

      if (listTimerRef.current) window.clearInterval(listTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = effectivePhone;
    const t = setTimeout(() => searchMy(p), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.phone, phone]);

  if (loading) {
  return (
    <div
      className="base44-home-wrap"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
      }}
    >
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#818cf8" }} />
    </div>
  );
}

  return (
    <div
  className="base44-home-wrap"
  style={{
    minHeight: "100dvh",
    background:
      "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
  }}
>
      <PublicNav />

      <div
  className="base44-home-container"
  style={{
    paddingTop: 6,
  }}
>
        <section
  style={{
    position: "relative",
    marginBottom: 22,
    padding: "24px 20px 22px",
    borderRadius: 28,
    overflow: "hidden",
    color: "white",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
    border: "1px solid rgba(255,255,255,0.09)",
    boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
    backdropFilter: "blur(14px)",
  }}
>
  <div
    aria-hidden
    style={{
      position: "absolute",
      inset: "-90px -60px auto -60px",
      height: 260,
      background:
        "radial-gradient(circle at 15% 0%, rgba(14,165,233,0.26), transparent 34%), radial-gradient(circle at 85% 20%, rgba(124,58,237,0.30), transparent 38%)",
      pointerEvents: "none",
    }}
  />

  <div style={{ position: "relative", zIndex: 1 }}>
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
        marginTop: 8,
        fontSize: "clamp(30px, 7vw, 40px)",
        fontWeight: 850,
        lineHeight: 1,
        letterSpacing: -1.1,
        color: "#ffffff",
      }}
    >
      Tornei MOVI
    </div>

    <div
      style={{
        marginTop: 10,
        color: "rgba(255,255,255,0.62)",
        fontWeight: 560,
        fontSize: 14,
        lineHeight: 1.35,
        maxWidth: 420,
      }}
    >
      Gestisci le tue iscrizioni e segui i live.
    </div>
  </div>
</section>

        {loadingMy ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "18px 0" }}>
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#818cf8" }} />
          </div>
        ) : null}

        {tournaments.length === 0 ? (
  <div
    style={{
      textAlign: "center",
      padding: "42px 18px",
      borderRadius: 24,
      background: "rgba(255,255,255,0.055)",
      border: "1px solid rgba(255,255,255,0.09)",
      backdropFilter: "blur(14px)",
    }}
  >
    <div style={{ fontWeight: 850, color: "rgba(255,255,255,0.92)" }}>
      Nessun torneo disponibile
    </div>
    <div style={{ color: "rgba(255,255,255,0.52)", marginTop: 6 }}>
      Controlla più tardi
    </div>
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
                    if (!user) {
                      setPendingTournament(tt);
                      setUserDialogOpen(true);
                      return;
                    }

                    if (!allowed) {
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

            if (isValidPhone(effectivePhone)) {
              await searchMy(effectivePhone);
            }
          }}
        />

        <UserLoginDialog
          open={userDialogOpen}
          onClose={() => {
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