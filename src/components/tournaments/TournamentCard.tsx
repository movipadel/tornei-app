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
  hasLive?: boolean; // se true, CTA diventa "LIVE"
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

/** Header gradient più premium */
function getHeaderGradient(type: string) {
  const t = String(type).toLowerCase();

  if (t.includes("baraonda")) {
    return "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)";
  }

  if (t.includes("coppie")) {
    return "linear-gradient(135deg, #4f46e5 0%, #2563eb 100%)";
  }

  return "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)";
}

/**
 * Texture header (modalità C: premium minimal)
 * - grana leggera
 * - diagonali/streak molto soft (quasi satin)
 */
function getHeaderOverlayStyle(type: string) {
  const t = String(type).toLowerCase();
  const isBaraonda = t.includes("baraonda");
  const isCoppie = t.includes("coppie");
  const darkOverlay = isCoppie
  ? "linear-gradient(0deg, rgba(0,0,0,0.10), rgba(0,0,0,0.10)),"
  : "";

  if (!isBaraonda && !isCoppie) {
    return {
      backgroundImage:
        "linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 55%)",
      backgroundSize: "100% 100%",
      backgroundPosition: "0 0",
      opacity: 1,
    } as const;
  }

  // Premium minimal: tutto più soft
  const grainOpacity = isCoppie ? 0.10 : 0.12;
  const stripeOpacity = isCoppie ? 0.10 : 0.09;

  return {
  backgroundImage: `
      ${darkOverlay}
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
    backgroundSize: isCoppie
  ? "100% 100%, 3px 3px, 100% 100%, 100% 100%, 100% 100%"
  : "3px 3px, 100% 100%, 100% 100%, 100% 100%",
    backgroundPosition: "0 0, 0 0, 0 0, 0 0",
    opacity: 1,
  } as const;
}

function categoryAccent(cat: string) {
  const c = String(cat ?? "").toLowerCase();
  if (c === "maschile") return "#1d4ed8";
  if (c === "femminile") return "#db2777";
  if (c === "misto") return "#16a34a";
  return "#7c3aed"; // libero/default
}

function levelAccent(level: string) {
  const l = String(level ?? "").toLowerCase();
  if (l === "principiante") return "#f59e0b";
  if (l === "intermedio") return "#0ea5e9";
  if (l === "avanzato") return "#7c3aed";
  return "#0ea5e9";
}

function hexToRgba(hex: string, alpha: number) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6) return `rgba(15,23,42,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
  const showParticipants = Boolean(tournament.show_participants);

  const catAccent = categoryAccent(cat);
  const lvlAccent = levelAccent(lvl);

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
      if (!res.ok) throw new Error((json as any).error || "Errore caricamento iscritti");

      const type = String((json as any).type ?? tournament.type ?? "");
      if (type.toLowerCase() === "baraonda") {
        setParticipantNames(Array.isArray((json as any).names) ? (json as any).names : []);
        setParticipantPairs([]);
      } else {
        setParticipantPairs(Array.isArray((json as any).pairs) ? (json as any).pairs : []);
        setParticipantNames([]);
      }

      setParticipantsLoaded(true);
    } catch {
      setParticipantsLoaded(true);
    } finally {
      setParticipantsLoading(false);
    }
  }

  function BadgePill({
    label,
    accent,
    weight,
  }: {
    label: string;
    accent: string;
    weight: number;
  }) {
    return (
      <span
        className="base44-pill"
        style={{
          background: "rgba(255,255,255,0.90)", // quasi bianca
          border: "1px solid rgba(15,23,42,0.08)",
          color: "#0f172a",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 999,
          fontWeight: weight,
          fontSize: 12,
          lineHeight: 1,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 0 4px ${hexToRgba(accent, 0.18)}`,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div
        className="base44-tcard"
        onMouseEnter={() => loadParticipantsOnce()}
        onTouchStart={() => loadParticipantsOnce()}
        style={{
          overflow: "hidden",
          borderRadius: 20,
          boxShadow: "0 14px 30px rgba(0,0,0,0.12)",
          background: "#ffffff",
        }}
      >
        {/* HEADER GRADIENT + TEXTURE */}
        <div
          style={{
            background: getHeaderGradient(tournament.type),
            padding: "18px 20px 14px 20px",
            color: "white",
            position: "relative",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              ...getHeaderOverlayStyle(tournament.type),
            }}
          />

          <div style={{ position: "relative" }}>
            <div className="base44-tcard-top" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="base44-tcard-name"
                  style={{
                    fontWeight: 750,
                    fontSize: 20,
                    letterSpacing: "-0.01em",
                    color: "#0f172a",
                  }}
                >
                  {tournament.name}
                </div>

                {/* Tipo torneo: bianco, più leggibile */}
                <div
                  className="base44-tcard-type"
                  style={{
                    color: "rgba(255,255,255,0.85)",
                    fontWeight: 650,
                    fontSize: 15,
                    letterSpacing: "0.02em",
                    marginTop: 2,
                  }}
                >
                  {typeLabel(tournament.type)}
                </div>
              </div>

              {/* BADGES: categoria + livello (gerarchia B: cat più forte del level) */}
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
                <BadgePill label={capitalize(cat)} accent={catAccent} weight={900} />
                <BadgePill label={capitalize(lvl)} accent={lvlAccent} weight={750} />
              </div>
            </div>
          </div>
        </div>

        {/* opzionale: immagine */}
        {tournament.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="base44-tcard-img" src={tournament.image_url} alt={tournament.name} />
        ) : null}

        {/* BODY neutro */}
        <div
          className="base44-tcard-body"
          style={{
            padding: "12px 20px 20px 20px",
            background: "#ffffff",
          }}
        >
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
              <div style={{ fontWeight: 800, color: "#334155", marginBottom: 6, fontSize: 13 }}>Iscritti</div>

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
                        background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
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

          <div
            className="base44-tcard-bottom"
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid #f1f5f9",
            }}
          >
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
                    <span style={{ fontWeight: 800 }}>
                      {counts.male}/{maxPerGender}
                    </span>
                  </div>

                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Users className="w-4 h-4" style={{ color: "#94a3b8" }} />
                    <span className="base44-gender-icon female">♀</span>
                    <span style={{ fontWeight: 800 }}>
                      {counts.female}/{maxPerGender}
                    </span>
                  </div>
                </div>
              ) : (
                <span className="base44-info-row">
                  <Users className="w-4 h-4" style={{ color: "#94a3b8" }} />
                  {counts.main}/{tournament.max_participants} {tournament.type === "Coppie fisse" ? "coppie" : "iscritti"}
                </span>
              )}

              {counts.reserve > 0 ? (
                <span className="base44-pill" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#b45309" }}>
                  +{counts.reserve} {counts.reserve === 1 ? "riserva" : "riserve"}
                </span>
              ) : null}
            </div>

            {/* CTA */}
            {live ? (
              <TournamentLiveDialog
                tournamentId={tournament.id}
                tournamentName={tournament.name}
                triggerLabel="LIVE"
                triggerVariant="live"
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