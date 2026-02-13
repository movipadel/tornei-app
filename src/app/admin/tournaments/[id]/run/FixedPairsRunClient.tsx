"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

/* ===========================
   TYPES
=========================== */

type DraftOneSet = { h: string; a: string };

type DraftBo3 = {
  s1h: string; s1a: string;
  s2h: string; s2a: string;
  s3h: string; s3a: string;
};

const EMPTY_BO3: DraftBo3 = {
  s1h: "", s1a: "",
  s2h: "", s2a: "",
  s3h: "", s3a: "",
};

type ApiMatchFpMaybeLegacy = {
  id: string;
  stage: "group" | "bracket";
  group_id: string | null;
  group_name?: string | null;
  round_label: string | null;

  // nuovo formato (in futuro)
  home?: { id: string; name: string };
  away?: { id: string; name: string };

  // legacy (come arriva ora dal GET)
  home_pair_id?: string | null;
  away_pair_id?: string | null;
  home_name?: string | null;
  away_name?: string | null;

  court: number | null;
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

  patch_url: string;
};

type FixedPairsRunApiOk = {
  tournamentId: string;
  runId: string | null;
  mode: "fixed_pairs";
  status: string | null;
  started_at: string | null;
  rules: {
    scoring?: "one_set" | "best_of_3";
    format?: string;
    courtsCount?: number;
    qualifiersCount?: number | null;
  } | null;

  groups: Array<{
    id: string;
    name: string;
    position: number;
    pairs: Array<{ id: string; name: string }>;
  }>;

  matches_fp: ApiMatchFpMaybeLegacy[];

  standingsByGroup: Record<
    string,
    Array<{
      pairId: string;
      name: string;
      pt: number;
      gw: number;
      gl: number;
      dg: number;
      played: number;
      wins: number;
      losses: number;
    }>
  >;
};

type UiMatch = {
  id: string;
  stage: "group" | "bracket";
  group_id: string | null;
  round_label: string | null;
  home: { id: string; name: string };
  away: { id: string; name: string };
  court: number | null;
  starts_at: string | null;
  completed_at: string | null;
  home_games: number | null;
  away_games: number | null;
  sets: ApiMatchFpMaybeLegacy["sets"];
  patch_url: string;
};

/* ===========================
   UI HELPERS
=========================== */
function bracketRoundStyle(round: string) {
  const v = String(round ?? "").toLowerCase();

  if (v.includes("quarti")) return { bg: "#f8fafc", border: "#e2e8f0" };
  if (v.includes("semif")) return { bg: "#fff7ed", border: "#fed7aa" };
  if (v.includes("finale")) return { bg: "#f0fdf4", border: "#bbf7d0" };

  return { bg: "#ffffff", border: "#e2e8f0" };
}


function bracketRoundOrder(label?: string | null) {
  const v = String(label ?? "").toLowerCase();

  if (v.includes("sedicesimi")) return 0;
  if (v.includes("ottavi")) return 1;
  if (v.includes("quarti")) return 2;
  if (v.includes("semif")) return 3;
  if (v.includes("finale")) return 4;

  return 99; // fallback
}


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

