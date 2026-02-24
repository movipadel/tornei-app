"use client";

import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { formatPlayerName } from "@/lib/formatPlayerName";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** ==========================
 *  Types
 *  ========================== */
type LiveStandingRow = {
  name: string;
  sex?: "m" | "f";
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gw: number;
  gl: number;
  difg: number;
};

type LiveMatchBaraonda = {
  match_number: number;
  team1: [string, string];
  team2: [string, string];
  team1_games: number | null;
  team2_games: number | null;
  completed: boolean;
};

type LiveTurn = {
  turn_number: number;
  matches: LiveMatchBaraonda[];
  resting: string[];
};

type FPMatch = {
  id: string;
  stage: "group" | "bracket";
  group_id: string | null;
  group_name: string | null;
  round_label: string | null;
  home: { id: string; name: string };
  away: { id: string; name: string };
  court: string | null;
  starts_at: string | null;
  completed_at: string | null;

  home_games: number | null;
  away_games: number | null;

  sets:
    | null
    | {
        set1: { home: number | null; away: number | null };
        set2: { home: number | null; away: number | null };
        set3: { home: number | null; away: number | null };
        homeSetsWon: number;
        awaySetsWon: number;
      };
};

type FPGroup = {
  id: string;
  name: string;
  position: number;
  pairs: { id: string; name: string }[];
};

type FPStandingRow = {
  pairId: string;
  name: string;
  pt: number;
  gw: number;
  gl: number;
  dg: number;
  played: number;
  wins: number;
  losses: number;
};

type LiveData =
  | { status: "no-run" }
  | {
      mode: "baraonda";
      status: string;
      runId: string;
      currentTurn: number;
      totalTurns: number;
      standings: LiveStandingRow[];
      turns: LiveTurn[];
    }
  | {
      mode: "fixed_pairs";
      status: string;
      runId: string;
      rules: any;
      groups: FPGroup[];
      standingsByGroup: Record<string, FPStandingRow[]>;
      matches_fp: FPMatch[];
      bracketRounds: { label: string; matchIds: string[] }[];
    };

/** ==========================
 *  Helpers UI
 *  ========================== */
function BlueHeader({ left, right }: { left: string; right?: string | null }) {
  return (
    <div
      style={{
        background: "linear-gradient(90deg, #2563eb 0%, #06b6d4 85%)",
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        color: "white",
      }}
    >
      <div
        style={{
          fontWeight: 950,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {left}
      </div>

      {right ? (
        <div
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.18)",
            border: "1px solid rgba(255,255,255,0.25)",
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: 12,
          }}
        >
          {right}
        </div>
      ) : null}
    </div>
  );
}

function TurnHeaderV1({
  left,
  right,
}: {
  left: string;
  right?: string | null;
}) {
  const gradient = "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)";
  const texture = getHeaderTextureOverlay();

  return (
    <div
      style={{
        backgroundImage: `${texture}, ${gradient}`,
        backgroundSize: "3px 3px, auto",
        borderRadius: 14,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        color: "white",
        boxShadow: "0 10px 22px rgba(245, 158, 11, 0.18)",
        border: "1px solid rgba(255,255,255,0.22)",
      }}
    >
      <div
        style={{
          fontWeight: 950,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontSize: 14,
        }}
      >
        {left}
      </div>

      {right ? (
        <div
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.18)",
            border: "1px solid rgba(255,255,255,0.25)",
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: 12,
          }}
        >
          {right}
        </div>
      ) : null}
    </div>
  );
}

function SectionCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: "1px solid #e2e8f0",
        boxShadow: "0 14px 30px rgba(0,0,0,0.12)",
        background: "#ffffff",
        overflow: "visible",
      }}
    >
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function getLiveHeaderGradient(mode: string | null) {
  if (mode === "baraonda") return "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)";
  if (mode === "fixed_pairs") return "linear-gradient(135deg, #2dd4bf 0%, #0ea5a4 100%)";
  return "linear-gradient(135deg, #64748b 0%, #334155 100%)";
}

