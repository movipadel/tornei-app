"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type RankingRow = {
  position: number;
  player_name: string;
  total_points: number;
  events_played: number;
};

type StageResult = {
  player_name: string;
  points: number;
  placement: number | null;
};

type Stage = {
  tournament_name: string;
  tournament_type: string;
  tournament_date: string | null;
  results: StageResult[];
};

type UpcomingStage = {
  id: string;
  name: string;
  date: string | null;
  time: string | null;
  location: string | null;
  registrations_open: boolean;
};

type RankingGroup = {
  id: string;
  category: string | null;
  level: string | null;
  ranking: RankingRow[];
  played_stages: Stage[];
  upcoming_stages: UpcomingStage[];
};

type ApiResponse = {
  circuit: {
    id?: string;
    name: string;
    slug?: string;
    tournament_type: string;
    status: string;
    hero_logo_url?: string | null;
    hero_logo_2_url?: string | null;
    hero_logo_3_url?: string | null;
    hero_subtitle?: string | null;
    theme_key?: string | null;
  } | null;
  ranking_groups: RankingGroup[];
};

type SectionView = "ranking" | "stages";

function formatGroupLabel(g: RankingGroup) {
  return [g.category, g.level].filter(Boolean).join(" / ");
}

function fmtDate(d?: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("it-IT");
}

function fmtTime(v?: string | null) {
  if (!v) return "";
  const s = String(v).trim();
  if (!s) return "";

  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;

  return d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function registrationsBadgeStyle(open: boolean): React.CSSProperties {
  if (open) {
    return {
      background: "#ecfdf5",
      border: "1px solid #bbf7d0",
      color: "#166534",
    };
  }

  return {
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
  };
}

function statusLabel(status?: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "active") return "Attivo";
  if (s === "draft") return "Bozza";
  if (s === "closed") return "Chiuso";
  return status || "-";
}

function getStatusStyles(status?: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "active") {
    return {
      background: "rgba(16,185,129,0.14)",
      border: "1px solid rgba(16,185,129,0.25)",
      color: "#065f46",
    };
  }
  if (s === "closed") {
    return {
      background: "rgba(148,163,184,0.16)",
      border: "1px solid rgba(148,163,184,0.28)",
      color: "#334155",
    };
  }
  return {
    background: "rgba(99,102,241,0.12)",
    border: "1px solid rgba(99,102,241,0.24)",
    color: "#3730a3",
  };
}

function getCircuitTheme(themeKey?: string | null) {
  const key = String(themeKey ?? "").trim().toLowerCase();

  if (key === "padelseries") {
    return {
      background:
        "linear-gradient(135deg, #04162b 0%, #0f3b68 45%, #0ea5e9 100%)",
      shadow: "0 24px 60px rgba(3, 105, 161, 0.28)",
    };
  }

  return {
    background:
      "linear-gradient(135deg, #0f172a 0%, #312e81 50%, #4f46e5 100%)",
    shadow: "0 24px 60px rgba(49,46,129,0.28)",
  };
}

function getCircuitSubtitle(circuit?: ApiResponse["circuit"]) {
  const custom = String(circuit?.hero_subtitle ?? "").trim();
  if (custom) return custom;
  return "Classifiche aggiornate • Risultati di tappa";
}

function placementLabel(n?: number | null) {
  if (n == null) return "—";
  return `${n}°`;
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text;

  const lower = text.toLowerCase();
  const q = query.toLowerCase().trim();
  const index = lower.indexOf(q);

  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + q.length);
  const after = text.slice(index + q.length);

  return (
    <>
      {before}
      <mark
        style={{
          background: "rgba(250,204,21,0.38)",
          color: "inherit",
          padding: "0 2px",
          borderRadius: 4,
        }}
      >
        {match}
      </mark>
      {after}
    </>
  );
}

function TrophyBadge({ position }: { position: number }) {
  if (position === 1) return <span style={{ fontSize: 16 }}>🥇</span>;
  if (position === 2) return <span style={{ fontSize: 16 }}>🥈</span>;
  if (position === 3) return <span style={{ fontSize: 16 }}>🥉</span>;
  return (
    <span
      style={{
        display: "inline-flex",
        width: 26,
        height: 26,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        color: "#475569",
        fontWeight: 800,
        fontSize: 12,
      }}
    >
      {position}
    </span>
  );
}

