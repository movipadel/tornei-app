"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

type RunApiOk = {
  tournamentId: string;
  runId: string | null;
  status: string | null;
  started_at: string | null;

  // ✅ nome torneo (aggiungilo in initialData dal server)
  tournamentName?: string | null;

  // ✅ dal GET unificato
  mode?: "baraonda" | "fixed_pairs";
  rules?: { scoring?: "one_set" | "best_of_3" };

  turns: Array<any>; // Baraonda
  matches_fp?: Array<any>; // Coppie fisse (gironi+tabellone)
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

function sanitizeScore(v: string) {
  const onlyDigits = v.replace(/[^\d]/g, "");
  return onlyDigits.slice(0, 2);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

type SavingMap = Record<string, boolean>;

// ---------- BARAONDA ----------
type BaraondaMatch = {
  kind: "baraonda";
  id: string;
  match_number: number;
  team1_games: number | null;
  team2_games: number | null;
  team1: string[];
  team2: string[];
  patch_url: string;
};

type BaraondaTurn = {
  id: string;
  turn_number: number;
  matches: BaraondaMatch[];
  resting: string[];
};

type ScoreDraftOne = { a: string; b: string };

// ---------- FIXED PAIRS ----------
type FpMatch = {
  kind: "fixed_pairs";
  id: string;
  stage: "group" | "bracket";
  group_name?: string | null;
  round_label?: string | null;

  home_name: string;
  away_name: string;

  court?: number | null;
  starts_at?: string | null;

  // totals (somma games)
  home_games: number | null;
  away_games: number | null;

  // sets
  set1_home_games: number | null;
  set1_away_games: number | null;
  set2_home_games: number | null;
  set2_away_games: number | null;
  set3_home_games: number | null;
  set3_away_games: number | null;
  home_sets: number | null;
  away_sets: number | null;

  patch_url: string;
};

type ScoreDraftBo3 = {
  s1h: string; s1a: string;
  s2h: string; s2a: string;
  s3h: string; s3a: string;
};

type StandingRowFP = {
  name: string;         // coppia
  points: number;       // win=1, draw=0.5, loss=0
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;           // games won
  gs: number;           // games lost
  diff: number;
};

function toNumOrNull(s: string) {
  const v = s.trim();
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

export default function RunClient({
  initialData,
  tournamentName,
}: {
  initialData: RunApiOk;
  tournamentName?: string;
}) {

  const [data, setData] = useState<RunApiOk>(initialData);
  const [showStandings, setShowStandings] = useState(false);
  const [savingByMatch, setSavingByMatch] = useState<SavingMap>({});
    const headerTitle = (tournamentName ?? "").trim() || "Sviluppo torneo";


  const mode = (data.mode ?? "baraonda") as "baraonda" | "fixed_pairs";
  const scoring = (data.rules?.scoring ?? "best_of_3") as "one_set" | "best_of_3";

  // ------------------ DRAFTS ------------------
  const [draftOne, setDraftOne] = useState<Record<string, ScoreDraftOne>>(() => {
    const d: Record<string, ScoreDraftOne> = {};
    // baraonda
    for (const t of (initialData.turns ?? []) as BaraondaTurn[]) {
      for (const m of (t.matches ?? []) as any[]) {
        d[m.id] = {
          a: m.team1_games == null ? "" : String(m.team1_games),
          b: m.team2_games == null ? "" : String(m.team2_games),
        };
      }
    }
    // fixed pairs (one_set usa totals)
    for (const m of (initialData.matches_fp ?? []) as FpMatch[]) {
      d[m.id] = {
        a: m.home_games == null ? "" : String(m.home_games),
        b: m.away_games == null ? "" : String(m.away_games),
      };
    }
    return d;
  });

  const [draftBo3, setDraftBo3] = useState<Record<string, ScoreDraftBo3>>(() => {
    const d: Record<string, ScoreDraftBo3> = {};
    for (const m of (initialData.matches_fp ?? []) as FpMatch[]) {
      d[m.id] = {
        s1h: m.set1_home_games == null ? "" : String(m.set1_home_games),
        s1a: m.set1_away_games == null ? "" : String(m.set1_away_games),
        s2h: m.set2_home_games == null ? "" : String(m.set2_home_games),
        s2a: m.set2_away_games == null ? "" : String(m.set2_away_games),
        s3h: m.set3_home_games == null ? "" : String(m.set3_home_games),
        s3a: m.set3_away_games == null ? "" : String(m.set3_away_games),
      };
    }
    return d;
  });

  // ------------------ BARAONDA VIEW ------------------
  const turns = useMemo(() => (data.turns ?? []) as BaraondaTurn[], [data.turns]);

  // classifica baraonda
  const standingsBaraonda = useMemo(() => {
    const map = new Map<
      string,
      { name: string; points: number; played: number; wins: number; draws: number; losses: number; gf: number; gs: number; diff: number }
    >();

    function ensure(name: string) {
      if (!map.has(name)) {
        map.set(name, { name, points: 0, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, gs: 0, diff: 0 });
      }
      return map.get(name)!;
    }

    for (const t of turns) {
      for (const m of t.matches ?? []) {
        const s1 = m.team1_games;
        const s2 = m.team2_games;
        if (s1 == null || s2 == null) continue;

        const team1 = m.team1 ?? [];
        const team2 = m.team2 ?? [];

        const t1Win = s1 > s2;
        const t2Win = s2 > s1;
        const draw = s1 === s2;

        for (const p of team1) {
          const r = ensure(p);
          r.played += 1;
          r.gf += s1;
          r.gs += s2;
          if (t1Win) { r.wins += 1; r.points += 1; }
          else if (draw) { r.draws += 1; r.points += 0.5; }
          else { r.losses += 1; }
        }

        for (const p of team2) {
          const r = ensure(p);
          r.played += 1;
          r.gf += s2;
          r.gs += s1;
          if (t2Win) { r.wins += 1; r.points += 1; }
          else if (draw) { r.draws += 1; r.points += 0.5; }
          else { r.losses += 1; }
        }
      }
    }

    const arr = Array.from(map.values()).map((r) => ({ ...r, diff: r.gf - r.gs, points: round1(r.points) }));
    // sort Baraonda: GW desc, Pt desc, DifG desc, GL asc, nome asc
    arr.sort((a, b) => {
      if (b.gf !== a.gf) return b.gf - a.gf;
      if (b.points !== a.points) return b.points - a.points;
      if (b.diff !== a.diff) return b.diff - a.diff;
      if (a.gs !== b.gs) return a.gs - b.gs;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [turns]);

  // ------------------ FIXED PAIRS VIEW ------------------
  const matchesFp = useMemo(() => (data.matches_fp ?? []) as FpMatch[], [data.matches_fp]);
  const hasGroupFp = useMemo(() => matchesFp.some((m) => m.stage === "group"), [matchesFp]);

  const groupedFp = useMemo(() => {
    const groups = new Map<string, FpMatch[]>();
    for (const m of matchesFp) {
      const key =
        m.stage === "group"
          ? `group::${m.group_name ?? "Girone"}`
          : `bracket::${m.round_label ?? "Tabellone"}`;
      const arr = groups.get(key) ?? [];
      arr.push(m);
      groups.set(key, arr);
    }

    const keys = Array.from(groups.keys()).sort((a, b) => {
      const aIsGroup = a.startsWith("group::");
      const bIsGroup = b.startsWith("group::");
      if (aIsGroup !== bIsGroup) return aIsGroup ? -1 : 1;
      return a.localeCompare(b);
    });

    return keys.map((k) => ({
      key: k,
      title: k.split("::")[1] ?? k,
      stage: k.startsWith("group::") ? "group" : "bracket",
      matches: (groups.get(k) ?? []).slice(),
    }));
  }, [matchesFp]);

  const standingsFp: StandingRowFP[] = useMemo(() => {
    if (!hasGroupFp) return [];

    const map = new Map<string, StandingRowFP>();
    function ensure(name: string) {
      if (!map.has(name)) {
        map.set(name, { name, points: 0, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, gs: 0, diff: 0 });
      }
      return map.get(name)!;
    }

    for (const m of matchesFp) {
      if (m.stage !== "group") continue;
      if (m.home_games == null || m.away_games == null) continue;

      const home = String(m.home_name ?? "").trim();
      const away = String(m.away_name ?? "").trim();
      if (!home || !away) continue;

      const hg = m.home_games ?? 0;
      const ag = m.away_games ?? 0;

      const homeWin =
        scoring === "best_of_3"
          ? (m.home_sets ?? 0) > (m.away_sets ?? 0)
          : hg > ag;

      const awayWin =
        scoring === "best_of_3"
          ? (m.away_sets ?? 0) > (m.home_sets ?? 0)
          : ag > hg;

      const draw = scoring === "one_set" ? hg === ag : false;

      // home
      {
        const r = ensure(home);
        r.played += 1;
        r.gf += hg;
        r.gs += ag;
        if (homeWin) { r.wins += 1; r.points += 1; }
        else if (draw) { r.draws += 1; r.points += 0.5; }
        else { r.losses += 1; }
      }
      // away
      {
        const r = ensure(away);
        r.played += 1;
        r.gf += ag;
        r.gs += hg;
        if (awayWin) { r.wins += 1; r.points += 1; }
        else if (draw) { r.draws += 1; r.points += 0.5; }
        else { r.losses += 1; }
      }
    }

    const arr = Array.from(map.values()).map((r) => ({ ...r, diff: r.gf - r.gs, points: round1(r.points) }));

    // sort Gironi: Pt desc, GW desc, DifG desc, GL asc, nome asc
    arr.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gf !== a.gf) return b.gf - a.gf;
      if (b.diff !== a.diff) return b.diff - a.diff;
      if (a.gs !== b.gs) return a.gs - b.gs;
      return a.name.localeCompare(b.name);
    });

    return arr;
  }, [matchesFp, scoring, hasGroupFp]);

  // ------------------ PATCH HELPERS ------------------
  async function patchAnyMatch(matchId: string, patchUrl: string, body: any, applyLocal: (prev: RunApiOk) => RunApiOk) {
    setSavingByMatch((p) => ({ ...p, [matchId]: true }));
    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore salvataggio");

      setData((prev) => applyLocal(prev));
      toast.success("Risultato salvato");
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSavingByMatch((p) => ({ ...p, [matchId]: false }));
    }
  }

  // ------------------ UI ------------------
  const canShowStandings = mode === "baraonda" ? true : hasGroupFp;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div className="base44-card">
        <div
          className="base44-card-inner"
          style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* ✅ QUI: titolo = nome torneo */}
            <div style={{ fontWeight: 900, fontSize: 20, color: "#0f172a" }}>{headerTitle}</div>

            <div style={{ color: "#64748b", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="base44-chip" style={{ ...statusChipStyle(data.status), padding: "2px 10px" }}>
                {statusLabel(data.status)}
              </span>

              {mode === "fixed_pairs" && (
                <span className="base44-chip" style={{ padding: "2px 10px", background: "#f8fafc", borderColor: "#e2e8f0" }}>
                  Coppie fisse — {scoring === "one_set" ? "1 set" : "Best of 3"}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {canShowStandings && (
              <button
                className="base44-csv-btn"
                onClick={() => setShowStandings((v) => !v)}
                style={{ padding: "10px 14px", borderRadius: 999 }}
              >
                {showStandings ? "Chiudi classifica" : "Classifica"}
              </button>
            )}

            <a className="base44-csv-btn" href="/admin/tournaments" style={{ padding: "10px 14px", borderRadius: 999 }}>
              ← Tornei
            </a>
          </div>
        </div>
      </div>

      {/* Classifica */}
      {showStandings && canShowStandings && (
        <div className="base44-card">
          <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 900, color: "#0f172a" }}>Classifica</div>

            {mode === "baraonda" ? (
              standingsBaraonda.length === 0 ? (
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
                      {standingsBaraonda.map((r, idx) => (
                        <tr key={r.name}>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", color: "#64748b", fontWeight: 700 }}>{idx + 1}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#475569" }}>{r.name}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 900 }}>{r.gf}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.points}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.gs}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.diff}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.wins}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.draws}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.losses}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.played}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10, color: "#64748b", fontSize: 12 }}>Pt: vittoria = 1, pareggio = 0.5, sconfitta = 0.</div>
                </div>
              )
            ) : (
              standingsFp.length === 0 ? (
                <div style={{ color: "#64748b" }}>Nessun risultato inserito (gironi).</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>#</th>
                        <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Coppia</th>
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
                      {standingsFp.map((r, idx) => (
                        <tr key={r.name}>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", color: "#64748b", fontWeight: 700 }}>{idx + 1}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#475569" }}>{r.name}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 900 }}>{r.gf}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.points}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.gs}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.diff}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.wins}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.draws}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.losses}</td>
                          <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.played}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10, color: "#64748b", fontSize: 12 }}>Gironi: Pt=1 vittoria, 0.5 pareggio (solo one_set), 0 sconfitta.</div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* BODY */}
      {mode === "baraonda" ? (
        turns.length === 0 ? (
          <div className="base44-card">
            <div className="base44-card-inner" style={{ color: "#64748b" }}>Nessun turno generato.</div>
          </div>
        ) : (
          turns.map((t) => (
            <div key={t.id} className="base44-card">
              <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>Turno {t.turn_number}</div>

                  {t.resting?.length ? (
                    <div className="base44-chip" style={{ padding: "2px 10px", background: "#fffbeb", borderColor: "#fde68a", color: "#b45309" }}>
                      Riposa: {t.resting.join(", ")}
                    </div>
                  ) : (
                    <div className="base44-chip" style={{ padding: "2px 10px" }}>Nessun riposo</div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(t.matches ?? []).map((m) => {
                    const d = draftOne[m.id] ?? { a: "", b: "" };
                    const isSaving = !!savingByMatch[m.id];

                    return (
                      <div
                        key={m.id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 14,
                          padding: 12,
                          background: "#ffffff",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 800, color: "#334155" }}>Match {m.match_number}</div>
                          <div className="base44-chip" style={{ padding: "2px 10px" }}>
                            {(m.team1_games ?? "-")} - {(m.team2_games ?? "-")}
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center" }}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{(m.team1 ?? []).join(" + ")}</div>
                          <div style={{ color: "#94a3b8", fontWeight: 900, textAlign: "center" }}>VS</div>
                          <div style={{ fontWeight: 700, color: "#0f172a", textAlign: "right" }}>{(m.team2 ?? []).join(" + ")}</div>
                        </div>

                        {/* ✅ QUI: tolto "Score:" */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <input
                            value={d.a}
                            onChange={(e) => {
                              const v = sanitizeScore(e.target.value);
                              setDraftOne((p) => ({ ...p, [m.id]: { ...(p[m.id] ?? d), a: v } }));
                            }}
                            inputMode="numeric"
                            placeholder=""
                            style={{ width: 70, padding: "10px 12px", borderRadius: 12, border: "1px solid #e2e8f0", outline: "none" }}
                          />

                          <div style={{ fontWeight: 900, color: "#94a3b8" }}>-</div>

                          <input
                            value={d.b}
                            onChange={(e) => {
                              const v = sanitizeScore(e.target.value);
                              setDraftOne((p) => ({ ...p, [m.id]: { ...(p[m.id] ?? d), b: v } }));
                            }}
                            inputMode="numeric"
                            placeholder=""
                            style={{ width: 70, padding: "10px 12px", borderRadius: 12, border: "1px solid #e2e8f0", outline: "none" }}
                          />

                          <button
                            className="base44-primary-btn"
                            disabled={isSaving}
                            style={{ padding: "10px 14px", borderRadius: 999, opacity: isSaving ? 0.7 : 1 }}
                            onClick={() => {
                              const t1 = d.a.trim() === "" ? null : Number(d.a);
                              const t2 = d.b.trim() === "" ? null : Number(d.b);
                              if (t1 != null && Number.isNaN(t1)) return toast.error("Score non valido");
                              if (t2 != null && Number.isNaN(t2)) return toast.error("Score non valido");

                              patchAnyMatch(
                                m.id,
                                m.patch_url,
                                { team1_games: t1, team2_games: t2 },
                                (prev) => {
                                  const next = structuredClone(prev) as RunApiOk;
                                  for (const tt of next.turns ?? []) {
                                    for (const mm of tt.matches ?? []) {
                                      if (mm.id === m.id) {
                                        mm.team1_games = t1;
                                        mm.team2_games = t2;
                                      }
                                    }
                                  }
                                  return next;
                                }
                              );
                            }}
                          >
                            {isSaving ? "Salvataggio..." : "Salva"}
                          </button>

                          <button
                            className="base44-csv-btn"
                            disabled={isSaving}
                            style={{ padding: "10px 14px", borderRadius: 999 }}
                            onClick={() => {
                              setDraftOne((p) => ({ ...p, [m.id]: { a: "", b: "" } }));
                              patchAnyMatch(
                                m.id,
                                m.patch_url,
                                { team1_games: null, team2_games: null },
                                (prev) => {
                                  const next = structuredClone(prev) as RunApiOk;
                                  for (const tt of next.turns ?? []) {
                                    for (const mm of tt.matches ?? []) {
                                      if (mm.id === m.id) {
                                        mm.team1_games = null;
                                        mm.team2_games = null;
                                      }
                                    }
                                  }
                                  return next;
                                }
                              );
                            }}
                          >
                            Azzera
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))
        )
      ) : (
        matchesFp.length === 0 ? (
          <div className="base44-card">
            <div className="base44-card-inner" style={{ color: "#64748b" }}>Nessuna partita trovata.</div>
          </div>
        ) : (
          groupedFp.map((block) => (
            <div key={block.key} className="base44-card">
              <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>
                    {block.stage === "group" ? "Girone" : "Tabellone"} — {block.title}
                  </div>
                  <span className="base44-chip" style={{ padding: "2px 10px" }}>
                    Partite: {block.matches.length}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {block.matches.map((m) => {
                    const isSaving = !!savingByMatch[m.id];

                    if (scoring === "one_set") {
                      const d = draftOne[m.id] ?? { a: "", b: "" };

                      return (
                        <div
                          key={m.id}
                          style={{
                            border: "1px solid #e2e8f0",
                            borderRadius: 14,
                            padding: 12,
                            background: "#ffffff",
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <div style={{ fontWeight: 800, color: "#334155" }}>
                              {m.home_name} <span style={{ color: "#94a3b8" }}>vs</span> {m.away_name}
                            </div>
                            <div className="base44-chip" style={{ padding: "2px 10px" }}>
                              {(m.home_games ?? "-")} - {(m.away_games ?? "-")}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", color: "#64748b", fontWeight: 700 }}>
                            {m.court ? <span className="base44-chip" style={{ padding: "2px 10px" }}>Campo {m.court}</span> : null}
                            {m.starts_at ? <span className="base44-chip" style={{ padding: "2px 10px" }}>{new Date(m.starts_at).toLocaleString()}</span> : null}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <input
                              value={d.a}
                              onChange={(e) => {
                                const v = sanitizeScore(e.target.value);
                                setDraftOne((p) => ({ ...p, [m.id]: { ...(p[m.id] ?? d), a: v } }));
                              }}
                              inputMode="numeric"
                              placeholder=""
                              style={{ width: 70, padding: "10px 12px", borderRadius: 12, border: "1px solid #e2e8f0", outline: "none" }}
                            />

                            <div style={{ fontWeight: 900, color: "#94a3b8" }}>-</div>

                            <input
                              value={d.b}
                              onChange={(e) => {
                                const v = sanitizeScore(e.target.value);
                                setDraftOne((p) => ({ ...p, [m.id]: { ...(p[m.id] ?? d), b: v } }));
                              }}
                              inputMode="numeric"
                              placeholder=""
                              style={{ width: 70, padding: "10px 12px", borderRadius: 12, border: "1px solid #e2e8f0", outline: "none" }}
                            />

                            <button
                              className="base44-primary-btn"
                              disabled={isSaving}
                              style={{ padding: "10px 14px", borderRadius: 999, opacity: isSaving ? 0.7 : 1 }}
                              onClick={() => {
                                const h = toNumOrNull(d.a);
                                const a = toNumOrNull(d.b);
                                if (d.a.trim() && h == null) return toast.error("Score non valido");
                                if (d.b.trim() && a == null) return toast.error("Score non valido");

                                patchAnyMatch(
                                  m.id,
                                  m.patch_url,
                                  { homeGames: h, awayGames: a },
                                  (prev) => {
                                    const next = structuredClone(prev) as RunApiOk;
                                    const list = (next.matches_fp ?? []) as any[];
                                    for (const mm of list) {
                                      if (mm.id === m.id) {
                                        mm.home_games = h;
                                        mm.away_games = a;
                                        mm.set1_home_games = h;
                                        mm.set1_away_games = a;
                                      }
                                    }
                                    return next;
                                  }
                                );
                              }}
                            >
                              {isSaving ? "Salvataggio..." : "Salva"}
                            </button>

                            <button
                              className="base44-csv-btn"
                              disabled={isSaving}
                              style={{ padding: "10px 14px", borderRadius: 999 }}
                              onClick={() => {
                                setDraftOne((p) => ({ ...p, [m.id]: { a: "", b: "" } }));
                                patchAnyMatch(
                                  m.id,
                                  m.patch_url,
                                  { reset: true },
                                  (prev) => {
                                    const next = structuredClone(prev) as RunApiOk;
                                    const list = (next.matches_fp ?? []) as any[];
                                    for (const mm of list) {
                                      if (mm.id === m.id) {
                                        mm.home_games = null;
                                        mm.away_games = null;
                                        mm.set1_home_games = null;
                                        mm.set1_away_games = null;
                                        mm.set2_home_games = null;
                                        mm.set2_away_games = null;
                                        mm.set3_home_games = null;
                                        mm.set3_away_games = null;
                                        mm.home_sets = null;
                                        mm.away_sets = null;
                                      }
                                    }
                                    return next;
                                  }
                                );
                              }}
                            >
                              Azzera
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // best_of_3 UI
                    const d = draftBo3[m.id] ?? { s1h: "", s1a: "", s2h: "", s2a: "", s3h: "", s3a: "" };

                    const SetRow = (label: string, leftKey: keyof ScoreDraftBo3, rightKey: keyof ScoreDraftBo3) => (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div className="base44-chip" style={{ padding: "2px 10px", background: "#f8fafc" }}>{label}</div>

                        <input
                          value={d[leftKey]}
                          onChange={(e) => {
                            const v = sanitizeScore(e.target.value);
                            setDraftBo3((p) => ({ ...p, [m.id]: { ...(p[m.id] ?? d), [leftKey]: v } }));
                          }}
                          inputMode="numeric"
                          placeholder=""
                          style={{ width: 70, padding: "10px 12px", borderRadius: 12, border: "1px solid #e2e8f0", outline: "none" }}
                        />

                        <div style={{ fontWeight: 900, color: "#94a3b8" }}>-</div>

                        <input
                          value={d[rightKey]}
                          onChange={(e) => {
                            const v = sanitizeScore(e.target.value);
                            setDraftBo3((p) => ({ ...p, [m.id]: { ...(p[m.id] ?? d), [rightKey]: v } }));
                          }}
                          inputMode="numeric"
                          placeholder=""
                          style={{ width: 70, padding: "10px 12px", borderRadius: 12, border: "1px solid #e2e8f0", outline: "none" }}
                        />
                      </div>
                    );

                    return (
                      <div
                        key={m.id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 14,
                          padding: 12,
                          background: "#ffffff",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <div style={{ fontWeight: 800, color: "#334155" }}>
                            {m.home_name} <span style={{ color: "#94a3b8" }}>vs</span> {m.away_name}
                          </div>
                          <div className="base44-chip" style={{ padding: "2px 10px" }}>
                            Set: {(m.home_sets ?? "-")} - {(m.away_sets ?? "-")} • Games: {(m.home_games ?? "-")} - {(m.away_games ?? "-")}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", color: "#64748b", fontWeight: 700 }}>
                          {m.court ? <span className="base44-chip" style={{ padding: "2px 10px" }}>Campo {m.court}</span> : null}
                          {m.starts_at ? <span className="base44-chip" style={{ padding: "2px 10px" }}>{new Date(m.starts_at).toLocaleString()}</span> : null}
                        </div>

                        <div style={{ display: "grid", gap: 10 }}>
                          {SetRow("Set 1", "s1h", "s1a")}
                          {SetRow("Set 2", "s2h", "s2a")}
                          {SetRow("Set 3", "s3h", "s3a")}
                        </div>

                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 2 }}>
                          <button
                            className="base44-primary-btn"
                            disabled={isSaving}
                            style={{ padding: "10px 14px", borderRadius: 999, opacity: isSaving ? 0.7 : 1 }}
                            onClick={() => {
                              const s1h = toNumOrNull(d.s1h); const s1a = toNumOrNull(d.s1a);
                              const s2h = toNumOrNull(d.s2h); const s2a = toNumOrNull(d.s2a);
                              const s3h = toNumOrNull(d.s3h); const s3a = toNumOrNull(d.s3a);

                              patchAnyMatch(
                                m.id,
                                m.patch_url,
                                { set1Home: s1h, set1Away: s1a, set2Home: s2h, set2Away: s2a, set3Home: s3h, set3Away: s3a },
                                (prev) => prev
                              );
                            }}
                          >
                            {isSaving ? "Salvataggio..." : "Salva"}
                          </button>

                          <button
                            className="base44-csv-btn"
                            disabled={isSaving}
                            style={{ padding: "10px 14px", borderRadius: 999 }}
                            onClick={() => {
                              setDraftBo3((p) => ({ ...p, [m.id]: { s1h: "", s1a: "", s2h: "", s2a: "", s3h: "", s3a: "" } }));
                              patchAnyMatch(m.id, m.patch_url, { reset: true }, (prev) => prev);
                            }}
                          >
                            Azzera
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))
        )
      )}
    </div>
  );
}
