"use client";

import { Calendar, Clock, MapPin, Users, UserPlus, X } from "lucide-react";
import { motion } from "framer-motion";
import TournamentLiveDialog from "./TournamentLiveDialog";
import { useState } from "react";

export type PublicTournament = {
  id: string;
  name: string;
  type: "Baraonda" | "Coppie fisse" | string;
  category: "Maschile" | "Femminile" | "Misto" | "Libero" | string;
  level?: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  location: string;
  max_participants: number;
  image_url?: string | null;
  counts?: { main: number; reserve: number; male: number; female: number };
    hasLive?: boolean; // se true, CTA diventa "Sviluppi"
  show_participants?: boolean; // ✅ nuovo flag pubblico
};

type Props = {
  tournament: PublicTournament;
  onRegister: (t: PublicTournament) => void;
  status: "none" | "main" | "reserve";
  onCancel?: () => void;

  // legacy: se lo passi da fuori ok, ma se non lo passi usa tournament.hasLive
  hasLive?: boolean;
};

function catKey(cat: string) {
  const c = String(cat ?? "").toLowerCase();
  if (["maschile", "femminile", "misto", "libero"].includes(c)) return c;
  return "libero";
}

function lvlKey(level?: string | null) {
  const l = String(level ?? "intermedio").toLowerCase();
  if (["principiante", "intermedio", "avanzato"].includes(l)) return l;
  return "intermedio";
}