function PodiumCard({
  row,
  tone,
  search,
}: {
  row: RankingRow;
  tone: "gold" | "silver" | "bronze";
  search: string;
}) {
  const tones = {
    gold: {
      bg: "linear-gradient(135deg, rgba(250,204,21,0.18), rgba(255,255,255,1))",
      border: "1px solid rgba(250,204,21,0.38)",
      accent: "#a16207",
      icon: "🥇",
    },
    silver: {
      bg: "linear-gradient(135deg, rgba(226,232,240,0.95), rgba(255,255,255,1))",
      border: "1px solid rgba(148,163,184,0.35)",
      accent: "#475569",
      icon: "🥈",
    },
    bronze: {
      bg: "linear-gradient(135deg, rgba(251,146,60,0.14), rgba(255,255,255,1))",
      border: "1px solid rgba(251,146,60,0.28)",
      accent: "#9a3412",
      icon: "🥉",
    },
  };

  const t = tones[tone];

  return (
    <div
      style={{
        borderRadius: 20,
        border: t.border,
        background: t.bg,
        padding: 16,
        boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 22 }}>{t.icon}</div>
        <div
          style={{
            color: t.accent,
            fontWeight: 900,
            fontSize: 11,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Posizione {row.position}
        </div>
      </div>

      <div
        style={{
          fontWeight: 900,
          fontSize: 18,
          lineHeight: 1.1,
          color: "#0f172a",
        }}
      >
        {highlightMatch(row.player_name, search)}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            padding: "7px 10px",
            borderRadius: 999,
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            fontWeight: 800,
            color: "#0f172a",
            fontSize: 13,
          }}
        >
          {row.total_points} pt
        </span>
        <span
          style={{
            padding: "7px 10px",
            borderRadius: 999,
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            fontWeight: 800,
            color: "#475569",
            fontSize: 13,
          }}
        >
          {row.events_played} tappe
        </span>
      </div>
    </div>
  );
}

function CompactSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid #dbe3f0",
        background: "#ffffff",
        color: "#0f172a",
        fontWeight: 800,
        fontSize: 14,
        outline: "none",
        boxShadow: "0 6px 18px rgba(15,23,42,0.04)",
      }}
    >
      {children}
    </select>
  );
}

export default function CircuitPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params?.slug ?? "");
  const router = useRouter();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sectionView, setSectionView] = useState<SectionView>("ranking");

  useEffect(() => {
    if (!slug) return;

    fetch(`/api/circuits/${slug}`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));

        if (!r.ok) {
          throw new Error(json?.error || "Errore caricamento circuito");
        }

        return json;
      })
      .then((json) => {
        const groups = Array.isArray(json?.ranking_groups) ? json.ranking_groups : [];

        setData({
          circuit: json?.circuit ?? null,
          ranking_groups: groups,
        });

        if (groups.length > 0) {
          setSelectedGroupId(groups[0].id);
        } else {
          setSelectedGroupId(null);
        }
      })
      .catch((e) => {
        console.error(e);
        setData({
          circuit: null,
          ranking_groups: [],
        });
        setSelectedGroupId(null);
      });
  }, [slug]);

  const group = useMemo(() => {
    const groups = Array.isArray(data?.ranking_groups) ? data.ranking_groups : [];
    return groups.find((g) => g.id === selectedGroupId) ?? null;
  }, [data, selectedGroupId]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredRanking = useMemo(() => {
    if (!group) return [];
    if (!normalizedSearch) return group.ranking;
    return group.ranking.filter((r) =>
      r.player_name.toLowerCase().includes(normalizedSearch)
    );
  }, [group, normalizedSearch]);

  const filteredStages = useMemo(() => {
    if (!group) return [];
    if (!normalizedSearch) return group.played_stages;

    return group.played_stages
      .map((stage) => ({
        ...stage,
        results: stage.results.filter((r) =>
          r.player_name.toLowerCase().includes(normalizedSearch)
        ),
      }))
      .filter((stage) => stage.results.length > 0);
  }, [group, normalizedSearch]);

  const podium = filteredRanking.slice(0, 3);
  const upcomingStages = group?.upcoming_stages ?? [];

  if (!data) {
    return (
      <div style={{ padding: 20 }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "grid",
            gap: 16,
          }}
        >
          <div
            style={{
              borderRadius: 24,
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.10), rgba(255,255,255,1))",
              border: "1px solid #e2e8f0",
              padding: 24,
              fontWeight: 800,
              color: "#475569",
            }}
          >
            Caricamento circuito...
          </div>
        </div>
      </div>
    );
  }

  const circuit = data.circuit;

