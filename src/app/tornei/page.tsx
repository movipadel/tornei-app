"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import TournamentCard, {
  PublicTournament,
} from "@/components/tournaments/TournamentCard";
import RegistrationDialog from "@/components/tournaments/RegistrationDialog";
import UserLoginDialog from "@/components/UserLoginDialog";
import { ownedTournamentStatus, removeOwnedTournamentRegistration, upsertOwnedTournamentRegistration, type OwnedTournamentRegistration } from "@/lib/tournamentRegistrationOwnership";
import styles from "./TorneiPage.module.css";

type User = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  gender: "M" | "F";
};

type MyReg = OwnedTournamentRegistration;
type PublicCircuit = { id: string; name: string };

const normalizePhone = (s: string) => String(s ?? "").replace(/\s+/g, "").trim();
const isValidPhone = (p: string) => normalizePhone(p).length >= 8;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Errore";

export default function TorneiPage() {
  const [loading, setLoading] = useState(true);
  const [loadingMy, setLoadingMy] = useState(false);

  const [tournaments, setTournaments] = useState<PublicTournament[]>([]);
  const [circuits, setCircuits] = useState<PublicCircuit[]>([]);
  const [user, setUser] = useState<User | null>(null);

  const [myRegs, setMyRegs] = useState<MyReg[]>([]);
  const [myRegsReadyForUserId, setMyRegsReadyForUserId] = useState<string | null>(null);
  const [myRegsLoadError, setMyRegsLoadError] = useState(false);
  const myRegsRequestRef = useRef(0);

  const [selectedTournament, setSelectedTournament] =
    useState<PublicTournament | null>(null);
  const [pendingTournament, setPendingTournament] =
    useState<PublicTournament | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  const effectivePhone = normalizePhone(user?.phone ?? "");

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

  async function loadMyRegistrations() {
    const requestId = ++myRegsRequestRef.current;
    const requestedUserId = user?.id ?? null;
    setMyRegsLoadError(false);
    setLoadingMy(true);
    try {
      const res = await fetch("/api/registrations/mine", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore caricamento iscrizioni");
      if (requestId === myRegsRequestRef.current) {
        setMyRegs((json.data ?? []) as MyReg[]);
        setMyRegsReadyForUserId(requestedUserId);
      }
    } catch (e: unknown) {
      if (requestId === myRegsRequestRef.current) { setMyRegsLoadError(true); toast.error(errorMessage(e)); }
    } finally {
      if (requestId === myRegsRequestRef.current) setLoadingMy(false);
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
      ++myRegsRequestRef.current;
      setMyRegs((current) => removeOwnedTournamentRegistration(current, reg.id));
      await loadMyRegistrations();
      await loadAll();
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    }
  }

  function statusForTournament(tournamentId: string): "none" | "main" | "reserve" {
    if (!user) return "none";
    return ownedTournamentStatus(myRegs, tournamentId);
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
    void loadMyRegistrations();
    // Reload ownership when the signed-in customer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const ownershipPending = Boolean(user && myRegsReadyForUserId !== user.id);

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
) : ownershipPending ? (
          <div className={styles.loading} role="status">
            {myRegsLoadError ? <button type="button" onClick={() => void loadMyRegistrations()}>Verifica iscrizioni non disponibile. Riprova</button> : "Verifica iscrizioni in corso..."}
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
          onSuccess={async (registration) => {
            const tournamentId = selectedTournament?.id;
            setSelectedTournament(null);
            ++myRegsRequestRef.current;
            if (tournamentId) setMyRegs((current) => upsertOwnedTournamentRegistration(current, { ...registration, tournament_id: tournamentId }));
            window.scrollTo({ top: 0, behavior: "smooth" });
            await loadAll();
            await loadMyRegistrations();
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
    await loadMyRegistrations();

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
