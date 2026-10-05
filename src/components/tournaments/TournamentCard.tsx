"use client";

import { Calendar, Clock, MapPin, X, UserPlus, UserRound, Search } from "lucide-react";
import { motion } from "framer-motion";
import TournamentLiveDialog from "./TournamentLiveDialog";
import React, { useState } from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getTournamentHomeBackground } from "@/lib/tournamentHomeBackground";
import styles from "./TournamentCard.module.css";

export type PublicTournament = {
  id: string;
  name: string;
  type: "Baraonda" | "Coppie fisse" | string;
  category: "Maschile" | "Femminile" | "Misto" | "Libero" | "Open" | string;
  level?: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  location: string;
  max_participants: number;
  image_url?: string | null;
  circuit_id?: string | null;
  counts?: { main: number; reserve: number; male: number; female: number };
  hasLive?: boolean; // se true, CTA diventa "LIVE"
  registrations_open?: boolean; // ✅ nuovo: blocco iscrizioni pubblico
  show_participants?: boolean; // ✅ nuovo flag pubblico
};

type Props = {
  tournament: PublicTournament;
  onRegister: (t: PublicTournament) => void;
  status: "none" | "main" | "reserve";
  onCancel?: () => void;

  // legacy: se lo passi da fuori ok, ma se non lo passi usa tournament.hasLive
  hasLive?: boolean;
  circuitName?: string | null;
};

type CatKey = "maschile" | "femminile" | "misto" | "open";

function catKey(cat: string): CatKey {
  const c = String(cat ?? "").toLowerCase().trim();
  if (c === "libero" || c === "open") return "open";
  if (c === "maschile") return "maschile";
  if (c === "femminile") return "femminile";
  if (c === "misto") return "misto";
  return "open";
}

function lvlKey(level?: string | null) {
  const l = String(level ?? "intermedio").toLowerCase().trim();
  if (["principiante", "intermedio", "avanzato", "open"].includes(l)) return l;
  return "intermedio";
}

function typeLabel(type: string) {
  return type === "Coppie fisse" ? "Coppie fisse" : "Baraonda";
}

/** Header gradient più premium */
function getHeaderGradient(type: string) {
  const t = String(type).toLowerCase();

  if (t.includes("baraonda")) {
    return "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)";
  }

  if (t.includes("coppie")) {
    return "linear-gradient(135deg, #2dd4bf 0%, #0ea5a4 100%)";
  }

  return "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)";
}

/**
 * Texture header (premium minimal)
 */
function getHeaderOverlayStyle(type: string) {
  const t = String(type).toLowerCase();
  const isBaraonda = t.includes("baraonda");
  const isCoppie = t.includes("coppie");

  if (!isBaraonda && !isCoppie) {
    return {
      backgroundImage:
        "linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 55%)",
      backgroundSize: "100% 100%",
      backgroundPosition: "0 0",
      opacity: 1,
    } as const;
  }

  const grainOpacity = isCoppie ? 0.1 : 0.12;
  const stripeOpacity = isCoppie ? 0.1 : 0.09;

  return {
    backgroundImage: `
      radial-gradient(circle at 1px 1px, rgba(255,255,255,${grainOpacity}) 0.6px, rgba(255,255,255,0) 0.7px),
      repeating-linear-gradient(
        135deg,
        rgba(255,255,255,0) 0px,
        rgba(255,255,255,0) 40px,
        rgba(255,255,255,${stripeOpacity}) 41px,
        rgba(255,255,255,0) 86px
      ),
      linear-gradient(
        135deg,
        rgba(255,255,255,0) 0%,
        rgba(255,255,255,0) 46%,
        rgba(255,255,255,0.14) 50%,
        rgba(255,255,255,0) 54%,
        rgba(255,255,255,0) 100%
      ),
      linear-gradient(
        135deg,
        rgba(255,255,255,0) 0%,
        rgba(255,255,255,0) 63%,
        rgba(255,255,255,0.10) 66%,
        rgba(255,255,255,0) 70%,
        rgba(255,255,255,0) 100%
      )
    `,
    backgroundSize: "3px 3px, 100% 100%, 100% 100%, 100% 100%",
    backgroundPosition: "0 0, 0 0, 0 0, 0 0",
    opacity: 1,
  } as const;
}