function getHeaderTextureOverlay() {
  return `
    radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 0.6px, rgba(0,0,0,0) 0.7px),
    repeating-linear-gradient(135deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0.10) 1px, rgba(255,255,255,0) 10px, rgba(255,255,255,0) 18px),
    linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 55%)
  `;
}

function splitPairDisplayName(raw: string): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return ["—", "—"];

  const normalized = s
    .replaceAll(" - ", "/")
    .replaceAll(" / ", "/")
    .replaceAll(" /", "/")
    .replaceAll("/ ", "/");

  const parts = normalized
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length >= 2) return [parts[0], parts[1]];
  return [parts[0] ?? s, ""].filter((x) => x !== "");
}

function formatTimeHHMM(iso: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

function PlayerLine({
  name,
  align = "left",
  className,
}: {
  name: string;
  align?: "left" | "right";
  className: string;
}) {
  return (
    <div
      style={{
        display: "block",
        width: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: align,
      }}
    >
      <span className={className}>{formatPlayerName(name)}</span>
    </div>
  );
}

function MatchCardBaraondaStyle({
  left,
  right,
  leftScore,
  rightScore,
  stripeColor,
  playerNameClass,
  infoTop,
}: {
  left: [string, string];
  right: [string, string];
  leftScore: number | null;
  rightScore: number | null;
  stripeColor: string;
  playerNameClass: string;
  infoTop?: ReactNode;
}) {
  const hasScore = leftScore != null && rightScore != null;
  const draw = hasScore && leftScore === rightScore;
  const leftWin = hasScore && (leftScore as number) > (rightScore as number);
  const rightWin = hasScore && (rightScore as number) > (leftScore as number);

  const boxStyleBase: CSSProperties = {
    minWidth: 70,
    height: 42,
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 950,
    fontSize: 18,
    boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
    background: "#ffffff",
    color: "#0f172a",
  };

  const drawStyle: CSSProperties = draw
    ? {
        background:
          "linear-gradient(180deg, rgba(22,163,74,0.22) 0%, rgba(22,163,74,0.10) 100%)",
        borderColor: "rgba(22,163,74,0.35)",
      }
    : {};

  const leftBoxStyle: CSSProperties = leftWin
    ? {
        background:
          "linear-gradient(180deg, rgba(37,99,235,0.22) 0%, rgba(37,99,235,0.10) 100%)",
        borderColor: "rgba(37,99,235,0.35)",
      }
    : drawStyle;

  const rightBoxStyle: CSSProperties = rightWin
    ? {
        background:
          "linear-gradient(180deg, rgba(245,158,11,0.22) 0%, rgba(245,158,11,0.10) 100%)",
        borderColor: "rgba(245,158,11,0.35)",
      }
    : drawStyle;

  return (
    <>
  
    <div
      style={{
        border: "1px solid #eef2f7",
        borderRadius: 14,
        background: "#ffffff",
        overflow: "hidden",
        display: "flex",
      }}
    >
      <div style={{ width: 6, background: stripeColor }} />

      <div style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {infoTop ? (
          <div
            style={{
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              color: "#0f172a",
              fontWeight: 850,
              fontSize: 12,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {infoTop}
          </div>
        ) : null}

        <div
  style={{
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)",
    gap: 8,
    alignItems: "center",
    fontSize: "clamp(12px, 3.6vw, 16px)", // 👈 QUI: vale per entrambi i lati
    lineHeight: 1.15,
  }}
>
          <div style={{ minWidth: 0 }}>
  <div style={{ fontWeight: 900, color: "#0f172a" }}>
    <PlayerLine
      name={left[0]}
      align="left"
      className={`${playerNameClass} mv-live-name`}
    />
  </div>
  <div style={{ fontWeight: 900, color: "#0f172a" }}>
    <PlayerLine
      name={left[1]}
      align="left"
      className={`${playerNameClass} mv-live-name`}
    />
  </div>
</div>

          <div
            style={{
              color: "#94a3b8",
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: "0.06em",
              padding: "0 2px",
            }}
          >
            VS
          </div>

          <div style={{ textAlign: "right", minWidth: 0 }}>
           <div style={{ fontWeight: 900, color: "#0f172a" }}>
  <PlayerLine name={right[0]} align="right" className={`${playerNameClass} mv-live-name`} />
</div>
<div style={{ fontWeight: 900, color: "#0f172a" }}>
  <PlayerLine name={right[1]} align="right" className={`${playerNameClass} mv-live-name`} />
</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }}>
          <div style={{ ...boxStyleBase, ...leftBoxStyle }}>{leftScore ?? ""}</div>
          <div style={{ color: "#94a3b8", fontWeight: 950, fontSize: 18 }}>-</div>
          <div style={{ ...boxStyleBase, ...rightBoxStyle }}>{rightScore ?? ""}</div>
        </div>
      </div>
    </div>
    </>
  );
}