function capitalize(value?: string | null) {
  if (!value) return "-";
  const v = String(value).toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function typeLabel(type: string) {
  return type === "Coppie fisse" ? "Amatoriale Coppie fisse" : "Baraonda";
}

function formatPrettyDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;

  const s = d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function TournamentCard({ tournament, onRegister, status, onCancel, hasLive }: Props) {
  const counts = tournament.counts ?? { main: 0, reserve: 0, male: 0, female: 0 };

  const isMixedBaraonda =
    tournament.type === "Baraonda" && String(tournament.category).toLowerCase() === "misto";
  const maxPerGender = isMixedBaraonda ? Math.floor(tournament.max_participants / 2) : 0;

  const spotsLeft = tournament.max_participants - counts.main;
  const isFull = spotsLeft <= 0;

  const cat = catKey(tournament.category);
  const lvl = lvlKey(tournament.level);

  // fonte unica
  const live = Boolean(hasLive ?? tournament.hasLive);
    const showParticipants = Boolean((tournament as any).show_participants);

  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsLoaded, setParticipantsLoaded] = useState(false);
  const [participantNames, setParticipantNames] = useState<string[]>([]);
  const [participantPairs, setParticipantPairs] = useState<{ p1: string; p2: string }[]>([]);

  async function loadParticipantsOnce() {
    if (!showParticipants) return;
    if (participantsLoaded || participantsLoading) return;

    setParticipantsLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/participants`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore caricamento iscritti");

      const type = String(json.type ?? tournament.type ?? "");
      if (type.toLowerCase() === "baraonda") {
        setParticipantNames(Array.isArray(json.names) ? json.names : []);
        setParticipantPairs([]);
      } else {
        setParticipantPairs(Array.isArray(json.pairs) ? json.pairs : []);
        setParticipantNames([]);
      }

      setParticipantsLoaded(true);
    } catch {
      // silenzioso: non vogliamo toast invasivi nella lista pubblica
      setParticipantsLoaded(true);
    } finally {
      setParticipantsLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div
  className="base44-tcard"
  onMouseEnter={() => loadParticipantsOnce()}
  onTouchStart={() => loadParticipantsOnce()}
>
        {tournament.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="base44-tcard-img" src={tournament.image_url} alt={tournament.name} />
        ) : null}

        <div className="base44-tcard-body">
          <div className="base44-tcard-top" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="base44-tcard-name" style={{ fontWeight: 650, letterSpacing: "-0.01em" }}>
                {tournament.name}
              </div>
              <div className="base44-tcard-type">{typeLabel(tournament.type)}</div>
            </div>

            {/* BADGES: colonna a destra; LIVE sotto (non allunga la card) */}
            <div
              className="base44-tcard-badges"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 8,
                flexShrink: 0,
              }}
            >
              <span className={`base44-pill base44-pill-cat-${cat}`}>{capitalize(cat)}</span>
              <span className={`base44-pill base44-pill-lvl-${lvl}`}>{capitalize(lvl)}</span>

              {live ? (
                <span className="base44-pill base44-pill-live">
                  <span className="base44-live-dot" />
                  LIVE
                </span>
              ) : null}
            </div>
          </div>

          <div className="base44-tcard-info">
            <div className="base44-info-row">
              <Calendar className="w-4 h-4" style={{ color: "#6366f1" }} />
              <span>{formatPrettyDate(tournament.date)}</span>
            </div>

            <div className="base44-info-row">
              <Clock className="w-4 h-4" style={{ color: "#6366f1" }} />
              <span>{tournament.time}</span>
            </div>

            <div className="base44-info-row full">
              <MapPin className="w-4 h-4" style={{ color: "#6366f1" }} />
              <span>{tournament.location}</span>
            </div>
          </div>

          {showParticipants ? (
  <div style={{ marginTop: 10 }}>
    <div style={{ fontWeight: 800, color: "#334155", marginBottom: 6, fontSize: 13 }}>
      Iscritti
    </div>

    {participantsLoading && !participantsLoaded ? (
      <div style={{ color: "#64748b", fontSize: 13 }}>Caricamento...</div>
    ) : tournament.type === "Baraonda" ? (
      participantNames.length ? (
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            overflow: "hidden",
            background: "white",
          }}
        >
          {participantNames.map((n, idx) => (
            <div
              key={`${n}-${idx}`}
              style={{
                padding: "8px 10px",
                fontSize: 13,
                borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
              }}
            >
              {n}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: "#64748b", fontSize: 13 }}>Nessun iscritto</div>
      )
    ) : participantPairs.length ? (
      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          overflow: "hidden",
          background: "white",
        }}
      >
        {participantPairs.map((p, idx) => (
          <div
            key={`${p.p1}-${p.p2}-${idx}`}
            style={{
              padding: "8px 10px",
              fontSize: 13,
              background: idx % 2 === 0 ? "#ffffff" : "#f8fafc", // ✅ righe alternate
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <div>{p.p1}</div>
            <div>{p.p2}</div>
          </div>
        ))}
      </div>
    ) : (
      <div style={{ color: "#64748b", fontSize: 13 }}>Nessuna coppia completa</div>
    )}
  </div>
) : null}

          <div className="base44-tcard-bottom">
            <div className="base44-counts">
              {isMixedBaraonda ? (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "nowrap",
      whiteSpace: "nowrap",
    }}
  >
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Users className="w-4 h-4" style={{ color: "#94a3b8" }} />
      <span className="base44-gender-icon male">♂</span>
      <span style={{ fontWeight: 800 }}>{counts.male}/{maxPerGender}</span>
    </div>

    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Users className="w-4 h-4" style={{ color: "#94a3b8" }} />
      <span className="base44-gender-icon female">♀</span>
      <span style={{ fontWeight: 800 }}>{counts.female}/{maxPerGender}</span>
    </div>
  </div>
) : (
                <span className="base44-info-row">
                  <Users className="w-4 h-4" style={{ color: "#94a3b8" }} />
                  {counts.main}/{tournament.max_participants}{" "}
                  {tournament.type === "Coppie fisse" ? "coppie" : "iscritti"}
                </span>
              )}

              {counts.reserve > 0 ? (
                <span
                  className="base44-pill"
                  style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#b45309" }}
                >
                  +{counts.reserve} {counts.reserve === 1 ? "riserva" : "riserve"}
                </span>
              ) : null}
            </div>

            {live ? (
              <TournamentLiveDialog
  tournamentId={tournament.id}
  tournamentName={tournament.name}
  triggerLabel="Sviluppi"
/>
            ) : status === "none" ? (
              <button
                className={`base44-cta ${isFull ? "base44-cta-amber" : "base44-cta-indigo"}`}
                type="button"
                onClick={() => onRegister(tournament)}
                style={{
  fontWeight: 650,
  padding: "10px 14px",
  fontSize: 14,
  gap: 6,
  minWidth: "unset",
}}

              >
                <UserPlus className="w-3.5 h-3.5" />
                {isFull ? "Lista riserva" : "Iscriviti"}
              </button>
            ) : (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <button className="base44-cta base44-cta-disabled" type="button" disabled>
                  {status === "reserve" ? "In riserva" : "Iscritto"}
                </button>

                {onCancel ? (
                  <button
                    type="button"
                    title="Cancella iscrizione"
                    onClick={onCancel}
                    className="base44-icon-btn"
                    style={{ width: 40, height: 40, borderRadius: 999, color: "#dc2626" }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
