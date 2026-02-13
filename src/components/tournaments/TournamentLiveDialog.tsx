"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function statusLabel(s?: string | null) {
  const v = String(s ?? "").toLowerCase();
  if (v === "running") return "In corso";
  if (v === "locked") return "Bloccato";
  if (v === "finished") return "Finito";
  return s ?? "-";
}

function statusChipStyle(s?: string | null) {
  const v = String(s ?? "").toLowerCase();
  if (v === "running") return { background: "#ecfeff", borderColor: "#a5f3fc", color: "#155e75" };
  if (v === "locked") return { background: "#eef2ff", borderColor: "#c7d2fe", color: "#3730a3" };
  if (v === "finished") return { background: "#f0fdf4", borderColor: "#bbf7d0", color: "#166534" };
  return { background: "#f8fafc", borderColor: "#e2e8f0", color: "#334155" };
}

function TeamColumn({ team }: { team: [string, string] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, lineHeight: 1.15 }}>
      <div style={{ fontWeight: 650 }}>{team[0]}</div>
      <div style={{ fontWeight: 650 }}>{team[1]}</div>
    </div>
  );
}

function scoreBadgeStyle(team1_games: number | null, team2_games: number | null) {
  const hasScore = team1_games != null && team2_games != null;
  const isDraw = hasScore && team1_games === team2_games;

  if (!hasScore) {
    return {
      background: "#e2e8f0",
      borderColor: "#cbd5e1",
      color: "#334155",
      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08)",
    };
  }

  if (isDraw) {
    return {
      background: "#2563eb",
      borderColor: "#1d4ed8",
      color: "#ffffff",
      boxShadow: "0 2px 8px rgba(37,99,235,0.35)",
    };
  }

  return {
    background: "#111827",
    borderColor: "#0b1220",
    color: "#ffffff",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  };
}

/**
 * FIXED PAIRS: score line per layout "mobile-first"
 * - one_set: mostra solo 6-4
 * - best_of_3: mostra SOLO set scores (es: 6-4 3-6 10-8)
 * - niente "2-0 / 2-1"
 */
function ScoreLine({ m }: { m: FPMatch }) {
  if (!m.sets) {
    const b = scoreBadgeStyle(m.home_games, m.away_games);
    return (
      <div
        style={{
          padding: "4px 12px",
          borderRadius: 999,
          border: `1px solid ${b.borderColor}`,
          background: b.background,
          color: b.color,
          fontSize: 16,
          fontWeight: 900,
          minWidth: 72,
          textAlign: "center",
          lineHeight: 1.05,
          boxShadow: b.boxShadow,
        }}
      >
        {(m.home_games ?? "-")} - {(m.away_games ?? "-")}
      </div>
    );
  }

  const parts: string[] = [];
  (["set1", "set2", "set3"] as const).forEach((k) => {
    const s = (m.sets as any)[k];
    const has = s?.home != null && s?.away != null;
    if (has) parts.push(`${s.home}-${s.away}`);
  });

  if (parts.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
      {parts.map((txt, i) => (
        <span
          key={`${txt}-${i}`}
          className="base44-chip"
          style={{
  padding: "3px 10px",
  background: "#f8fafc",
  borderColor: "#e2e8f0",
  color: "#0f172a",
  fontWeight: 900,
  fontSize: 14,
  lineHeight: 1.1,
  boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
}}

        >
          {txt}
        </span>
      ))}
    </div>
  );
}