/** ==========================
 *  Component
 *  ========================== */
export default function TournamentLiveDialog({
  tournamentId,
  tournamentName,
  triggerLabel = "Vedi sviluppi",
  triggerVariant = "default",
}: {
  tournamentId: string;
  tournamentName?: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "live";
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);

  async function load() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/live`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        const msg = (json && (json.error || json.message)) || "Errore caricamento";
        throw new Error(String(msg));
      }

      setData(json as LiveData);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    load();
    timerRef.current = window.setInterval(() => load(), 5000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tournamentId]);

  const isNoRun = data && "status" in data && (data as any).status === "no-run";
  const mode = (data as any)?.mode ?? null;

  const baraonda = data && (data as any).mode === "baraonda" ? (data as any) : null;
  const fixed = data && (data as any).mode === "fixed_pairs" ? (data as any) : null;

  const dialogTitle =
    tournamentName && String(tournamentName).trim()
      ? String(tournamentName).trim()
      : "Sviluppi torneo";

      const modeLabel =
  mode === "baraonda"
    ? "Baraonda"
    : mode === "fixed_pairs"
    ? "Coppie fisse"
    : "";

const categoryRaw =
  (data as any)?.rules?.category ??
  (data as any)?.category ??
  "";

const categoryLabel =
  typeof categoryRaw === "string" && categoryRaw.trim()
    ? categoryRaw.charAt(0).toUpperCase() + categoryRaw.slice(1)
    : "";

const subtitle =
  modeLabel && categoryLabel
    ? `${modeLabel} ${categoryLabel}`
    : modeLabel || categoryLabel;

  const isMisto =
    String((data as any)?.rules?.category ?? (data as any)?.category ?? "")
      .toLowerCase()
      .trim() === "misto";

  const playerNameClass = isMisto ? "base44-player-name-misto" : "base44-player-name";

  const maleLeaderName = useMemo(() => {
    if (!isMisto || !baraonda?.standings?.length) return null;
    const row = (baraonda.standings as LiveStandingRow[]).find((x) => x.sex === "m");
    return row?.name ?? null;
  }, [isMisto, baraonda?.standings]);

  const femaleLeaderName = useMemo(() => {
    if (!isMisto || !baraonda?.standings?.length) return null;
    const row = (baraonda.standings as LiveStandingRow[]).find((x) => x.sex === "f");
    return row?.name ?? null;
  }, [isMisto, baraonda?.standings]);

  const progressPct = useMemo(() => {
    if (baraonda?.totalTurns) {
      const pct = Math.round(
        (Number(baraonda.currentTurn || 0) / Number(baraonda.totalTurns || 1)) * 100
      );
      return Math.max(0, Math.min(100, pct));
    }

    if (fixed?.matches_fp?.length) {
      const total = fixed.matches_fp.length;
      const done = fixed.matches_fp.filter((m: FPMatch) => {
        const hasScore = m.home_games != null && m.away_games != null;
        return hasScore || !!m.completed_at;
      }).length;

      const pct = Math.round((done / total) * 100);
      return Math.max(0, Math.min(100, pct));
    }

    return 0;
  }, [baraonda?.currentTurn, baraonda?.totalTurns, fixed?.matches_fp]);

  const fpMatchesById = useMemo(() => {
    const map = new Map<string, FPMatch>();
    (fixed?.matches_fp ?? []).forEach((m: FPMatch) => map.set(m.id, m));
    return map;
  }, [fixed?.matches_fp]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Keyframes per pallino LIVE del bottone (trigger) */}
      <style jsx global>{`
        @keyframes mvLiveDot {
          0% {
            transform: scale(0.95);
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7);
          }
          70% {
            transform: scale(1.15);
            opacity: 0.95;
            box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
          }
          100% {
            transform: scale(0.95);
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
          }
        }
      `}</style>

      <DialogTrigger asChild>
        {triggerVariant === "live" ? (
          <button
            type="button"
            aria-label="Apri live"
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
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "white",
                display: "inline-block",
                animation: "mvLiveDot 1.4s ease-in-out infinite",
              }}
            />
            {triggerLabel || "LIVE"}
          </button>
        ) : (
          <button className="base44-cta base44-cta-indigo" type="button">
            {triggerLabel}
          </button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-3xl [&>button[aria-label='Close']]:hidden">
        <DialogHeader style={{ display: "none" }}>
          <DialogTitle>Live</DialogTitle>
        </DialogHeader>

        {/* Keyframes per pallino LIVE (badge) */}
        <style>
          {`
            @keyframes livePulse {
              0% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.6); opacity: 0.55; }
              100% { transform: scale(1); opacity: 1; }
            }
          `}
        </style>

        {(() => {
          const headerGradient = getLiveHeaderGradient(mode);
          const headerTexture = getHeaderTextureOverlay();

          return (
            <div
              style={{
                borderRadius: 20,
                overflow: "hidden",
                border: "1px solid #e2e8f0",
                boxShadow: "0 14px 30px rgba(0,0,0,0.12)",
                background: "#fff",
              }}
            >
              {/* HEADER premium */}
              <div
                style={{
                  position: "relative",
                  padding: "14px 14px 12px",
                  color: "white",
                  backgroundImage: `${headerTexture}, ${headerGradient}`,
                  backgroundSize: "3px 3px, auto",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px",
                        borderRadius: 999,
                        background: "#ef4444",
                        color: "white",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        fontSize: 12,
                        textTransform: "uppercase",
                        boxShadow:
                          "inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.10)",
                        flex: "0 0 auto",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: "white",
                          display: "inline-block",
                          animation: "livePulse 1.6s ease-in-out infinite",
                        }}
                      />
                      LIVE
                    </span>

                    <div style={{ minWidth: 0 }}>
  <div
    style={{
      fontSize: 20,
      fontWeight: 900,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}
  >
    {dialogTitle}
  </div>

  {subtitle ? (
    <div
      style={{
        marginTop: 4,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.04em",
        opacity: 0.9,
        textTransform: "capitalize",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {subtitle}
    </div>
  ) : null}
</div>
                  </div>

                  <DialogClose asChild>
                    <button
                      type="button"
                      style={{
                        background: "rgba(255,255,255,0.18)",
                        border: "1px solid rgba(255,255,255,0.28)",
                        color: "white",
                        fontWeight: 800,
                        padding: "10px 14px",
                        borderRadius: 999,
                        lineHeight: 1,
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
                        flex: "0 0 auto",
                      }}
                    >
                      Chiudi
                    </button>
                  </DialogClose>
                </div>

                {data && mode ? (
                  <div
                    style={{
                      marginTop: 12,
                      height: 12,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.25)",
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.22)",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${progressPct}%`,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.85)",
                        transition: "width 250ms ease",
                      }}
                    />
                  </div>
                ) : null}
              </div>

              <div style={{ borderTop: "1px solid #e2e8f0" }} />

              {/* BODY */}
              <div
  style={{
    padding: 14,
    backgroundImage:
      "radial-gradient(circle at 1px 1px, rgba(15,23,42,0.05) 0.6px, rgba(0,0,0,0) 0.7px), linear-gradient(to bottom, #ffffff 0%, #eef2ff 100%)",
    backgroundSize: "3px 3px, 100% 100%",
  }}
