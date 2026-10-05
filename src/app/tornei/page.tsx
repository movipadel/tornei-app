"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import TournamentCard, {
  PublicTournament,
} from "@/components/tournaments/TournamentCard";
import RegistrationDialog from "@/components/tournaments/RegistrationDialog";
import UserLoginDialog from "@/components/UserLoginDialog";
import styles from "./TorneiPage.module.css";

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
type PublicCircuit = { id: string; name: string };

const normalizePhone = (s: string) => String(s ?? "").replace(/\s+/g, "").trim();
const isValidPhone = (p: string) => normalizePhone(p).length >= 8;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Errore";
type RegistrationSearchRow = MyReg;

export default function TorneiPage() {
  const [loading, setLoading] = useState(true);
  const [loadingMy, setLoadingMy] = useState(false);

  const [tournaments, setTournaments] = useState<PublicTournament[]>([]);
  const [circuits, setCircuits] = useState<PublicCircuit[]>([]);
  const [user, setUser] = useState<User | null>(null);

  const [phone] = useState("");
  const [myRegs, setMyRegs] = useState<MyReg[]>([]);

  const [selectedTournament, setSelectedTournament] =
    useState<PublicTournament | null>(null);
  const [pendingTournament, setPendingTournament] =
    useState<PublicTournament | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  const effectivePhone = user?.phone ? normalizePhone(user.phone) : normalizePhone(phone);

  const listTimerRef = useRef<number | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const activityLinkHandled = useRef(false);

  useEffect(() => {
    if (activityLinkHandled.current || loading) return;
    const requestedId = new URLSearchParams(window.location.search).get('tournament');
    if (!requestedId || !tournaments.some(t => t.id === requestedId)) return;
    const card = document.getElementById(`tournament-${requestedId}`);
    if (card) {
      card.scrollIntoView({ block: 'center' });
      card.focus({ preventScroll: true });
      activityLinkHandled.current = true;
    }
  }, [tournaments, loading]);

  async function loadAll(opts?: { silent?: boolean }) {
    const silent = Boolean(opts?.silent);

    listAbortRef.current?.abort();
    const ac = new AbortController();
    listAbortRef.current = ac;

    if (!silent) setLoading(true);

    try {
      const [tRes, meRes, circuitsRes] = await Promise.all([
        fetch("/api/tournaments", { cache: "no-store", signal: ac.signal }),
        fetch("/api/user/me", { cache: "no-store", signal: ac.signal }),
        fetch("/api/circuits", { cache: "no-store", signal: ac.signal }),
      ]);

      const tJson = await tRes.json().catch(() => ({}));
      if (!tRes.ok) throw new Error(tJson.error || "Errore caricamento tornei");

      setTournaments((tJson.data ?? []) as PublicTournament[]);

      const meJson = await meRes.json().catch(() => ({}));
      setUser(meJson.user ?? null);
      const circuitsJson = await circuitsRes.json().catch(() => ({}));
      if (circuitsRes.ok) setCircuits((circuitsJson.data ?? []) as PublicCircuit[]);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (!silent) toast.error(errorMessage(e));
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

      const rows = (json.data ?? []) as RegistrationSearchRow[];

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
    } catch (e: unknown) {
      toast.error(errorMessage(e));
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
    } catch (e: unknown) {
      toast.error(errorMessage(e));
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
  }, []);

  useEffect(() => {
    const p = effectivePhone;
    const t = setTimeout(() => searchMy(p), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.phone, phone]);

  if (loading) {
  return (
    <div className={styles.page}>
      <div className={styles.loading} role="status" aria-label="Caricamento tornei">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#818cf8" }} />
      </div>
    </div>
  );
}

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <h1>I Tornei della Padelleria</h1>
          <p>Partecipa e gestisci le tue iscrizioni.</p>
        </header>
        <div className={styles.sectionHead}>
          <h2>Prossimi tornei</h2>
          <span>{tournaments.length} {tournaments.length === 1 ? "torneo" : "tornei"}</span>
        </div>

        {loadingMy ? (
          <div className={styles.loading} role="status" aria-label="Aggiornamento iscrizioni">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#818cf8" }} />
          </div>
        ) : null}

        {tournaments.length === 0 ? (
  <div className={styles.empty}>
    <div><strong>
      Nessun torneo disponibile
    </strong>
    <span>
      Controlla più tardi
    </span></div>
  </div>
) : (
          <div className={styles.grid}>
            {tournaments.map((t) => {
              const status = statusForTournament(t.id);
              const allowed = canUserJoinTournament(t);

              return (
                <div className={styles.focusTarget} key={t.id} id={`tournament-${t.id}`} tabIndex={-1}>
                <TournamentCard
                  tournament={t}
                  circuitName={circuits.find((circuit) => circuit.id === t.circuit_id)?.name}
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
                </div>
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
    </main>
  );
}