/** Layout match Fixed Pairs: 4 righe (home / VS / away / sets) */
function FixedPairsMatchStack({ m }: { m: FPMatch }) {
  const empty = m.home?.name === "—" || m.away?.name === "—";

  const homeName = String(m.home?.name ?? "").replaceAll("/", " - ");
  const awayName = String(m.away?.name ?? "").replaceAll("/", " - ");

  return (
    <div
      style={{
        border: "1px solid #eef2f7",
        borderRadius: 12,
        padding: 10,
        background: empty ? "#f8fafc" : "#fafafa",
        opacity: empty ? 0.78 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* riga 1: coppia 1 */}
      <div style={{ fontWeight: 750, color: "#0f172a", lineHeight: 1.15 }}>
        {homeName}
      </div>

      {/* riga 2: VS */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            color: "#94a3b8",
            fontWeight: 900,
            fontSize: 12,
            letterSpacing: "0.08em",
          }}
        >
          VS
        </div>
      </div>

      {/* riga 3: coppia 2 */}
      <div
        style={{
          fontWeight: 750,
          color: "#0f172a",
          textAlign: "right",
          lineHeight: 1.15,
        }}
      >
        {awayName}
      </div>

      {/* riga 4: risultati set */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ScoreLine m={m} />
      </div>
    </div>
  );
}


export default function TournamentLiveDialog({
  tournamentId,
  triggerLabel = "Vedi sviluppi",
}: {
  tournamentId: string;
  triggerLabel?: string;
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

  const fpMatchesById = useMemo(() => {
    const m = new Map<string, FPMatch>();
    (fixed?.matches_fp ?? []).forEach((x: FPMatch) => m.set(x.id, x));
    return m;
  }, [fixed?.matches_fp]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="base44-cta base44-cta-indigo" type="button">
          {triggerLabel}
        </button>
      </DialogTrigger>

      {/* (mantengo la tua versione attuale) */}
      <DialogContent className="max-w-3xl [&>button[aria-label='Close']]:hidden">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <DialogHeader>
            <DialogTitle>Sviluppi torneo</DialogTitle>
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
            {/* Header stato */}
            <div className="base44-card">
              <div
                className="base44-card-inner"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="base44-chip" style={{ ...statusChipStyle((data as any).status), padding: "2px 10px" }}>
                    {statusLabel((data as any).status)}
                  </span>

                  <span className="base44-chip" style={{ padding: "2px 10px" }}>
                    {mode === "fixed_pairs" ? "Coppie fisse" : "Baraonda"}
                  </span>
                </div>

                <div style={{ color: "#94a3b8", fontSize: 12 }}>{loading ? "Aggiornamento…" : "Auto-refresh: 5s"}</div>
              </div>
            </div>

            {/* ==========================
                BARAONDA (lasciato invariato)
               ========================== */}
            {baraonda ? (
              <>
                <div className="base44-card">
                  <div className="base44-card-inner" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ color: "#64748b" }}>
                      Turno <b style={{ color: "#0f172a" }}>{baraonda.currentTurn}</b>/{baraonda.totalTurns}
                    </div>
                  </div>
                </div>

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
  {baraonda.standings.map((r: any, idx: number) => {
    const isLeader = idx === 0;
    return (
      <tr key={`${r.name}-${idx}`} style={isLeader ? { background: "#eef2ff" } : undefined}>
        <td
          style={{
            padding: 10,
            borderBottom: "1px solid #eef2f7",
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          {idx + 1}
        </td>

        <td
          style={{
            padding: 10,
            paddingRight: 40,
            borderBottom: "1px solid #eef2f7",
            fontWeight: 650,
            color: "#0f172a",
          }}
        >
          {r.name}
          {isLeader && (
            <span
              style={{
                marginLeft: 6,
                color: "#f59e0b",
                fontSize: 14,
                fontWeight: 900,
                verticalAlign: "middle",
              }}
              title="Leader"
            >
              ★
            </span>
          )}
        </td>

        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 900 }}>
          {r.gw}
        </td>
        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>
          {r.points}
        </td>
        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>
          {r.gl}
        </td>
        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 800 }}>
          {r.difg}
        </td>
        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>
          {r.wins}
        </td>
        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>
          {r.draws}
        </td>
        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>
          {r.losses}
        </td>
        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>
          {r.played}
        </td>
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

                <div className="base44-card">
                  <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>Turni</div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "55vh", overflow: "auto", paddingRight: 6 }}>
                      {(baraonda.turns ?? []).map((t: any, idx: number) => {
                        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
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
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                              <div style={{ fontWeight: 900, color: "#0f172a" }}>Turno {t.turn_number}</div>

                              {t.resting?.length ? (
                                <div className="base44-chip" style={{ padding: "2px 10px", background: "#fffbeb", borderColor: "#fde68a", color: "#b45309" }}>
                                  Riposa: {t.resting.join(", ")}
                                </div>
                              ) : (
                                <div className="base44-chip" style={{ padding: "2px 10px" }}>
                                  Nessun riposo
                                </div>
                              )}
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {t.matches.map((m: any) => {
                                const badge = scoreBadgeStyle(m.team1_games, m.team2_games);
                                return (
                                  <div
                                    key={m.match_number}
                                    style={{ border: "1px solid #eef2f7", borderRadius: 12, padding: 10, background: "#fafafa", display: "flex", flexDirection: "column", gap: 10 }}
                                  >
          
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
  {/* Coppia 1 sopra, allineata a sinistra */}
  <div style={{ fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>
    {m.team1?.[0]} - {m.team1?.[1]}
  </div>

  {/* Badge punteggio (come ora) */}
  <div style={{ display: "flex", justifyContent: "center" }}>
    <div
      style={{
        padding: "5px 16px",
        borderRadius: 999,
        border: `1px solid ${badge.borderColor}`,
        background: badge.background,
        color: badge.color,
        fontSize: 20,
        fontWeight: 800,
        minWidth: 90,
        textAlign: "center",
        lineHeight: 1.05,
        boxShadow: badge.boxShadow,
      }}
    >
      {(m.team1_games ?? "-")} - {(m.team2_games ?? "-")}
    </div>
  </div>

  {/* Coppia 2 sotto, allineata a destra */}
  <div style={{ fontWeight: 800, color: "#0f172a", textAlign: "right", lineHeight: 1.15 }}>
    {m.team2?.[0]} - {m.team2?.[1]}
  </div>
</div>

                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {/* ==========================
                FIXED PAIRS (modificato)
               ========================== */}
            {fixed ? (
              <>
                {/* Gironi */}
                <div className="base44-card">
                  <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>Gironi</div>

                    {(fixed.groups ?? []).length === 0 ? (
                      <div style={{ color: "#64748b" }}>Gironi non disponibili.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {fixed.groups.map((g: FPGroup) => {
                          const rows = fixed.standingsByGroup?.[g.id] ?? [];
                          const groupMatches = (fixed.matches_fp ?? []).filter((m: FPMatch) => m.stage === "group" && m.group_id === g.id);

                          return (
                            <div key={g.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                                <div style={{ fontWeight: 900, color: "#0f172a" }}>{g.name}</div>
                                <span className="base44-chip" style={{ padding: "2px 10px" }}>
                                  {g.pairs.length} coppie
                                </span>
                              </div>

                              {/* classifica girone (lasciata com'è per ora, la uniformiamo dopo se vuoi) */}
                              <div style={{ marginTop: 10, overflowX: "auto" }}>
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
                                    {rows.map((r: FPStandingRow, idx: number) => (
                                      <tr key={r.pairId}>
                                        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", color: "#64748b", fontWeight: 700 }}>{idx + 1}</td>
                                        <td
  style={{
    padding: 10,
    paddingRight: 58, // più spazio prima di Pt
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
      <div key={i}>{part}</div>
    ))}
</td>

                                        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 900 }}>{r.pt}</td>
                                        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 900 }}>{r.gw}</td>
                                        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.gl}</td>
                                        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 800 }}>{r.dg}</td>
                                        <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.played}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* match girone (NUOVO layout 4 righe, niente header) */}
                              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                                {groupMatches.map((m: FPMatch) => (
                                  <FixedPairsMatchStack key={m.id} m={m} />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabellone (stesso layout match 4 righe) */}
                <div className="base44-card">
                  <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>Tabellone</div>

                    {(fixed.bracketRounds ?? []).length === 0 ? (
                      <div style={{ color: "#64748b" }}>Tabellone non disponibile.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "55vh", overflow: "auto", paddingRight: 6 }}>
                        {fixed.bracketRounds.map((r: any) => {
                          const matches = (r.matchIds ?? [])
                            .map((id: string) => fpMatchesById.get(id))
                            .filter(Boolean) as FPMatch[];

                          return (
                            <div key={r.label} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                                <div style={{ fontWeight: 900, color: "#0f172a" }}>{r.label}</div>
                                <span className="base44-chip" style={{ padding: "2px 10px" }}>
                                  {matches.length} match
                                </span>
                              </div>

                              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                                {matches.map((m) => (
                                  <FixedPairsMatchStack key={m.id} m={m} />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
