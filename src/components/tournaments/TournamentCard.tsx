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

function categoryPillStyle(cat: CatKey) {
  if (cat === "maschile") {
    return {
      bg: "linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)",
      border: "1px solid rgba(255,255,255,0.25)",
    };
  }

  if (cat === "femminile") {
    return {
      bg: "linear-gradient(135deg, #be185d 0%, #9d174d 100%)",
      border: "1px solid rgba(255,255,255,0.25)",
    };
  }

  if (cat === "open") {
    return {
      bg: "linear-gradient(135deg, #059669 0%, #047857 100%)",
      border: "1px solid rgba(255,255,255,0.25)",
    };
  }

  return {
    bg: "linear-gradient(135deg, #eab308 0%, #b45309 100%)",
    border: "1px solid rgba(255,255,255,0.25)",
  };
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

export default function TournamentCard({ tournament, onRegister, status, onCancel, hasLive }: Props) {
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).error || "Errore caricamento iscritti");

      const type = String((json as any).type ?? tournament.type ?? "");
      if (type.toLowerCase().includes("baraonda")) {
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

  /** Pill premium */
  function Pill({
    children,
    weight,
    bg,
    fg,
    border,
  }: {
    children: React.ReactNode;
    weight: number;
    bg?: string;
    fg?: string;
    border?: string;
  }) {
    return (
      <span
        className="base44-pill"
        style={{
          background: bg ?? "rgba(255,255,255,0.90)",
          border: border ?? "1px solid rgba(15,23,42,0.08)",
          color: fg ?? "#0f172a",
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
          boxShadow: `
            0 2px 4px rgba(0,0,0,0.18),
            inset 0 1px 0 rgba(255,255,255,0.35),
            inset 0 -1px 0 rgba(0,0,0,0.15)
          `,
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
    );
  }

  function CategoryIcons({ cat }: { cat: CatKey }) {
    const blueDefault = "#3b82f6";
    const pinkDefault = "#ec4899";
    const green = "#10b981";

    const blueMisto = "#2563eb";
    const pinkMisto = "#db2777";

    const size = 16;

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

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div
        className="base44-tcard"
        onMouseEnter={() => {
          if (showParticipants) loadParticipants();
        }}
        onTouchStart={() => {
          if (showParticipants) loadParticipants();
        }}
        style={{
          overflow: "hidden",
          borderRadius: 20,
          boxShadow: "0 14px 30px rgba(0,0,0,0.12)",
          background: "#ffffff",
        }}
      >
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
                    fontWeight: 700,
                    fontSize: 20,
                    letterSpacing: "-0.01em",
                    color: "#0f172a",
                  }}
                >
                  {tournament.name}
                </div>

                <div
                  className="base44-tcard-type"
                  style={{
                    color: "rgba(255,255,255,0.85)",
                    fontWeight: 600,
                    fontSize: 15,
                    letterSpacing: "0.02em",
                    marginTop: 2,
                  }}
                >
                  {typeLabel(tournament.type)}
                </div>
              </div>

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
                {(() => {
                  const s = categoryPillStyle(cat);
                  return (
                    <Pill weight={900} bg={s.bg} fg="#ffffff" border={s.border}>
                      <CategoryIcons cat={cat} />
                      <span>{catLabel(cat)}</span>
                    </Pill>
                  );
                })()}

                <Pill
                  weight={750}
                  bg="linear-gradient(135deg, #334155 0%, #1e293b 100%)"
                  fg="#ffffff"
                  border="1px solid rgba(255,255,255,0.15)"
                >
                  <span>{lvlLabel(lvl)}</span>
                </Pill>
              </div>
            </div>
          </div>
        </div>

        {tournament.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="base44-tcard-img" src={tournament.image_url} alt={tournament.name} />
        ) : null}

        <div
          className="base44-tcard-body"
          style={{
            padding: "12px 20px 20px 20px",
            backgroundImage: `
              radial-gradient(circle at 1px 1px, rgba(15,23,42,0.05) 0.6px, rgba(0,0,0,0) 0.7px),
              linear-gradient(to bottom, #ffffff 0%, #eef2ff 100%)
            `,
            backgroundSize: "3px 3px, 100% 100%",
            backgroundPosition: "0 0, 0 0",
          }}
        >
          <div
            className="base44-tcard-info"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto",
              columnGap: 18,
              rowGap: 10,
              alignItems: "center",
            }}
          >
            <div className="base44-info-row" style={{ minWidth: 0 }}>
              <Calendar className="w-4 h-4" style={{ color: "#4f46e5" }} />
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#0f172a",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "block",
                }}
              >
                {formatPrettyDate(tournament.date)}
              </span>
            </div>

            <div
              className="base44-info-row"
              style={{
                justifyContent: "flex-end",
                justifySelf: "end",
                whiteSpace: "nowrap",
              }}
            >
              <Clock className="w-4 h-4" style={{ color: "#4f46e5" }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>
                {tournament.time}
              </span>
            </div>

            <div className="base44-info-row full" style={{ gridColumn: "1 / -1" }}>
              <MapPin className="w-4 h-4" style={{ color: "#4f46e5" }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>
                {tournament.location}
              </span>
            </div>
          </div>

          <div
            className="base44-tcard-bottom"
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <div className="base44-counts" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isMixedBaraonda ? (
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {CountIconSingle({ color: "#2563eb" })}
                    <span style={{ fontWeight: 900, color: "#0f172a" }}>
                      {counts.male}/{maxPerGender}
                    </span>
                  </div>

                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {CountIconSingle({ color: "#db2777" })}
                    <span style={{ fontWeight: 900, color: "#0f172a" }}>
                      {counts.female}/{maxPerGender}
                    </span>
                  </div>
                  {LensDialog}
                </div>
              ) : (
                <div
                  className="base44-info-row"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    whiteSpace: "nowrap",
                  }}
                >
                  <CountIconsDouble cat={cat} />

                  <span style={{ fontWeight: 800, color: "#0f172a" }}>
                    {countText}
                  </span>

                  {LensDialog}
                </div>
              )}

              {counts.reserve > 0 ? (
                <span className="base44-pill" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#b45309" }}>
                  +{counts.reserve} {counts.reserve === 1 ? "riserva" : "riserve"}
                </span>
              ) : null}
            </div>

            {status !== "none" ? (
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
            ) : live ? (
              <TournamentLiveDialog
                tournamentId={tournament.id}
                tournamentName={tournament.name}
                trigger={
                  <button
                    type="button"
                    aria-label="Apri avanzamento torneo"
                    style={{
                      background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                      color: "white",
                      fontWeight: 900,
                      padding: "10px 14px",
                      fontSize: 14,
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: "unset",
                      border: "1px solid rgba(255,255,255,0.25)",
                      boxShadow: "0 12px 26px rgba(239, 68, 68, 0.25)",
                    }}
                  >
                    LIVE
                  </button>
                }
              />
            ) : registrationsOpen ? (
              <button
                className={`base44-cta ${isFull ? "base44-cta-amber" : "base44-cta-indigo"}`}
                type="button"
                onClick={() => onRegister(tournament)}
                style={{
                  fontWeight: 600,
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
              <button
                className="base44-cta base44-cta-disabled"
                type="button"
                disabled
                style={{ fontWeight: 800, padding: "10px 14px", fontSize: 14, minWidth: "unset" }}
                title="Iscrizioni chiuse"
              >
                Iscrizioni chiuse
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}