"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trophy, Calendar, Save, RotateCcw, Table as TableIcon } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type FixedMatch = {
  id: string;
  stage: "group" | "bracket";
  group_id: string | null;
  round_label: string | null;

  home_pair_id: string;
  away_pair_id: string;

  home_name: string;
  away_name: string;

  court: number | null;
  starts_at: string | null;

  home_games: number | null;
  away_games: number | null;

  home_sets?: number | null;
  away_sets?: number | null;

  set1_home_games?: number | null;
  set1_away_games?: number | null;
  set2_home_games?: number | null;
  set2_away_games?: number | null;
  set3_home_games?: number | null;
  set3_away_games?: number | null;

  completed_at: string | null;

  patch_url: string;
};

type FixedGroup = { id: string; name: string; position: number };

function fmtDt(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function toLocalInputValue(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function parseIntOrEmpty(v: string) {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

export default function RunClientFixedPairs({ initialData }: { initialData: any }) {
  const scoring: "one_set" | "best_of_3" = String(initialData?.rules?.scoring ?? "one_set") as any;

  const groups: FixedGroup[] = (initialData?.fixed?.groups ?? []) as any[];
  const matches: FixedMatch[] = (initialData?.fixed?.matches ?? []) as any[];
  const standingsByGroup: Record<string, any[]> = (initialData?.fixed?.standingsByGroup ?? {}) as any;

  const [showStandings, setShowStandings] = useState(true);

  // stato editabile per match
  const [draft, setDraft] = useState<Record<string, Partial<FixedMatch>>>({});

  const matchesByGroup = useMemo(() => {
    const map = new Map<string, FixedMatch[]>();
    for (const m of matches.filter((x) => x.stage === "group")) {
      const gid = String(m.group_id ?? "");
      if (!gid) continue;
      const arr = map.get(gid) ?? [];
      arr.push(m);
      map.set(gid, arr);
    }
    // sort: starts_at, poi nome
    for (const [gid, arr] of map.entries()) {
      arr.sort((a, b) => {
        const ad = a.starts_at ?? "";
        const bd = b.starts_at ?? "";
        if (ad !== bd) return ad.localeCompare(bd);
        return `${a.home_name} vs ${a.away_name}`.localeCompare(`${b.home_name} vs ${b.away_name}`);
      });
      map.set(gid, arr);
    }
    return map;
  }, [matches]);

  function getValue(m: FixedMatch, key: keyof FixedMatch) {
    const d = draft[m.id];
    if (d && key in d) return (d as any)[key];
    return (m as any)[key];
  }

  function setField(matchId: string, patch: Partial<FixedMatch>) {
    setDraft((p) => ({ ...p, [matchId]: { ...(p[matchId] ?? {}), ...patch } }));
  }

  async function saveMatch(m: FixedMatch) {
    const d = draft[m.id] ?? {};
    const payload: any = {};

    // calendario
    payload.court = (d as any).court ?? m.court ?? null;
    payload.starts_at = (d as any).starts_at ?? m.starts_at ?? null;

    if (scoring === "one_set") {
      payload.home_games = (d as any).home_games ?? m.home_games ?? null;
      payload.away_games = (d as any).away_games ?? m.away_games ?? null;
    } else {
      payload.set1_home_games = (d as any).set1_home_games ?? (m as any).set1_home_games ?? null;
      payload.set1_away_games = (d as any).set1_away_games ?? (m as any).set1_away_games ?? null;
      payload.set2_home_games = (d as any).set2_home_games ?? (m as any).set2_home_games ?? null;
      payload.set2_away_games = (d as any).set2_away_games ?? (m as any).set2_away_games ?? null;
      payload.set3_home_games = (d as any).set3_home_games ?? (m as any).set3_home_games ?? null;
      payload.set3_away_games = (d as any).set3_away_games ?? (m as any).set3_away_games ?? null;
    }

    try {
      const res = await fetch(m.patch_url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore salvataggio");

      toast.success("Salvato");
      // dopo il salvataggio, togliamo il draft locale: la GET successiva lo riallineerà
      setDraft((p) => {
        const next = { ...p };
        delete next[m.id];
        return next;
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  function resetDraft(m: FixedMatch) {
    setDraft((p) => {
      const next = { ...p };
      delete next[m.id];
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header stile admin */}
      <div className="base44-card">
        <div className="base44-card-inner" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Trophy className="w-6 h-6" style={{ color: "#4f46e5" }} />
              <div style={{ fontWeight: 800, fontSize: 18 }}>Sviluppo torneo — Coppie fisse</div>
            </div>
            <div style={{ color: "#64748b", marginTop: 4 }}>
              Modalità punteggio: <b>{scoring === "best_of_3" ? "Al meglio dei 3 set" : "1 set"}</b>
            </div>
          </div>

          <button
            className="base44-csv-btn"
            onClick={() => setShowStandings((v) => !v)}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "10px 14px" }}
          >
            <TableIcon className="w-4 h-4" />
            {showStandings ? "Nascondi classifica" : "Mostra classifica"}
          </button>
        </div>
      </div>

      {/* Classifiche gironi */}
      {showStandings && groups.length > 0 && (
        <div className="base44-card">
          <div className="base44-card-inner">
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Classifiche gironi</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {groups.map((g) => {
                const rows = standingsByGroup[g.id] ?? [];
                return (
                  <div key={g.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden", background: "white" }}>
                    <div style={{ padding: "10px 12px", background: "#f8fafc", fontWeight: 800 }}>
                      {g.name}
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead>Coppia</TableHead>
                          <TableHead className="text-right">Pt</TableHead>
                          <TableHead className="text-right">GW</TableHead>
                          <TableHead className="text-right">GL</TableHead>
                          <TableHead className="text-right">DG</TableHead>
                          <TableHead className="text-right">V</TableHead>
                          <TableHead className="text-right">P</TableHead>
                          <TableHead className="text-right">Pg</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r: any) => (
                          <TableRow key={r.pair_id}>
                            <TableCell style={{ fontWeight: 700 }}>{r.name}</TableCell>
                            <TableCell className="text-right" style={{ fontWeight: 800 }}>{r.Pt}</TableCell>
                            <TableCell className="text-right">{r.GW}</TableCell>
                            <TableCell className="text-right">{r.GL}</TableCell>
                            <TableCell className="text-right">{r.DG}</TableCell>
                            <TableCell className="text-right">{r.V}</TableCell>
                            <TableCell className="text-right">{r.P}</TableCell>
                            <TableCell className="text-right">{r.Pg}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Calendario gironi */}
      {groups.map((g) => {
        const gm = matchesByGroup.get(g.id) ?? [];
        return (
          <div key={g.id} className="base44-card">
            <div className="base44-card-inner">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{g.name} — Calendario</div>
                <div style={{ color: "#64748b", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Calendar className="w-4 h-4" />
                  {gm.length} partite
                </div>
              </div>

              <div className="base44-divider" />

              {gm.length === 0 ? (
                <div style={{ color: "#64748b" }}>Nessuna partita trovata</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {gm.map((m) => {
                    const draftStarts = getValue(m, "starts_at") as any;
                    const draftCourt = getValue(m, "court") as any;

                    return (
                      <div
                        key={m.id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 14,
                          background: "white",
                          padding: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {/* top line: match */}
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 800 }}>
                            {m.home_name} <span style={{ color: "#94a3b8" }}>vs</span> {m.away_name}
                          </div>

                          <div style={{ color: m.completed_at ? "#15803d" : "#64748b", fontWeight: 700 }}>
                            {m.completed_at ? "Completato" : "Da giocare"}
                          </div>
                        </div>

                        {/* calendario: campo + orario */}
                        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10 }}>
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Campo</div>
                            <input
                              className="base44-input"
                              inputMode="numeric"
                              value={draftCourt ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                const n = v.trim() === "" ? null : Number(v);
                                setField(m.id, { court: Number.isFinite(n as any) ? (n as any) : null });
                              }}
                              placeholder="es. 1"
                            />
                          </div>

                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Orario</div>
                            <input
                              type="datetime-local"
                              className="base44-input"
                              value={toLocalInputValue(draftStarts ?? null)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setField(m.id, { starts_at: v ? v : null } as any);
                              }}
                            />
                            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>
                              Attuale: {fmtDt(m.starts_at) || "—"}
                            </div>
                          </div>
                        </div>

                        {/* risultati */}
                        <div style={{ borderTop: "1px solid #eef2f7", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ fontWeight: 800, color: "#334155" }}>Risultato</div>

                          {scoring === "one_set" ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 10, alignItems: "end" }}>
                              <div style={{ color: "#64748b", fontWeight: 700 }}>Games (1 set)</div>

                              <div>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>{m.home_name}</div>
                                <input
                                  className="base44-input"
                                  inputMode="numeric"
                                  value={(getValue(m, "home_games") as any) ?? ""}
                                  onChange={(e) => setField(m.id, { home_games: parseIntOrEmpty(e.target.value) } as any)}
                                  placeholder="0"
                                />
                              </div>

                              <div>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>{m.away_name}</div>
                                <input
                                  className="base44-input"
                                  inputMode="numeric"
                                  value={(getValue(m, "away_games") as any) ?? ""}
                                  onChange={(e) => setField(m.id, { away_games: parseIntOrEmpty(e.target.value) } as any)}
                                  placeholder="0"
                                />
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {[1, 2, 3].map((n) => {
                                const hk = `set${n}_home_games` as any;
                                const ak = `set${n}_away_games` as any;
                                return (
                                  <div key={n} style={{ display: "grid", gridTemplateColumns: "80px 1fr 90px 90px", gap: 10, alignItems: "end" }}>
                                    <div style={{ fontWeight: 800, color: "#475569" }}>Set {n}</div>
                                    <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
                                      inserisci games (es. 6–4)
                                    </div>

                                    <div>
                                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{m.home_name}</div>
                                      <input
                                        className="base44-input"
                                        inputMode="numeric"
                                        value={(getValue(m, hk) as any) ?? ""}
                                        onChange={(e) => setField(m.id, { [hk]: parseIntOrEmpty(e.target.value) } as any)}
                                        placeholder="0"
                                      />
                                    </div>

                                    <div>
                                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{m.away_name}</div>
                                      <input
                                        className="base44-input"
                                        inputMode="numeric"
                                        value={(getValue(m, ak) as any) ?? ""}
                                        onChange={(e) => setField(m.id, { [ak]: parseIntOrEmpty(e.target.value) } as any)}
                                        placeholder="0"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Azioni */}
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                            <button
                              className="base44-csv-btn"
                              onClick={() => resetDraft(m)}
                              style={{ borderRadius: 999, padding: "10px 14px", display: "inline-flex", alignItems: "center", gap: 8 }}
                            >
                              <RotateCcw className="w-4 h-4" />
                              Azzera
                            </button>

                            <button
                              className="base44-primary-btn"
                              onClick={() => saveMatch(m)}
                              style={{ borderRadius: 999, padding: "10px 14px", display: "inline-flex", alignItems: "center", gap: 8 }}
                            >
                              <Save className="w-4 h-4" />
                              Salva
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