function catLabel(key: CatKey) {
  if (key === "open") return "OPEN";
  if (key === "maschile") return "MASCHILE";
  if (key === "femminile") return "FEMMINILE";
  return "MISTO";
}

function lvlLabel(key: string) {
  const k = String(key ?? "").toLowerCase();
  if (k === "principiante") return "PRINCIPIANTE";
  if (k === "intermedio") return "INTERMEDIO";
  if (k === "avanzato") return "AVANZATO";
  if (k === "open") return "OPEN";
  return "INTERMEDIO";
}

function FullUser({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
      }}
    >
      <UserRound width={size} height={size} fill={color} stroke="none" />
    </span>
  );
}

function OverlapTwo({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <span style={{ display: "inline-flex", alignItems: "center" }}>{left}</span>
      <span style={{ display: "inline-flex", alignItems: "center", marginLeft: -10 }}>{right}</span>
    </span>
  );
}

function formatPrettyDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;

  const raw = d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return raw
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export default function TournamentCard({ tournament, onRegister, status, onCancel, hasLive, circuitName }: Props) {
  const counts = tournament.counts ?? { main: 0, reserve: 0, male: 0, female: 0 };

  const cat = catKey(tournament.category);
  const lvl = lvlKey(tournament.level);

  const isBaraonda = String(tournament.type).toLowerCase().includes("baraonda");
  const isMixed = cat === "misto";

  // Baraonda misto: iscrizioni singole (contatori separati)
  const isMixedBaraonda = isBaraonda && isMixed;
  const maxPerGender = isMixedBaraonda ? Math.floor(tournament.max_participants / 2) : 0;

  const spotsLeft = tournament.max_participants - counts.main;
  const isFull = spotsLeft <= 0;

  // fonte unica
  const live = Boolean(hasLive ?? tournament.hasLive);
  const showParticipants = Boolean(tournament.show_participants);
  const registrationsOpen = tournament.registrations_open !== false;

  // dialog state
  const [participantsOpen, setParticipantsOpen] = useState(false);

  // participants state (usiamo SOLO nel dialog)
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsLoaded, setParticipantsLoaded] = useState(false);
  const [participantNames, setParticipantNames] = useState<string[]>([]);
  const [participantPairs, setParticipantPairs] = useState<{ p1: string; p2: string }[]>([]);

  async function loadParticipants(force?: boolean) {
    if (!showParticipants) return;
    if (!force && (participantsLoaded || participantsLoading)) return;

    setParticipantsLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/participants`, { cache: "no-store" });
      const json = await res.json().catch(() => ({})) as {
        error?: string;
        type?: string;
        names?: unknown;
        pairs?: unknown;
      };
      if (!res.ok) throw new Error(json.error || "Errore caricamento iscritti");

      const type = String(json.type ?? tournament.type ?? "");
      if (type.toLowerCase().includes("baraonda")) {
        setParticipantNames(Array.isArray(json.names) ? json.names.filter((name): name is string => typeof name === "string") : []);
        setParticipantPairs([]);
      } else {
        setParticipantPairs(Array.isArray(json.pairs) ? json.pairs.filter((pair): pair is { p1: string; p2: string } => Boolean(pair) && typeof pair === "object" && "p1" in pair && "p2" in pair && typeof pair.p1 === "string" && typeof pair.p2 === "string") : []);
        setParticipantNames([]);
      }

      setParticipantsLoaded(true);
    } catch {
      setParticipantsLoaded(true);
    } finally {
      setParticipantsLoading(false);
    }
  }

  function CountIconsDouble({ cat }: { cat: CatKey }) {
    const blueDefault = "#3b82f6";
    const pinkDefault = "#ec4899";
    const green = "#10b981";

    const blueMisto = "#2563eb";
    const pinkMisto = "#db2777";

    const size = 18;

    if (cat === "misto") {
      return (
        <OverlapTwo
          left={<FullUser color={blueMisto} size={size} />}
          right={<FullUser color={pinkMisto} size={size} />}
        />
      );
    }

    const color = cat === "maschile" ? blueDefault : cat === "femminile" ? pinkDefault : green;

    return <OverlapTwo left={<FullUser color={color} size={size} />} right={<FullUser color={color} size={size} />} />;
  }

  function CountIconSingle({ color }: { color: string }) {
    return <FullUser color={color} size={18} />;
  }

  const countText = `${counts.main}/${tournament.max_participants} ${
    String(tournament.type) === "Coppie fisse" ? "coppie" : "iscritti"
  }`;

  const lensAccent =
    String(tournament.type).toLowerCase().includes("baraonda")
      ? "rgba(245,158,11,0.55)"
      : String(tournament.type).toLowerCase().includes("coppie")
      ? "rgba(45,212,191,0.55)"
      : "rgba(99,102,241,0.45)";

  const lensBtnStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 100%)",
    border: "1px solid rgba(15,23,42,0.14)",
    boxShadow: `
      0 6px 16px rgba(15,23,42,0.10),
      inset 0 1px 0 rgba(255,255,255,0.65),
      0 0 0 2px ${lensAccent}
    `,
    cursor: "pointer",
    padding: 0,
    flex: "0 0 auto",
  };

  const LensDialog = showParticipants ? (
    <Dialog
      open={participantsOpen}
      onOpenChange={(v) => {
        setParticipantsOpen(v);
        if (v) loadParticipants();
      }}
    >
      <DialogTrigger asChild>
        <button type="button" aria-label="Mostra iscritti" style={lensBtnStyle}>
          <Search className="w-4 h-4" style={{ color: "#0f172a" }} />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl p-0 overflow-hidden [&>button[aria-label='Close']]:hidden">
        <DialogHeader>
          <VisuallyHidden>
            <DialogTitle>Iscritti — {tournament.name}</DialogTitle>
          </VisuallyHidden>
        </DialogHeader>

        <div
          style={{
            padding: "16px 16px 14px",
            color: "white",
            background: getHeaderGradient(tournament.type),
            position: "relative",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              ...getHeaderOverlayStyle(tournament.type),
            }}
          />

          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 950,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                Iscritti
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontSize: 13,
                  fontWeight: 800,
                  opacity: 0.92,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {tournament.name}
              </div>
            </div>

            <DialogClose asChild>
              <button
                type="button"
                style={{
                  background: "rgba(255,255,255,0.18)",
                  border: "1px solid rgba(255,255,255,0.28)",
                  color: "white",
                  fontWeight: 900,
                  padding: "10px 14px",
                  borderRadius: 999,
                  lineHeight: 1,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
                  flex: "0 0 auto",
                  cursor: "pointer",
                }}
              >
                Chiudi
              </button>
            </DialogClose>
          </div>

          <div
            style={{
              position: "relative",
              marginTop: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.22)",
              fontWeight: 900,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontSize: 12,
              width: "fit-content",
            }}
          >
            {countText}
          </div>
        </div>

        <div
          style={{
            padding: 16,
            backgroundImage: `
              radial-gradient(circle at 1px 1px, rgba(15,23,42,0.05) 0.6px, rgba(0,0,0,0) 0.7px),
              linear-gradient(to bottom, #ffffff 0%, #eef2ff 100%)
            `,
            backgroundSize: "3px 3px, 100% 100%",
            backgroundPosition: "0 0, 0 0",
          }}
        >
          {participantsLoading && !participantsLoaded ? (
            <div style={{ color: "#64748b", fontSize: 14, fontWeight: 700 }}>Caricamento...</div>
          ) : String(tournament.type).toLowerCase().includes("baraonda") ? (
            participantNames.length ? (
              <div
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid rgba(226,232,240,0.9)",
                  background: "rgba(255,255,255,0.85)",
                  boxShadow: "0 10px 24px rgba(15,23,42,0.10)",
                }}
              >
                {participantNames.map((n, idx) => (
                  <div
                    key={`${n}-${idx}`}
                    style={{
                      padding: "12px 14px",
                      borderTop: idx === 0 ? "none" : "1px solid rgba(226,232,240,0.75)",
                      fontWeight: 850,
                      color: "#0f172a",
                      letterSpacing: "0.02em",
                      textTransform: "uppercase",
                    }}
                  >
                    {n}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#64748b", fontSize: 14, fontWeight: 700 }}>Nessun iscritto.</div>
            )
          ) : participantPairs.length ? (
            <div
              style={{
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid rgba(226,232,240,0.9)",
                background: "rgba(255,255,255,0.85)",
                boxShadow: "0 10px 24px rgba(15,23,42,0.10)",
              }}
            >
              {participantPairs.map((p, idx) => (
                <div
                  key={`${p.p1}-${p.p2}-${idx}`}
                  style={{
                    padding: "12px 14px",
                    borderTop: idx === 0 ? "none" : "1px solid rgba(226,232,240,0.75)",
                    background: idx % 2 === 0 ? "rgba(255,255,255,0.75)" : "rgba(248,250,252,0.85)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontWeight: 850,
                    color: "#0f172a",
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                  }}
                >
                  <div>{p.p1}</div>
                  <div>{p.p2}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#64748b", fontSize: 14, fontWeight: 700 }}>Nessuna coppia completa.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  ) : null;

  const cardImage = tournament.image_url || getTournamentHomeBackground(tournament.type, tournament.category);
  const categoryClass = cat === "maschile" ? styles.maschile : cat === "femminile" ? styles.femminile : cat === "misto" ? styles.misto : styles.open;

  return (
    <motion.article className={styles.card} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <div
        className={styles.cardInner}
        onMouseEnter={() => {
          if (showParticipants) loadParticipants();
        }}
        onTouchStart={() => {
          if (showParticipants) loadParticipants();
        }}
      >
        <div className={styles.media}>
          {/* image_url is the existing public tournament image; poster assets remain separate */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cardImage} alt={tournament.image_url ? tournament.name : ""} />
          <div className={styles.mediaScrim} aria-hidden />
        </div>
        <div className={styles.body}>
          <div className={styles.identity}>
            {circuitName ? <span className={styles.circuit}>{circuitName}</span> : null}
            <span className={styles.type}>{typeLabel(tournament.type)}</span>
            <h2>{tournament.name}</h2>
            <div className={styles.badges}>
              <span className={`${styles.badge} ${categoryClass}`}>{catLabel(cat)}</span>
              <span className={`${styles.badge} ${styles.level}`}>{lvlLabel(lvl)}</span>
            </div>
          </div>
          <div className={styles.meta}>
            <div><Calendar size={17} aria-hidden /><span>{formatPrettyDate(tournament.date)}</span></div>
            <div><Clock size={17} aria-hidden /><span>{tournament.time.slice(0, 5)}</span></div>
            <div className={styles.location}><MapPin size={17} aria-hidden /><span>{tournament.location}</span></div>
          </div>
          <div className={styles.footer}>
            <div className={styles.counts}>
              {isMixedBaraonda ? (
                <div className={styles.mixedCounts}>
                  <div>
                    {CountIconSingle({ color: "#2563eb" })}
                    <span>{counts.male}/{maxPerGender}</span>
                  </div>
                  <div>
                    {CountIconSingle({ color: "#db2777" })}
                    <span>{counts.female}/{maxPerGender}</span>
                  </div>
                  {LensDialog}
                </div>
              ) : (
                <div className={styles.countRow}>
                  <CountIconsDouble cat={cat} />
                  <span>{countText}</span>
                  {LensDialog}
                </div>
              )}
              {counts.reserve > 0 ? (
                <span className={styles.reserveCount}>
                  +{counts.reserve} {counts.reserve === 1 ? "riserva" : "riserve"}
                </span>
              ) : null}
            </div>
            <div className={styles.actions}>
            {live ? (
  <TournamentLiveDialog
    tournamentId={tournament.id}
    tournamentName={tournament.name}
    trigger={
      <button
        type="button"
        aria-label="Apri avanzamento torneo"
        className={`${styles.button} ${styles.live}`}
      >
        LIVE
      </button>
    }
  />
) : status !== "none" ? (
  <div className={styles.registeredActions}>
    <span className={`${styles.status} ${status === "reserve" ? styles.statusReserve : styles.statusSuccess}`}>
      {status === "reserve" ? "In riserva" : "Iscritto"}
    </span>

    {onCancel ? (
      <button
        type="button"
        title="Cancella iscrizione"
        onClick={onCancel}
        className={`${styles.iconButton} ${styles.cancel}`}
      >
        <X className="w-4 h-4" />
      </button>
    ) : null}
  </div>
) : registrationsOpen ? (
              <button
                className={`${styles.button} ${isFull ? styles.reserve : styles.primary}`}
                type="button"
                onClick={() => onRegister(tournament)}
              >
                <UserPlus className="w-3.5 h-3.5" />
                {isFull ? "Lista riserva" : "Iscriviti"}
              </button>
            ) : (
              <button
                className={`${styles.button} ${styles.disabled}`}
                type="button"
                disabled
                title="Iscrizioni chiuse"
              >
                Iscrizioni chiuse
              </button>
            )}
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