>
                {loading && !data ? (
                  <div className="text-sm" style={{ color: "#64748b" }}>
                    Caricamento…
                  </div>
                ) : errorMsg ? (
                  <div className="base44-card">
                    <div
                      className="base44-card-inner"
                      style={{ display: "flex", flexDirection: "column", gap: 8 }}
                    >
                      <div style={{ fontWeight: 800, color: "#0f172a" }}>Errore</div>
                      <div style={{ color: "#dc2626", fontWeight: 600 }}>{errorMsg}</div>

                      <button
                        className="base44-csv-btn"
                        type="button"
                        onClick={load}
                        style={{ width: "fit-content", padding: "10px 14px", borderRadius: 999 }}
                      >
                        Riprova
                      </button>
                    </div>
                  </div>
                ) : isNoRun ? (
                  <div className="text-sm" style={{ color: "#64748b" }}>
                    Torneo non avviato.
                  </div>
                ) : !data || !mode ? (
                  <div className="text-sm" style={{ color: "#64748b" }}>
                    Nessun dato disponibile.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* ==========================
                        BARAONDA
                       ========================== */}
                    {baraonda ? (
                      <>
                        {/* Classifica */}
<SectionCard>
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ fontWeight: 900, color: "#0f172a" }}>Classifica</div>

    {baraonda.standings?.length === 0 ? (
      <div style={{ color: "#64748b" }}>Nessun risultato inserito.</div>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>#</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Giocatore</th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0", fontWeight: 900 }}>GW</th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Pt</th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0" }}>GL</th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0" }}>DifG</th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0" }}>V</th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0" }}>P</th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0" }}>S</th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Pg</th>
            </tr>
          </thead>

          <tbody>
            {baraonda.standings.map((r: LiveStandingRow, idx: number) => {
              const isLeaderClassic = !isMisto && idx === 0;

              const rNameNorm = formatPlayerName(r.name);
              const maleLeaderNorm = maleLeaderName ? formatPlayerName(maleLeaderName) : null;
              const femaleLeaderNorm = femaleLeaderName ? formatPlayerName(femaleLeaderName) : null;

              const isMaleLeader = !!maleLeaderNorm && rNameNorm === maleLeaderNorm;
              const isFemaleLeader = !!femaleLeaderNorm && rNameNorm === femaleLeaderNorm;
              const isLeader = isLeaderClassic || isMaleLeader || isFemaleLeader;

              const leaderRowStyle: CSSProperties | undefined = (() => {
                if (!isLeader) return undefined;

                if (isLeaderClassic) {
                  return {
                    backgroundImage:
                      "linear-gradient(90deg, rgba(245,158,11,0.22) 0%, rgba(245,158,11,0.10) 40%, rgba(255,255,255,0) 100%)",
                  };
                }

                if (isMisto && isMaleLeader) {
                  return {
                    backgroundImage:
                      "linear-gradient(90deg, rgba(37,99,235,0.22) 0%, rgba(37,99,235,0.10) 40%, rgba(255,255,255,0) 100%)",
                  };
                }

                if (isMisto && isFemaleLeader) {
                  return {
                    backgroundImage:
                      "linear-gradient(90deg, rgba(219,39,119,0.22) 0%, rgba(219,39,119,0.10) 40%, rgba(255,255,255,0) 100%)",
                  };
                }

                return undefined;
              })();

              return (
                <tr key={`${r.name}-${idx}`} style={leaderRowStyle}>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", color: "#64748b", fontWeight: 700 }}>
                    {idx + 1}
                  </td>

                  <td style={{ padding: 10, paddingRight: 40, borderBottom: "1px solid #eef2f7", fontWeight: 650, color: "#0f172a" }}>
                    <span className={playerNameClass}>{formatPlayerName(r.name)}</span>
                  </td>

                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 900 }}>{r.gw}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.points}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.gl}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 800 }}>{r.difg}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.wins}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.draws}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.losses}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.played}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 10, color: "#64748b", fontSize: 12 }}>
          Pt: vittoria = 1, pareggio = 0.5, sconfitta = 0.
        </div>
      </div>
    )}
  </div>