const circuitTheme = getCircuitTheme(circuit?.theme_key);
const circuitSubtitle = getCircuitSubtitle(circuit);
const heroLogo1 = circuit?.hero_logo_url ?? null;
const heroLogo2 = circuit?.hero_logo_2_url ?? null;
const heroLogo3 = circuit?.hero_logo_3_url ?? null;

  return (
    <div
      style={{
        padding: "16px 12px 24px",
        background:
          "linear-gradient(180deg, #eef2ff 0%, #f8fafc 260px, #f8fafc 100%)",
        minHeight: "100dvh",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >

        <div
  style={{
    display: "flex",
    justifyContent: "flex-start",
    marginBottom: -4,
  }}
>
  <button
    type="button"
    onClick={() => {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    }}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 14px",
      borderRadius: 999,
      border: "1px solid #dbe3f0",
      background: "rgba(255,255,255,0.85)",
      color: "#0f172a",
      fontWeight: 800,
      fontSize: 14,
      cursor: "pointer",
      boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
    }}
  >
    ← Torna ai tornei
  </button>
</div>
                <section
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 28,
            padding: 20,
            background: circuitTheme.background,
            color: "white",
            boxShadow: circuitTheme.shadow,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at top right, rgba(255,255,255,0.18), transparent 30%), radial-gradient(circle at bottom left, rgba(255,255,255,0.10), transparent 28%)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {(heroLogo1 || heroLogo2 || heroLogo3) ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {heroLogo1 ? (
                    <img
                      src={heroLogo1}
                      alt={circuit?.name ?? "Circuito"}
                      style={{
                        height: 44,
                        maxWidth: 180,
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  ) : null}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {heroLogo2 ? (
                    <img
                      src={heroLogo2}
                      alt="Logo secondario circuito"
                      style={{
                        height: 34,
                        maxWidth: 120,
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  ) : null}

                  {heroLogo3 ? (
                    <img
                      src={heroLogo3}
                      alt="Logo terziario circuito"
                      style={{
                        height: 34,
                        maxWidth: 120,
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  padding: "7px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                Circuito
              </span>

              <span
                style={{
                  padding: "7px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {circuit?.tournament_type}
              </span>

              <span
                style={{
                  ...getStatusStyles(circuit?.status),
                  padding: "7px 10px",
                  borderRadius: 999,
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {statusLabel(circuit?.status)}
              </span>
            </div>

            <div
              style={{
                fontSize: "clamp(28px, 7vw, 42px)",
                fontWeight: 900,
                lineHeight: 1.02,
                letterSpacing: -0.6,
                maxWidth: 760,
              }}
            >
              {circuit?.name}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 2,
              }}
            >
              <span
                style={{
                  background: "rgba(255,255,255,0.12)",
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {circuitSubtitle}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 4,
              }}
            >
              <div
                style={{
                  minWidth: 120,
                  borderRadius: 18,
                  padding: "12px 14px",
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.16)",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>
                  Classifiche
                </div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>
                  {data.ranking_groups.length}
                </div>
              </div>

              <div
                style={{
                  minWidth: 120,
                  borderRadius: 18,
                  padding: "12px 14px",
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.16)",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>
                  Tappe visibili
                </div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>
                  {group?.played_stages.length ?? 0}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            borderRadius: 24,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid #e2e8f0",
            boxShadow: "0 14px 40px rgba(15,23,42,0.05)",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 10,
            }}
          >
            <CompactSelect
              value={selectedGroupId ?? ""}
              onChange={(v) => {
                setSelectedGroupId(v || null);
                setOpenStage(null);
              }}
            >
              {(data.ranking_groups ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {formatGroupLabel(g)}
                </option>
              ))}
            </CompactSelect>

            <CompactSelect
              value={sectionView}
              onChange={(v) => setSectionView(v as SectionView)}
            >
              <option value="ranking">Classifica</option>
              <option value="stages">Tappe giocate</option>
            </CompactSelect>
          </div>
        </section>

                <section
          style={{
            borderRadius: 24,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid #e2e8f0",
            boxShadow: "0 14px 40px rgba(15,23,42,0.05)",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 900,
                fontSize: 20,
                color: "#0f172a",
              }}
            >
              Prossime tappe
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#64748b",
                marginTop: 4,
              }}
            >
              Tappe già programmate per questa classifica
            </div>
          </div>

          {upcomingStages.length === 0 ? (
            <div
              style={{
                padding: 16,
                borderRadius: 18,
                border: "1px dashed #cbd5e1",
                color: "#64748b",
                fontWeight: 700,
                background: "#f8fafc",
                fontSize: 13,
              }}
            >
              Nessuna tappa futura programmata.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              }}
            >
              {upcomingStages.map((stage) => (
                <div
                  key={stage.id}
                  style={{
                    borderRadius: 18,
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    padding: 14,
                    boxShadow: "0 8px 20px rgba(15,23,42,0.04)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 16,
                      color: "#0f172a",
                      lineHeight: 1.15,
                    }}
                  >
                    {stage.name}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {stage.date ? (
                      <span
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          color: "#475569",
                          fontWeight: 800,
                          fontSize: 12,
                        }}
                      >
                        {fmtDate(stage.date)}
                      </span>
                    ) : null}

                    {stage.time ? (
                      <span
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          color: "#475569",
                          fontWeight: 800,
                          fontSize: 12,
                        }}
                      >
                        {fmtTime(stage.time)}
                      </span>
                    ) : null}

                    <span
                      style={{
                        ...registrationsBadgeStyle(stage.registrations_open),
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      {stage.registrations_open ? "Iscrizioni aperte" : "Iscrizioni chiuse"}
                    </span>
                  </div>

                  {stage.location ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#64748b",
                        fontWeight: 700,
                        lineHeight: 1.35,
                      }}
                    >
                      📍 {stage.location}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {sectionView === "ranking" ? (
          <section
            style={{
              borderRadius: 24,
              background: "rgba(255,255,255,0.92)",
              border: "1px solid #e2e8f0",
              boxShadow: "0 14px 40px rgba(15,23,42,0.05)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 20,
                    color: "#0f172a",
                  }}
                >
                  Classifica
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#64748b",
                    marginTop: 4,
                  }}
                >
                  {group ? formatGroupLabel(group) : "-"}
                </div>
              </div>

              <div
                style={{
                  minWidth: 220,
                  flex: "1 1 260px",
                  maxWidth: 360,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    borderRadius: 14,
                    border: "1px solid #dbe3f0",
                    background: "#ffffff",
                    padding: "10px 12px",
                  }}
                >
                  <span style={{ fontSize: 15 }}>🔎</span>
                  <input
                    placeholder="Cerca giocatore..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      fontSize: 14,
                      color: "#0f172a",
                    }}
                  />
                  {search ? (
                    <button
                      onClick={() => setSearch("")}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontWeight: 800,
                        color: "#64748b",
                        fontSize: 12,
                      }}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {podium.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                }}
              >
                {podium[0] ? <PodiumCard row={podium[0]} tone="gold" search={search} /> : null}
                {podium[1] ? <PodiumCard row={podium[1]} tone="silver" search={search} /> : null}
                {podium[2] ? <PodiumCard row={podium[2]} tone="bronze" search={search} /> : null}
              </div>
            ) : null}

            <div
              style={{
                overflowX: "auto",
                borderRadius: 18,
                border: "1px solid #e2e8f0",
                background: "#ffffff",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                  minWidth: 0,
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ ...thCompact, width: 58 }}>Pos.</th>
                    <th style={thCompact}>Giocatore</th>
                    <th style={{ ...thCompactRight, width: 72 }}>Punti</th>
                    <th style={{ ...thCompactRight, width: 62 }}>Tappe</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRanking.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          padding: 18,
                          textAlign: "center",
                          color: "#64748b",
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        Nessun giocatore trovato.
                      </td>
                    </tr>
                  ) : (
                    filteredRanking.map((r) => (
                      <tr
                        key={`${r.position}-${r.player_name}`}
                        style={{
                          borderTop: "1px solid #eef2f7",
                          background:
                            normalizedSearch &&
                            r.player_name.toLowerCase().includes(normalizedSearch)
                              ? "rgba(250,204,21,0.08)"
                              : "transparent",
                        }}
                      >
                        <td style={tdCompact}>
                          <TrophyBadge position={r.position} />
                        </td>
                        <td
                          style={{
                            ...tdCompact,
                            fontWeight: 800,
                            color: "#0f172a",
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                          }}
                        >
                          {highlightMatch(r.player_name, search)}
                        </td>
                        <td style={tdCompactRight}>{r.total_points}</td>
                        <td style={tdCompactRight}>{r.events_played}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div
              style={{
                fontSize: 12,
                color: "#64748b",
                fontWeight: 700,
              }}
            >
              Totale giocatori visibili: {filteredRanking.length}
            </div>
          </section>
        ) : (
          <section
            style={{
              borderRadius: 24,
              background: "rgba(255,255,255,0.92)",
              border: "1px solid #e2e8f0",
              boxShadow: "0 14px 40px rgba(15,23,42,0.05)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 20,
                  color: "#0f172a",
                }}
              >
                Tappe giocate
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  marginTop: 4,
                }}
              >
                Risultati di tappa
              </div>
            </div>

            {filteredStages.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 18,
                  border: "1px dashed #cbd5e1",
                  color: "#64748b",
                  fontWeight: 700,
                  background: "#f8fafc",
                  fontSize: 13,
                }}
              >
                Nessuna tappa visibile per questa ricerca.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filteredStages.map((s, idx) => {
                  const key = `${s.tournament_name}-${s.tournament_date}-${idx}`;
                  const open = openStage === key;

                  return (
                    <div
                      key={key}
                      style={{
                        borderRadius: 20,
                        border: open ? "1px solid #c7d2fe" : "1px solid #e2e8f0",
                        background: open
                          ? "linear-gradient(180deg, rgba(238,242,255,0.7), #ffffff)"
                          : "#ffffff",
                        overflow: "hidden",
                        boxShadow: open
                          ? "0 18px 36px rgba(99,102,241,0.10)"
                          : "0 8px 22px rgba(15,23,42,0.03)",
                      }}
                    >
                      <button
                        onClick={() => setOpenStage(open ? null : key)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: "transparent",
                          padding: 16,
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 14,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: 16,
                              color: "#0f172a",
                              lineHeight: 1.12,
                            }}
                          >
                            {s.tournament_name}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              marginTop: 8,
                            }}
                          >
                            <span
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                background: "#eef2ff",
                                border: "1px solid #c7d2fe",
                                color: "#3730a3",
                                fontWeight: 800,
                                fontSize: 12,
                              }}
                            >
                              {s.tournament_type}
                            </span>

                            <span
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                color: "#475569",
                                fontWeight: 800,
                                fontSize: 12,
                              }}
                            >
                              {fmtDate(s.tournament_date)}
                            </span>

                            <span
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                color: "#475569",
                                fontWeight: 800,
                                fontSize: 12,
                              }}
                            >
                              {s.results.length} giocatori
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            flexShrink: 0,
                            width: 40,
                            height: 40,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 999,
                            background: open ? "#4f46e5" : "#f8fafc",
                            color: open ? "white" : "#475569",
                            border: open ? "1px solid #4f46e5" : "1px solid #e2e8f0",
                            fontSize: 18,
                            fontWeight: 900,
                          }}
                        >
                          {open ? "−" : "+"}
                        </div>
                      </button>

                      {open ? (
                        <div
                          style={{
                            padding: "0 16px 16px",
                          }}
                        >
                          <div
                            style={{
                              overflowX: "auto",
                              borderRadius: 16,
                              border: "1px solid #e2e8f0",
                              background: "#ffffff",
                            }}
                          >
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                tableLayout: "fixed",
                                minWidth: 0,
                              }}
                            >
                              <thead>
                                <tr style={{ background: "#f8fafc" }}>
                                  <th style={thCompact}>Giocatore</th>
                                  <th style={{ ...thCompactRight, width: 72 }}>Punti</th>
                                  <th style={{ ...thCompactRight, width: 78 }}>Pos.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.results.map((r, i) => {
                                  const match =
                                    normalizedSearch &&
                                    r.player_name.toLowerCase().includes(normalizedSearch);

                                  return (
                                    <tr
                                      key={`${r.player_name}-${i}`}
                                      style={{
                                        borderTop: "1px solid #eef2f7",
                                        background: match
                                          ? "rgba(250,204,21,0.08)"
                                          : "transparent",
                                      }}
                                    >
                                      <td
                                        style={{
                                          ...tdCompact,
                                          fontWeight: 800,
                                          color: "#0f172a",
                                          whiteSpace: "normal",
                                          wordBreak: "break-word",
                                        }}
                                      >
                                        {highlightMatch(r.player_name, search)}
                                      </td>
                                      <td style={tdCompactRight}>{r.points}</td>
                                      <td style={tdCompactRight}>
                                        {placementLabel(r.placement)}
                                      </td>
                                    </tr>
                                  );
                                })}
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
          </section>
        )}
      </div>
    </div>
  );
}

const thCompact: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  color: "#64748b",
  fontWeight: 800,
  fontSize: 11,
  whiteSpace: "nowrap",
};

const thCompactRight: React.CSSProperties = {
  ...thCompact,
  textAlign: "right",
};

const tdCompact: React.CSSProperties = {
  padding: "10px 10px",
  color: "#334155",
  fontSize: 13,
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

const tdCompactRight: React.CSSProperties = {
  ...tdCompact,
  textAlign: "right",
  fontWeight: 800,
  color: "#0f172a",
};