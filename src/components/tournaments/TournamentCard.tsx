"use client";

import { Calendar, Clock, MapPin, Users, UserPlus, X } from "lucide-react";
import { motion } from "framer-motion";
import TournamentLiveDialog from "./TournamentLiveDialog";

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

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="base44-tcard">
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
              <TournamentLiveDialog tournamentId={tournament.id} triggerLabel="Sviluppi" />
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