</SectionCard>

{/* Turni (solo card turno) */}
<div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 14,
    maxHeight: "55vh",
    overflow: "auto",
    paddingRight: 6,
  }}
>
  {(baraonda.turns ?? []).map((t: any, idx: number) => {
    const isCurrent = Number(baraonda.currentTurn) === Number(t.turn_number);

    return (
      <SectionCard key={t.turn_number}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TurnHeaderV1 left={`Turno ${t.turn_number}`} right={isCurrent ? "In corso" : null} />

          {t.resting?.length ? (
            <div
              className="base44-chip"
              style={{
                padding: "2px 10px",
                background: "#fffbeb",
                borderColor: "#fde68a",
                color: "#b45309",
                width: "fit-content",
              }}
            >
              Riposa:{" "}
              <span className={playerNameClass}>
                {t.resting.map((n: string) => formatPlayerName(n)).join(", ")}
              </span>
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {t.matches.map((m: any, matchIdx: number) => {
              const stripe = matchIdx % 2 === 0 ? "#2563eb" : "#f59e0b";
              return (
                <MatchCardBaraondaStyle
                  key={m.match_number}
                  left={[m.team1?.[0] ?? "—", m.team1?.[1] ?? "—"]}
                  right={[m.team2?.[0] ?? "—", m.team2?.[1] ?? "—"]}
                  leftScore={m.team1_games}
                  rightScore={m.team2_games}
                  stripeColor={stripe}
                  playerNameClass={playerNameClass}
                />
              );
            })}
          </div>
        </div>
      </SectionCard>
    );
  })}
</div>
</>
) : null}

                    {/* ==========================
                        FIXED PAIRS
                       ========================== */}
                    {fixed ? (
                      <>
                        {(fixed.groups ?? []).length === 0 ? (
                          <div style={{ color: "#64748b" }}>Gironi non disponibili.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            {fixed.groups.map((g: FPGroup) => {
                              const rows = fixed.standingsByGroup?.[g.id] ?? [];
                              const groupMatches = (fixed.matches_fp ?? []).filter(
                                (m: FPMatch) => m.stage === "group" && m.group_id === g.id
                              );

                              return (
                                <div
                                  key={g.id}
                                  style={{
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 14,
                                    padding: 12,
                                    background: "#fff",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 12,
                                  }}
                                >
                                  <BlueHeader left={g.name} right={null} />

                                  <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                                      <thead>
                                        <tr style={{ background: "#f8fafc" }}>
                                          <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>#</th>
                                          <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Coppia</th>
                                          <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Pt</th>
                                          <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0", fontWeight: 900 }}>GW</th>
                                          <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0" }}>GL</th>
                                          <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0" }}>DG</th>
                                          <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Pg</th>
                                        </tr>
                                      </thead>

                                      <tbody>
                                        {rows.map((r: FPStandingRow, idx: number) => {
                                          const isLeader = idx === 0;

                                          const leaderRowStyle = isLeader
                                            ? {
                                                backgroundImage:
                                                  "linear-gradient(90deg, rgba(245,158,11,0.22) 0%, rgba(245,158,11,0.10) 40%, rgba(255,255,255,0) 100%)",
                                              }
                                            : undefined;

                                          return (
                                            <tr key={r.pairId} style={leaderRowStyle}>
                                              <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", color: "#64748b", fontWeight: 700 }}>
                                                {idx + 1}
                                              </td>

                                              <td
                                                style={{
                                                  padding: 10,
                                                  paddingRight: 58,
                                                  borderBottom: "1px solid #eef2f7",
                                                  fontWeight: 750,
                                                  color: "#0f172a",
                                                  lineHeight: 1.15,
                                                }}
                                              >
                                                {String(r.name ?? "")
                                                  .split("/")
                                                  .map((s) => s.trim())
                                                  .filter(Boolean)
                                                  .map((part, i) => (
                                                    <div key={i} className={playerNameClass}>
                                                      {formatPlayerName(part)}
                                                    </div>
                                                  ))}
                                              </td>

                                              <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 900 }}>{r.pt}</td>
                                              <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 900 }}>{r.gw}</td>
                                              <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.gl}</td>
                                              <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 800 }}>{r.dg}</td>
                                              <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.played}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {groupMatches.map((m: FPMatch, matchIdx: number) => {
                                      const stripe = matchIdx % 2 === 0 ? "#2563eb" : "#f59e0b";
                                      const left = splitPairDisplayName(m.home?.name ?? "—");
                                      const right = splitPairDisplayName(m.away?.name ?? "—");

                                      const courtRaw = m.court;
                                      const courtStr =
                                        typeof courtRaw === "string"
                                          ? courtRaw
                                          : typeof courtRaw === "number"
                                          ? String(courtRaw)
                                          : "";
                                      const courtNorm = courtStr.trim();

                                      const validCourt =
                                        courtNorm !== "" &&
                                        courtNorm !== "-" &&
                                        courtNorm !== "—" &&
                                        courtNorm.toLowerCase() !== "null";

                                      const validTime =
                                        m.stage === "group" && typeof m.starts_at === "string" && m.starts_at.trim() !== ""
                                          ? formatTimeHHMM(m.starts_at)
                                          : null;

                                      const hasInfo = Boolean(validCourt) || Boolean(validTime);

                                      const infoTop = hasInfo ? (
                                        <>
                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ color: "#64748b", fontWeight: 900 }}>Campo</span>
                                            <span style={{ fontWeight: 950 }}>{validCourt ? courtNorm : ""}</span>
                                          </div>

                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ color: "#64748b", fontWeight: 900 }}>Ora</span>
                                            <span style={{ fontWeight: 950 }}>{validTime ?? ""}</span>
                                          </div>
                                        </>
                                      ) : null;

                                      return (
                                        <MatchCardBaraondaStyle
                                          key={m.id}
                                          left={[left[0] ?? "—", left[1] ?? "—"]}
                                          right={[right[0] ?? "—", right[1] ?? "—"]}
                                          leftScore={m.home_games}
                                          rightScore={m.away_games}
                                          stripeColor={stripe}
                                          playerNameClass={playerNameClass}
                                          infoTop={infoTop ?? undefined}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {(fixed.bracketRounds ?? []).length === 0 ? null : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "55vh", overflow: "auto", paddingRight: 6 }}>
                            {fixed.bracketRounds.map((r: any) => {
                              const matches = (r.matchIds ?? [])
                                .map((id: string) => fpMatchesById.get(id))
                                .filter(Boolean) as FPMatch[];

                              return (
                                <div
                                  key={r.label}
                                  style={{
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 14,
                                    padding: 12,
                                    background: "#fff",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 12,
                                  }}
                                >
                                  <BlueHeader left={r.label} right={null} />

                                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {matches.map((m, matchIdx) => {
                                      const stripe = matchIdx % 2 === 0 ? "#2563eb" : "#f59e0b";
                                      const left = splitPairDisplayName(m.home?.name ?? "—");
                                      const right = splitPairDisplayName(m.away?.name ?? "—");

                                      const courtRaw = m.court;
                                      const courtStr =
                                        typeof courtRaw === "string"
                                          ? courtRaw
                                          : typeof courtRaw === "number"
                                          ? String(courtRaw)
                                          : "";
                                      const courtNorm = courtStr.trim();

                                      const validCourt =
                                        courtNorm !== "" &&
                                        courtNorm !== "-" &&
                                        courtNorm !== "—" &&
                                        courtNorm.toLowerCase() !== "null";

                                      const validTime =
                                        m.stage === "group" && typeof m.starts_at === "string" && m.starts_at.trim() !== ""
                                          ? formatTimeHHMM(m.starts_at)
                                          : null;

                                      const hasInfo = Boolean(validCourt) || Boolean(validTime);

                                      const infoTop = hasInfo ? (
                                        <>
                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ color: "#64748b", fontWeight: 900 }}>Campo</span>
                                            <span style={{ fontWeight: 950 }}>{validCourt ? courtNorm : ""}</span>
                                          </div>

                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ color: "#64748b", fontWeight: 900 }}>Ora</span>
                                            <span style={{ fontWeight: 950 }}>{validTime ?? ""}</span>
                                          </div>
                                        </>
                                      ) : null;

                                      return (
                                        <MatchCardBaraondaStyle
                                          key={m.id}
                                          left={[left[0] ?? "—", left[1] ?? "—"]}
                                          right={[right[0] ?? "—", right[1] ?? "—"]}
                                          leftScore={m.home_games}
                                          rightScore={m.away_games}
                                          stripeColor={stripe}
                                          playerNameClass={playerNameClass}
                                          infoTop={infoTop ?? undefined}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}