function fmtTimeOnly(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function ensureHomeAway(m: ApiMatchFpMaybeLegacy): UiMatch {
  const home = m.home ?? { id: String(m.home_pair_id ?? ""), name: String(m.home_name ?? "-") };
  const away = m.away ?? { id: String(m.away_pair_id ?? ""), name: String(m.away_name ?? "-") };

  return {
    id: String(m.id),
    stage: m.stage,
    group_id: m.group_id ?? null,
    round_label: m.round_label ?? null,
    home,
    away,
    court: m.court ?? null,
    starts_at: m.starts_at ?? null,
    completed_at: m.completed_at ?? null,
    home_games: m.home_games ?? null,
    away_games: m.away_games ?? null,
    sets: m.sets ?? null,
    patch_url: String(m.patch_url ?? ""),
  };
}

function matchHasScore(scoring: "one_set" | "best_of_3", m: UiMatch) {
  if (scoring === "one_set") {
    return m.home_games !== null && m.away_games !== null;
  }
  const s = m.sets;
  if (!s) return false;

  return (
    s.set1.home !== null || s.set1.away !== null ||
    s.set2.home !== null || s.set2.away !== null ||
    s.set3.home !== null || s.set3.away !== null
  );
}

function draftHasSomethingOneSet(d: DraftOneSet) {
  return d.h.trim() !== "" || d.a.trim() !== "";
}

function draftHasSomethingBo3(d: DraftBo3) {
  return (
    d.s1h.trim() !== "" || d.s1a.trim() !== "" ||
    d.s2h.trim() !== "" || d.s2a.trim() !== "" ||
    d.s3h.trim() !== "" || d.s3a.trim() !== ""
  );
}

function toN(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

/* ===========================
   MAIN
=========================== */

type SavingMap = Record<string, boolean>;

export default function FixedPairsRunClient({
  initialData,
  tournamentName,
}: {
  initialData: FixedPairsRunApiOk;
  tournamentName?: string;
}) {

  const router = useRouter();

  const [data, setData] = useState<FixedPairsRunApiOk>(initialData);
  const [savingByMatch, setSavingByMatch] = useState<SavingMap>({});
  const [showStandings, setShowStandings] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [generatingBracket, setGeneratingBracket] = useState(false);


  const scoring = (data.rules?.scoring ?? "best_of_3") as "one_set" | "best_of_3";

  // ✅ normalizza match (supporta legacy e nuovo)
  const matches: UiMatch[] = useMemo(() => {
    const raw = (data.matches_fp ?? []) as ApiMatchFpMaybeLegacy[];
    return raw.map(ensureHomeAway);
  }, [data.matches_fp]);

  const hasAnyMatch = matches.length > 0;

  const groupMatchesByGroupId = useMemo(() => {
    const map = new Map<string, UiMatch[]>();
    for (const mt of matches) {
      if (mt.stage !== "group") continue;
      const gid = mt.group_id ?? "no_group";
      const arr = map.get(gid) ?? [];
      arr.push(mt);
      map.set(gid, arr);
    }
    for (const [gid, arr] of map.entries()) {
      arr.sort(
        (a, b) =>
          (a.starts_at ?? "").localeCompare(b.starts_at ?? "") ||
          (a.round_label ?? "").localeCompare(b.round_label ?? "")
      );
      map.set(gid, arr);
    }
    return map;
  }, [matches]);

  const bracketGroups = useMemo(() => {
    const byRound = new Map<string, UiMatch[]>();
    for (const mt of matches) {
      if (mt.stage !== "bracket") continue;
      const key = String(mt.round_label ?? "Tabellone");
      const arr = byRound.get(key) ?? [];
      arr.push(mt);
      byRound.set(key, arr);
    }
    const out = Array.from(byRound.entries()).map(([round, ms]) => {
      ms.sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
      return { round, matches: ms };
    });
    out.sort((a, b) => bracketRoundOrder(a.round) - bracketRoundOrder(b.round));
    return out;
  }, [matches]);

  const format = String(data.rules?.format ?? "");
const canHaveBracket = format === "groups_and_bracket";
const isRunning = String(data.status ?? "").toLowerCase() === "running";

const hasBracketAlready = useMemo(() => {
  return matches.some((m) => m.stage === "bracket");
}, [matches]);

const allGroupCompleted = useMemo(() => {
  const groupsOnly = matches.filter((m) => m.stage === "group");
  if (groupsOnly.length === 0) return false;
  return groupsOnly.every((m) => m.completed_at != null);
}, [matches]);

const canGenerateBracket =
  canHaveBracket &&
  isRunning &&
  allGroupCompleted &&
  !hasBracketAlready;


  // drafts
  const [draftOneSet, setDraftOneSet] = useState<Record<string, DraftOneSet>>({});
  const [draftBo3, setDraftBo3] = useState<Record<string, DraftBo3>>({});

  // ✅ (2) sincronizza SEMPRE i draft col server: quando torni nella pagina, vedi i punteggi
  // ✅ e dopo ogni reload, i draft riflettono il DB
  useEffect(() => {
    setDraftOneSet((prev) => {
      const next = { ...prev };
      for (const m of matches) {
        next[m.id] = {
          h: m.home_games == null ? "" : String(m.home_games),
          a: m.away_games == null ? "" : String(m.away_games),
        };
      }
      return next;
    });

    setDraftBo3((prev) => {
      const next = { ...prev };
      for (const m of matches) {
        const s = m.sets;
        next[m.id] = {
          s1h: s?.set1?.home == null ? "" : String(s.set1.home),
          s1a: s?.set1?.away == null ? "" : String(s.set1.away),
          s2h: s?.set2?.home == null ? "" : String(s.set2.home),
          s2a: s?.set2?.away == null ? "" : String(s.set2.away),
          s3h: s?.set3?.home == null ? "" : String(s.set3.home),
          s3a: s?.set3?.away == null ? "" : String(s.set3.away),
        };
      }
      return next;
    });
  }, [matches]);

  async function reloadFromServer() {
    if (!data.tournamentId) return;

    // ✅ (4) salva scroll
    const y = typeof window !== "undefined" ? window.scrollY : 0;

    setReloading(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${data.tournamentId}/run`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore ricarica");

      setData(json as FixedPairsRunApiOk);

      // ✅ (4) ripristina scroll dopo re-render
      requestAnimationFrame(() => window.scrollTo({ top: y }));
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setReloading(false);
    }
  }

async function generateBracket() {
  if (!data.tournamentId) return;
  setGeneratingBracket(true);
  try {
    const res = await fetch(`/api/admin/tournaments/${data.tournamentId}/run/bracket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Errore generazione tabellone");

    if (json.alreadyGenerated) {
      toast.message("Tabellone già generato");
    } else {
      toast.success("Tabellone generato");
    }

    await reloadFromServer();
  } catch (e: any) {
    toast.error(e?.message ?? "Errore");
  } finally {
    setGeneratingBracket(false);
  }
}


  async function patchMatch(matchId: string, patchUrl: string, body: any) {
    setSavingByMatch((p) => ({ ...p, [matchId]: true }));
    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore salvataggio");

      await reloadFromServer();

requestAnimationFrame(() => {
  toast.success("Risultato salvato");
});

    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSavingByMatch((p) => ({ ...p, [matchId]: false }));
    }
  }

  function Btn({
    variant,
    disabled,
    children,
    onClick,
  }: {
    variant: "primary" | "secondary";
    disabled: boolean;
    children: React.ReactNode;
    onClick: () => void;
  }) {
    const className = variant === "primary" ? "base44-primary-btn" : "base44-csv-btn";
    return (
      <button
        className={className}
        disabled={disabled}
        style={{
          padding: "10px 14px",
          borderRadius: 999,
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onClick={disabled ? undefined : onClick}
      >
        {children}
      </button>
    );
  }

  function preserveScroll(fn: () => void) {
  const y = window.scrollY;
  fn();
  requestAnimationFrame(() => {
    window.scrollTo({ top: y });
  });
}


  function MatchCard({ m }: { m: UiMatch }) {
  const isSaving = !!savingByMatch[m.id];

  const saved = matchHasScore(scoring, m);

  const d1 = draftOneSet[m.id] ?? { h: "", a: "" };
  const d3 = draftBo3[m.id] ?? EMPTY_BO3;

  const canSave =
    !saved && (scoring === "one_set" ? draftHasSomethingOneSet(d1) : draftHasSomethingBo3(d3));

  const canReset = saved;

  const inputStyle: React.CSSProperties = {
    width: 48,
    minWidth: 48,
    padding: "7px 8px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    outline: "none",
    textAlign: "center",
    fontWeight: 800,
  };

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: 12,
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        textAlign: "center",
      }}
    >
      {/* TOP ROW: label + campo/ora */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 800, color: "#334155" }}>{m.stage === "group" ? "Girone" : ""}</div>

        {m.stage === "group" && (
          <div className="base44-chip" style={{ padding: "2px 10px" }}>
            {m.court ? `Campo ${m.court}` : "Campo -"} · {fmtTimeOnly(m.starts_at)}
          </div>
        )}
      </div>

      {/* HOME / VS / AWAY centrati */}
      <div
        style={{
          display: "grid",
          gap: 6,
          justifyItems: "center",
        }}
      >
        <div style={{ fontWeight: 900, color: "#0f172a" }}>{m.home?.name ?? "-"}</div>
        <div style={{ color: "#94a3b8", fontWeight: 900 }}>VS</div>
        <div style={{ fontWeight: 900, color: "#0f172a" }}>{m.away?.name ?? "-"}</div>
      </div>

      {/* SCORE */}
      {scoring === "one_set" ? (
        <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
          {/* riga input */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              flexWrap: "nowrap",
              whiteSpace: "nowrap",
            }}
          >
            <input
              value={d1.h}
              onChange={(e) => {
                const v = sanitizeScore(e.target.value);
                preserveScroll(() => {
                  setDraftOneSet((p) => ({
                    ...p,
                    [m.id]: { ...(p[m.id] ?? { h: "", a: "" }), h: v },
                  }));
                });
              }}
              inputMode="numeric"
              placeholder=""
              style={inputStyle}
            />

            <div style={{ fontWeight: 900, color: "#94a3b8" }}>-</div>

            <input
              value={d1.a}
              onChange={(e) => {
                const v = sanitizeScore(e.target.value);
                preserveScroll(() => {
                  setDraftOneSet((p) => ({
                    ...p,
                    [m.id]: { ...(p[m.id] ?? { h: "", a: "" }), a: v },
                  }));
                });
              }}
              inputMode="numeric"
              placeholder=""
              style={inputStyle}
            />
          </div>

          {/* bottoni */}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Btn
              variant="primary"
              disabled={isSaving || !canSave}
              onClick={() => patchMatch(m.id, m.patch_url, { homeGames: toN(d1.h), awayGames: toN(d1.a) })}
            >
              {isSaving ? "Salvataggio..." : "Salva"}
            </Btn>

            <Btn variant="secondary" disabled={isSaving || !canReset} onClick={() => patchMatch(m.id, m.patch_url, { reset: true })}>
              Azzera
            </Btn>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {/* SETS */}
          {(["1", "2", "3"] as const).map((sn) => {
            const hKey = `s${sn}h` as keyof DraftBo3;
            const aKey = `s${sn}a` as keyof DraftBo3;

            return (
              <div key={sn} style={{ display: "grid", gap: 6, justifyItems: "center" }}>
                {/* Set label centrata */}
                <div className="base44-chip" style={{ padding: "2px 12px", background: "#f8fafc", fontWeight: 800 }}>
                  Set {sn}
                </div>

                {/* input in riga */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    flexWrap: "nowrap",
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    value={d3[hKey]}
                    onChange={(e) => {
                      const v = sanitizeScore(e.target.value);
                      preserveScroll(() => {
                        setDraftBo3((p) => ({
                          ...p,
                          [m.id]: { ...(p[m.id] ?? EMPTY_BO3), [hKey]: v },
                        }));
                      });
                    }}
                    inputMode="numeric"
                    placeholder=""
                    style={inputStyle}
                  />

                  <div style={{ fontWeight: 900, color: "#94a3b8" }}>-</div>

                  <input
                    value={d3[aKey]}
                    onChange={(e) => {
                      const v = sanitizeScore(e.target.value);
                      preserveScroll(() => {
                        setDraftBo3((p) => ({
                          ...p,
                          [m.id]: { ...(p[m.id] ?? EMPTY_BO3), [aKey]: v },
                        }));
                      });
                    }}
                    inputMode="numeric"
                    placeholder=""
                    style={inputStyle}
                  />
                </div>
              </div>
            );
          })}

          {/* bottoni */}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Btn
              variant="primary"
              disabled={isSaving || !canSave}
              onClick={() => {
                const payload = {
                  set1Home: toN(d3.s1h),
                  set1Away: toN(d3.s1a),
                  set2Home: toN(d3.s2h),
                  set2Away: toN(d3.s2a),
                  set3Home: toN(d3.s3h),
                  set3Away: toN(d3.s3a),
                };
                patchMatch(m.id, m.patch_url, payload);
              }}
            >
              {isSaving ? "Salvataggio..." : "Salva"}
            </Btn>

            <Btn variant="secondary" disabled={isSaving || !canReset} onClick={() => patchMatch(m.id, m.patch_url, { reset: true })}>
              Azzera
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}



  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div className="base44-card">
        <div
          className="base44-card-inner"
          style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#0f172a" }}>
  {tournamentName ?? "Sviluppo torneo — Coppie fisse"}
</div>

            <div style={{ color: "#64748b", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="base44-chip" style={{ ...statusChipStyle(data.status), padding: "2px 10px" }}>
                {statusLabel(data.status)}
              </span>
              <span className="base44-chip" style={{ padding: "2px 10px" }}>
                Punteggio: <b>{scoring === "one_set" ? "1 set" : "Best of 3"}</b>
              </span>
            </div>
          </div>

<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
  {canGenerateBracket && (
    <button
      className="base44-primary-btn"
      disabled={generatingBracket || reloading}
      onClick={() => generateBracket()}
      style={{
        padding: "10px 14px",
        borderRadius: 999,
        opacity: generatingBracket || reloading ? 0.45 : 1,
        cursor: generatingBracket || reloading ? "not-allowed" : "pointer",
      }}
    >
      {generatingBracket ? "Generazione..." : "Genera tabellone finale"}
    </button>
  )}

  <button
    className="base44-csv-btn"
    onClick={() => setShowStandings((v) => !v)}
    style={{ padding: "10px 14px", borderRadius: 999 }}
  >
    {showStandings ? "Nascondi classifica" : "Mostra classifica"}
  </button>

  <a
    className="base44-csv-btn"
    href="/admin/tournaments"
    style={{ padding: "10px 14px", borderRadius: 999 }}
  >
    ← Tornei
            </a>
          </div>
        </div>
      </div>

      {!hasAnyMatch && (
        <div className="base44-card">
          <div className="base44-card-inner" style={{ color: "#64748b" }}>
            Nessuna partita trovata in questa run.
          </div>
        </div>
      )}

      {/* GIRONI */}
      <div className="base44-card">
        <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontWeight: 900, color: "#0f172a" }}>Gironi</div>

          {data.groups.length === 0 ? (
            <div style={{ color: "#64748b" }}>Nessun girone salvato (forse formato “solo tabellone”).</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {data.groups.map((g) => {
                const standings = data.standingsByGroup?.[g.id] ?? [];
                const ms = groupMatchesByGroupId.get(g.id) ?? [];

                return (
                  <div key={g.id} style={{ border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden", background: "#fff" }}>
                    <div
                      style={{
                        padding: 14,
                        background: "#f8fafc",
                        borderBottom: "1px solid #e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: "#0f172a" }}>{g.name}</div>
                      <div className="base44-chip" style={{ padding: "2px 10px" }}>
                        Coppie: <b>{g.pairs.length}</b> · Partite: <b>{ms.length}</b>
                      </div>
                    </div>

                    <div style={{ padding: 14, display: "grid", gap: 14 }}>
                      {/* Classifica girone */}
{showStandings && (
  <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
    <div
      style={{
        padding: 10,
        background: "#fff",
        borderBottom: "1px solid #e2e8f0",
        fontWeight: 800,
        color: "#334155",
      }}
    >
      Classifica
    </div>

    {standings.length === 0 ? (
      <div style={{ padding: 12, color: "#64748b" }}>Nessun risultato inserito.</div>
    ) : (
      <div
        style={{
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ fontSize: 13 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              minWidth: 520,
            }}
          >
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
              {standings.map((r, idx) => (
                <tr key={r.pairId}>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", color: "#64748b", fontWeight: 700 }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#475569" }}>
                    {r.name}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.pt}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right", fontWeight: 900 }}>{r.gw}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.gl}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.dg}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", textAlign: "right" }}>{r.played}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ padding: 10, color: "#64748b", fontSize: 12 }}>
            Tie-break: Pt, GW, GL, DG.
          </div>
        </div>
      </div>
    )}
  </div>
)}


                      {/* Partite girone */}
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontWeight: 800, color: "#334155" }}>Partite</div>
                        {ms.length === 0 ? (
                          <div style={{ color: "#64748b" }}>Nessuna partita in questo girone.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 12 }}>
                            {ms.map((m) => (
                              <MatchCard key={m.id} m={m} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* TABELLONE */}
      <div className="base44-card">
        <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontWeight: 900, color: "#0f172a" }}>Tabellone</div>

          {bracketGroups.length === 0 ? (
            <div style={{ color: "#64748b" }}>Nessuna partita tabellone salvata.</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {bracketGroups.map((rg) => {
  const st = bracketRoundStyle(rg.round);
  return (
    <div
      key={rg.round}
      style={{
        border: `1px solid ${st.border}`,
        borderRadius: 16,
        padding: 14,
        background: st.bg,
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 10, color: "#0f172a" }}>{rg.round}</div>
      <div style={{ display: "grid", gap: 12 }}>
        {rg.matches.map((m) => (
          <MatchCard key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
})}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
