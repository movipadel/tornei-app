"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
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
function BlueHeader({
  left,
  right,
}: {
  left: string;
  right?: string | null;
}) {
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
    // toLocaleTimeString con 2-digit è la cosa più robusta senza lib esterne
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

/**
 * Match renderer in stile Baraonda:
 *  - striscia laterale
 *  - (opzionale) info bar in alto (campo + orario)
 *  - coppia sx VS coppia dx
 *  - 2 box punteggio con colori dinamici
 *  - draw: verde
 */
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
  infoTop?: React.ReactNode;
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
        {/* info bar */}
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

        {/* Nomi: sx vs dx */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontWeight: 900, color: "#0f172a" }}>
              <span className={playerNameClass}>{formatPlayerName(left[0])}</span>
            </div>
            <div style={{ fontWeight: 900, color: "#0f172a" }}>
              <span className={playerNameClass}>{formatPlayerName(left[1])}</span>
            </div>
          </div>

          <div
            style={{
              color: "#94a3b8",
              fontWeight: 950,
              fontSize: 12,
              letterSpacing: "0.08em",
            }}
          >
            VS
          </div>

          <div style={{ textAlign: "right", lineHeight: 1.15 }}>
            <div style={{ fontWeight: 900, color: "#0f172a" }}>
              <span className={playerNameClass}>{formatPlayerName(right[0])}</span>
            </div>
            <div style={{ fontWeight: 900, color: "#0f172a" }}>
              <span className={playerNameClass}>{formatPlayerName(right[1])}</span>
            </div>
          </div>
        </div>

        {/* Score: due box */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }}>
          <div style={{ ...boxStyleBase, ...leftBoxStyle }}>{leftScore ?? ""}</div>
          <div style={{ color: "#94a3b8", fontWeight: 950, fontSize: 18 }}>-</div>
          <div style={{ ...boxStyleBase, ...rightBoxStyle }}>{rightScore ?? ""}</div>
        </div>
      </div>
    </div>
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
        {/* Keyframes per pallino LIVE */}
        <style>
          {`
            @keyframes livePulse {
              0% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.6); opacity: 0.55; }
              100% { transform: scale(1); opacity: 1; }
            }
          `}
        </style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <DialogHeader style={{ width: "100%" }}>
            <DialogTitle style={{ display: "none" }}>Live</DialogTitle>

            {/* Riga LIVE + Nome torneo */}
            {data && mode ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: "#ef4444",
                    color: "white",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    fontSize: 12,
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

                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#0f172a",
                  }}
                >
                  {dialogTitle}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#0f172a",
                  marginTop: 6,
                }}
              >
                {dialogTitle}
              </div>
            )}

            {/* Progress bar */}
            {data && mode ? (
              <div
                style={{
                  marginTop: 12,
                  height: 14,
                  borderRadius: 999,
                  background: "#e5e7eb",
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progressPct}%`,
                    borderRadius: 999,
                    background: "linear-gradient(90deg, #2563eb 0%, #06b6d4 70%, #e5e7eb 100%)",
                    transition: "width 250ms ease",
                  }}
                />
              </div>
            ) : null}
          </DialogHeader>

          <DialogClose asChild>
            <button className="base44-csv-btn" type="button" style={{ padding: "10px 14px", borderRadius: 999 }}>
              Chiudi
            </button>
          </DialogClose>
        </div>

        {loading && !data ? (
          <div className="text-sm" style={{ color: "#64748b" }}>
            Caricamento…
          </div>
        ) : errorMsg ? (
          <div className="base44-card">
            <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                <div className="base44-card">
                  <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                </div>

                {/* Turni (solo card turno) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "55vh", overflow: "auto", paddingRight: 6 }}>
                  {(baraonda.turns ?? []).map((t: any, idx: number) => {
                    const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
                    const isCurrent = Number(baraonda.currentTurn) === Number(t.turn_number);

                    return (
                      <div
                        key={t.turn_number}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 14,
                          padding: 12,
                          background: bg,
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        <BlueHeader left={`Turno ${t.turn_number}`} right={isCurrent ? "In corso" : null} />

                        {t.resting?.length ? (
                          <div className="base44-chip" style={{ padding: "2px 10px", background: "#fffbeb", borderColor: "#fde68a", color: "#b45309", width: "fit-content" }}>
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

                          {/* classifica girone */}
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

                          {/* match girone -> stesso layout Baraonda + info bar campo/orario */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {groupMatches.map((m: FPMatch, matchIdx: number) => {
                              const stripe = matchIdx % 2 === 0 ? "#2563eb" : "#f59e0b";
                              const left = splitPairDisplayName(m.home?.name ?? "—");
                              const right = splitPairDisplayName(m.away?.name ?? "—");

                              // Campo valido solo se esiste e non è "-" o stringa vuota
const courtRaw = m.court;

// accetta string o number, ignora altri tipi
const courtStr =
  typeof courtRaw === "string"
    ? courtRaw
    : typeof courtRaw === "number"
    ? String(courtRaw)
    : "";

const courtNorm = courtStr.trim();

// Campo valido solo se non è vuoto e non è placeholder
const validCourt =
  courtNorm !== "" &&
  courtNorm !== "-" &&
  courtNorm !== "—" &&
  courtNorm.toLowerCase() !== "null";

// Orario valido: SOLO nei gironi (il tabellone ha orari “finti”)
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

                {/* Tabellone: SOLO round cards + match stile Baraonda + info bar */}
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

                              // Campo valido solo se esiste e non è "-" o stringa vuota
const courtRaw = m.court;

// accetta string o number, ignora altri tipi
const courtStr =
  typeof courtRaw === "string"
    ? courtRaw
    : typeof courtRaw === "number"
    ? String(courtRaw)
    : "";

const courtNorm = courtStr.trim();

// Campo valido solo se non è vuoto e non è placeholder
const validCourt =
  courtNorm !== "" &&
  courtNorm !== "-" &&
  courtNorm !== "—" &&
  courtNorm.toLowerCase() !== "null";

// Orario valido: SOLO nei gironi (il tabellone ha orari “finti”)
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
      </DialogContent>
    </Dialog>
  );
}