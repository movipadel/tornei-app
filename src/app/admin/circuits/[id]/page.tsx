"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Search,
  Trophy,
} from "lucide-react";

type CircuitInfo = {
  id: string;
  name: string;
  slug: string;
  tournament_type: string;
  status: string;
  created_at?: string;
  updated_at?: string;
};

type RankingEntry = {
  position: number;
  player_key: string;
  player_name: string;
  total_points: number;
  events_played: number;
};

type PlayedStageResult = {
  player_key: string;
  player_name: string;
  player_phone: string | null;
  points: number;
  placement: number | null;
};

type PlayedStage = {
  source_tournament_id: string | null;
  tournament_name: string;
  tournament_type: string;
  tournament_date: string | null;
  results: PlayedStageResult[];
};

type RankingGroup = {
  id: string;
  category: string;
  level: string;
  ranking: RankingEntry[];
  played_stages?: PlayedStage[];
};

function normalizeSearch(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export default function AdminCircuitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [circuitId, setCircuitId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [circuit, setCircuit] = useState<CircuitInfo | null>(null);
  const [groups, setGroups] = useState<RankingGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [openStageKeys, setOpenStageKeys] = useState<Record<string, boolean>>({});
  const [playerSearch, setPlayerSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { id } = await params;
      if (cancelled) return;
      setCircuitId(id);

      try {
        setLoading(true);

        const res = await fetch(`/api/admin/circuits/${id}/rankings`, {
          cache: "no-store",
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Errore caricamento circuito");

        if (!cancelled) {
          const nextCircuit = json.data?.circuit ?? null;
          const nextGroups = Array.isArray(json.data?.ranking_groups)
            ? json.data.ranking_groups
            : [];

          setCircuit(nextCircuit);
          setGroups(nextGroups);

          setSelectedGroupId((current) => {
            if (current && nextGroups.some((g: RankingGroup) => g.id === current)) {
              return current;
            }
            return nextGroups[0]?.id ?? "";
          });

          setOpenStageKeys({});
          setPlayerSearch("");
        }
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message ?? "Errore caricamento circuito");
          setCircuit(null);
          setGroups([]);
          setSelectedGroupId("");
          setOpenStageKeys({});
          setPlayerSearch("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [params]);

  function prettyStatus(status?: string) {
    const s = String(status ?? "").toLowerCase();
    if (s === "draft") return "Draft";
    if (s === "active") return "Attivo";
    if (s === "closed") return "Chiuso";
    return status || "-";
  }

  function levelLabel(level?: string) {
    const l = String(level ?? "").toLowerCase();
    if (l === "open") return "Open";
    if (!l) return "-";
    return l.charAt(0).toUpperCase() + l.slice(1);
  }

  function formatDate(value?: string | null) {
    if (!value) return "-";
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("it-IT");
  }

  function stageKey(groupId: string, stage: PlayedStage, index: number) {
    return `${groupId}__${stage.source_tournament_id ?? "stage"}__${index}`;
  }

  function toggleStage(key: string) {
    setOpenStageKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  const normalizedPlayerSearch = useMemo(
    () => normalizeSearch(playerSearch),
    [playerSearch]
  );

  const filteredRanking = useMemo(() => {
    if (!selectedGroup) return [];
    if (!normalizedPlayerSearch) return selectedGroup.ranking;

    return selectedGroup.ranking.filter((row) =>
      normalizeSearch(row.player_name).includes(normalizedPlayerSearch)
    );
  }, [selectedGroup, normalizedPlayerSearch]);

  const filteredPlayedStages = useMemo(() => {
    if (!selectedGroup?.played_stages) return [];
    if (!normalizedPlayerSearch) return selectedGroup.played_stages;

    return selectedGroup.played_stages
      .map((stage) => {
        const filteredResults = stage.results.filter((row) =>
          normalizeSearch(row.player_name).includes(normalizedPlayerSearch)
        );

        if (filteredResults.length === 0) return null;

        return {
          ...stage,
          results: filteredResults,
        };
      })
      .filter((stage): stage is PlayedStage => Boolean(stage));
  }, [selectedGroup, normalizedPlayerSearch]);

  const totalPlayersInSelectedGroup = selectedGroup?.ranking.length ?? 0;
  const visiblePlayersInRanking = filteredRanking.length;
  const totalStagesInSelectedGroup = selectedGroup?.played_stages?.length ?? 0;
  const visibleStages = filteredPlayedStages.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Link
            href="/admin/circuits"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "#475569",
              textDecoration: "none",
              fontWeight: 700,
              width: "fit-content",
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            Torna ai circuiti
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <GitBranch className="w-6 h-6" style={{ color: "#4f46e5" }} />
            <h1
              style={{
                fontSize: 32,
                lineHeight: 1.1,
                fontWeight: 900,
                margin: 0,
              }}
            >
              {loading ? "Caricamento..." : circuit?.name ?? "Circuito"}
            </h1>
          </div>

          {!loading && circuit ? (
            <div style={{ color: "#64748b", fontWeight: 700 }}>
              {circuit.tournament_type} · {prettyStatus(circuit.status)}
            </div>
          ) : null}
        </div>

        {!loading && circuitId ? (
          <Link
            href="/admin/circuits"
            className="base44-csv-btn"
            style={{ textDecoration: "none" }}
          >
            Lista circuiti
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            background: "white",
            padding: 20,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          Caricamento classifiche...
        </div>
      ) : !circuit ? (
        <div
          style={{
            border: "1px solid #fecaca",
            borderRadius: 16,
            background: "#fff1f2",
            padding: 20,
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          Circuito non trovato.
        </div>
      ) : (
        <>
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              background: "white",
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 12 }}>
              Classifiche del circuito
            </div>

            {groups.length === 0 ? (
              <div style={{ color: "#64748b", fontWeight: 700 }}>
                Nessuna classifica configurata.
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {groups.map((g) => {
                  const active = g.id === selectedGroupId;

                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setSelectedGroupId(g.id);
                        setPlayerSearch("");
                        setOpenStageKeys({});
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 14px",
                        borderRadius: 999,
                        border: active ? "1px solid #4f46e5" : "1px solid #e2e8f0",
                        background: active ? "#eef2ff" : "#f8fafc",
                        color: active ? "#312e81" : "#0f172a",
                        fontWeight: 900,
                        cursor: "pointer",
                        boxShadow: active ? "0 0 0 3px rgba(79,70,229,0.08)" : "none",
                      }}
                    >
                      {g.category} / {levelLabel(g.level)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!selectedGroup ? null : (
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                background: "white",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Trophy className="w-5 h-5" style={{ color: "#4f46e5" }} />
                <div style={{ fontWeight: 900 }}>
                  {selectedGroup.category} / {levelLabel(selectedGroup.level)}
                </div>
              </div>

              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    background: "#ffffff",
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>Ricerca giocatore</div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      border: "1px solid #cbd5e1",
                      borderRadius: 12,
                      padding: "10px 12px",
                      background: "white",
                    }}
                  >
                    <Search className="w-4 h-4" style={{ color: "#64748b", flexShrink: 0 }} />
                    <input
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      placeholder="Cerca per nome giocatore"
                      style={{
                        border: "none",
                        outline: "none",
                        width: "100%",
                        fontSize: 15,
                        color: "#0f172a",
                        background: "transparent",
                      }}
                    />
                    {playerSearch ? (
                      <button
                        type="button"
                        onClick={() => setPlayerSearch("")}
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          color: "#64748b",
                          fontWeight: 800,
                          padding: 0,
                        }}
                      >
                        Pulisci
                      </button>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      color: "#64748b",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    <span>
                      Giocatori visibili: {visiblePlayersInRanking} / {totalPlayersInSelectedGroup}
                    </span>
                    <span>·</span>
                    <span>
                      Tappe visibili: {visibleStages} / {totalStagesInSelectedGroup}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      fontWeight: 900,
                    }}
                  >
                    Classifica generale
                  </div>

                  {filteredRanking.length === 0 ? (
                    <div style={{ padding: 16, color: "#64748b", fontWeight: 700 }}>
                      Nessun giocatore trovato per questa ricerca.
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#ffffff" }}>
                            <th style={thStyle}>#</th>
                            <th style={thStyle}>Giocatore</th>
                            <th style={thStyle}>Punti</th>
                            <th style={thStyle}>Tappe</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRanking.map((row) => (
                            <tr
                              key={`${selectedGroup.id}-${row.player_key}`}
                              style={{ borderTop: "1px solid #e2e8f0" }}
                            >
                              <td style={tdStyle}>{row.position}</td>
                              <td style={tdStyleBold}>{row.player_name}</td>
                              <td style={tdStyle}>{row.total_points}</td>
                              <td style={tdStyle}>{row.events_played}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      fontWeight: 900,
                    }}
                  >
                    Tappe giocate
                  </div>

                  {filteredPlayedStages.length === 0 ? (
                    <div style={{ padding: 16, color: "#64748b", fontWeight: 700 }}>
                      {normalizedPlayerSearch
                        ? "Nessuna tappa contiene il giocatore cercato."
                        : "Nessuna tappa chiusa per questa classifica."}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {filteredPlayedStages.map((stage, index) => {
                        const key = stageKey(selectedGroup.id, stage, index);
                        const isOpen = normalizedPlayerSearch ? true : !!openStageKeys[key];

                        return (
                          <div
                            key={key}
                            style={{
                              borderTop: index === 0 ? "none" : "1px solid #e2e8f0",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (normalizedPlayerSearch) return;
                                toggleStage(key);
                              }}
                              style={{
                                width: "100%",
                                border: "none",
                                background: "white",
                                padding: "14px 16px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 12,
                                cursor: normalizedPlayerSearch ? "default" : "pointer",
                                textAlign: "left",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 12,
                                  minWidth: 0,
                                  flex: 1,
                                }}
                              >
                                {isOpen ? (
                                  <ChevronDown
                                    className="w-4 h-4"
                                    style={{ color: "#64748b", flexShrink: 0 }}
                                  />
                                ) : (
                                  <ChevronRight
                                    className="w-4 h-4"
                                    style={{ color: "#64748b", flexShrink: 0 }}
                                  />
                                )}

                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                    minWidth: 0,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 900,
                                      color: "#0f172a",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {stage.tournament_name}
                                  </div>

                                  <div
                                    style={{
                                      color: "#64748b",
                                      fontSize: 14,
                                      fontWeight: 700,
                                    }}
                                  >
                                    {stage.tournament_type} · {formatDate(stage.tournament_date)}
                                  </div>
                                </div>
                              </div>

                              <div
                                style={{
                                  color: "#64748b",
                                  fontWeight: 800,
                                  fontSize: 14,
                                  whiteSpace: "nowrap",
                                  flexShrink: 0,
                                }}
                              >
                                {stage.results.length}{" "}
                                {stage.results.length === 1 ? "giocatore" : "giocatori"}
                              </div>
                            </button>

                            {isOpen ? (
                              <div
                                style={{
                                  borderTop: "1px solid #e2e8f0",
                                  background: "#fcfdff",
                                }}
                              >
                                <div style={{ overflowX: "auto" }}>
                                  <table
                                    style={{
                                      width: "100%",
                                      borderCollapse: "collapse",
                                    }}
                                  >
                                    <thead>
                                      <tr>
                                        <th style={thStyle}>Giocatore</th>
                                        <th style={thStyle}>Punti</th>
                                        <th style={thStyle}>Piazzamento</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {stage.results.map((row) => (
                                        <tr
                                          key={`${key}-${row.player_key}`}
                                          style={{ borderTop: "1px solid #e2e8f0" }}
                                        >
                                          <td style={tdStyleBold}>{row.player_name}</td>
                                          <td style={tdStyle}>{row.points}</td>
                                          <td style={tdStyle}>{row.placement ?? "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: 13,
  color: "#64748b",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 15,
  color: "#0f172a",
  whiteSpace: "nowrap",
};

const tdStyleBold: React.CSSProperties = {
  ...tdStyle,
  fontWeight: 800,
};