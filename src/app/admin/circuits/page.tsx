"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CircuitBoard,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import CircuitDialog from "./_components/CircuitDialog";

type Circuit = {
  id: string;
  name: string;
  slug: string;
  tournament_type: string;
  status: string;
};

type PossibleDuplicate = {
  normalized_name: string;
  names: string[];
  player_keys: string[];
  player_phones: string[];
};

type RankingGroupWithDuplicates = {
  id: string;
  category: string | null;
  level: string | null;
  possible_duplicates?: PossibleDuplicate[];
};

type CircuitDuplicateSummary = {
  circuitId: string;
  total: number;
  groups: Array<{
    id: string;
    category: string | null;
    level: string | null;
    duplicates: PossibleDuplicate[];
  }>;
};

function statusLabel(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "active") return "Attivo";
  if (s === "draft") return "Bozza";
  if (s === "closed") return "Chiuso";
  return status || "-";
}

function statusStyle(status: string): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "active") {
    return {
      background: "rgba(34,197,94,0.13)",
      border: "1px solid rgba(34,197,94,0.24)",
      color: "#86efac",
    };
  }

  if (s === "closed") {
    return {
      background: "rgba(148,163,184,0.13)",
      border: "1px solid rgba(148,163,184,0.22)",
      color: "#cbd5e1",
    };
  }

  return {
    background: "rgba(251,191,36,0.13)",
    border: "1px solid rgba(251,191,36,0.24)",
    color: "#fbbf24",
  };
}

function groupLabel(group: { category: string | null; level: string | null }) {
  return [group.category, group.level].filter(Boolean).join(" / ") || "Classifica";
}

export default function CircuitsPage() {
  const [data, setData] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [duplicatesByCircuit, setDuplicatesByCircuit] = useState<
    Record<string, CircuitDuplicateSummary>
  >({});

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Circuit | null>(null);

  async function load() {
    try {
      setLoading(true);

      const res = await fetch("/api/admin/circuits", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore caricamento circuiti");
      }

      const circuits = (json.data || []) as Circuit[];
      setData(circuits);
      await loadDuplicateSummaries(circuits);
    } catch (e: any) {
      toast.error(e?.message || "Errore caricamento circuiti");
    } finally {
      setLoading(false);
    }
  }

  async function loadDuplicateSummaries(circuits: Circuit[]) {
    if (!circuits.length) {
      setDuplicatesByCircuit({});
      return;
    }

    try {
      setDuplicatesLoading(true);

      const entries = await Promise.all(
        circuits.map(async (c) => {
          try {
            const res = await fetch(`/api/admin/circuits/${c.id}/rankings`, {
              cache: "no-store",
            });
            const json = await res.json().catch(() => ({}));

            if (!res.ok) return [c.id, null] as const;

            const groups = ((json.data?.ranking_groups ?? []) as RankingGroupWithDuplicates[])
              .map((g) => ({
                id: g.id,
                category: g.category,
                level: g.level,
                duplicates: g.possible_duplicates ?? [],
              }))
              .filter((g) => g.duplicates.length > 0);

            const total = groups.reduce((sum, g) => sum + g.duplicates.length, 0);

            return [
              c.id,
              {
                circuitId: c.id,
                total,
                groups,
              },
            ] as const;
          } catch {
            return [c.id, null] as const;
          }
        })
      );

      const next: Record<string, CircuitDuplicateSummary> = {};
      for (const [id, summary] of entries) {
        if (summary) next[id] = summary;
      }

      setDuplicatesByCircuit(next);
    } finally {
      setDuplicatesLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totalDuplicates = useMemo(() => {
    return Object.values(duplicatesByCircuit).reduce(
      (sum, item) => sum + item.total,
      0
    );
  }, [duplicatesByCircuit]);

    async function mergePlayerKeys({
    circuitId,
    rankingGroupId,
    correctKey,
    wrongKeys,
    playerName,
    playerPhone,
  }: {
    circuitId: string;
    rankingGroupId: string;
    correctKey: string;
    wrongKeys: string[];
    playerName: string;
    playerPhone?: string | null;
  }) {
    if (!confirm(`Unire le key duplicate su ${playerName}?`)) return;

    try {
      const res = await fetch(`/api/admin/circuits/${circuitId}/merge-player-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ranking_group_id: rankingGroupId,
          correct_player_key: correctKey,
          wrong_player_keys: wrongKeys,
          player_name: playerName,
          player_phone: playerPhone ?? null,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore unione giocatore");
      }

      toast.success("Giocatore unificato");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Errore unione giocatore");
    }
  }

  async function remove(id: string) {
    if (!confirm("Eliminare completamente il circuito?")) return;

    try {
      const res = await fetch(`/api/admin/circuits/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore eliminazione");
      }

      toast.success("Circuito eliminato");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Errore eliminazione");
    }
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1180, margin: "0 auto", color: "white" }}>
        <header style={headerStyle}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CircuitBoard className="w-7 h-7" style={{ color: "#f59e0b" }} />
              <h1 style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.9 }}>
                Circuiti
              </h1>
            </div>
            <p style={muted}>
              Gestisci circuiti, classifiche e controlli qualità sui giocatori.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            style={primaryButton}
          >
            <Plus className="w-4 h-4" />
            Nuovo circuito
          </button>
        </header>

        <section style={kpiGrid}>
          <Kpi icon={<CircuitBoard />} label="Circuiti" value={data.length} />
          <Kpi
            icon={<BarChart3 />}
            label="Attivi"
            value={data.filter((c) => c.status === "active").length}
            tone="#86efac"
          />
          <Kpi
            icon={<AlertTriangle />}
            label="Alert duplicati"
            value={duplicatesLoading ? "..." : totalDuplicates}
            tone={totalDuplicates > 0 ? "#fbbf24" : "#93c5fd"}
          />
        </section>

        {totalDuplicates > 0 ? (
          <section style={alertCard}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <AlertTriangle className="w-5 h-5" style={{ color: "#fbbf24", flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 950, fontSize: 16 }}>
                  Possibili giocatori duplicati rilevati
                </div>
                <div style={{ ...muted, marginTop: 4 }}>
                  Stesso nome/cognome con chiavi telefono diverse nello stesso circuito.
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {loading ? (
            <div style={{ ...cardStyle, textAlign: "center", padding: 44 }}>
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#fbbf24" }} />
            </div>
          ) : data.length === 0 ? (
            <div style={emptyCard}>Nessun circuito creato.</div>
          ) : (
            data.map((c) => {
              const duplicateSummary = duplicatesByCircuit[c.id];
              const hasDuplicates = Boolean(duplicateSummary?.total);

              return (
                <div key={c.id} style={cardStyle}>
                  <div style={circuitRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        <span style={{ ...pillStyle, ...statusStyle(c.status) }}>
                          {statusLabel(c.status)}
                        </span>

                        <span style={pillStyle}>{c.tournament_type}</span>

                        {hasDuplicates ? (
                          <span style={{ ...pillStyle, color: "#fbbf24", border: "1px solid rgba(251,191,36,0.28)", background: "rgba(251,191,36,0.12)" }}>
                            ⚠️ {duplicateSummary?.total} alert
                          </span>
                        ) : null}
                      </div>

                      <Link href={`/admin/circuits/${c.id}`} style={titleLink}>
                        {c.name}
                      </Link>

                      <div style={muted}>Slug pubblico: /circuiti/{c.slug}</div>
                    </div>

                    <div style={actionsRow}>
                      <Link href={`/admin/circuits/${c.id}`} style={secondaryButton}>
                        <Eye className="w-4 h-4" />
                        Dettaglio
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          setEditing(c);
                          setOpen(true);
                        }}
                        style={secondaryButton}
                      >
                        <Pencil className="w-4 h-4" />
                        Modifica
                      </button>

                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        style={dangerButton}
                      >
                        <Trash2 className="w-4 h-4" />
                        Elimina
                      </button>
                    </div>
                  </div>

                  {hasDuplicates ? (
                    <div style={duplicatesBox}>
                      <div style={{ fontWeight: 950, color: "#fbbf24", marginBottom: 8 }}>
                        Possibili duplicati
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        {duplicateSummary?.groups.map((group) => (
                          <div key={group.id} style={duplicateGroupBox}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>
                              {groupLabel(group)}
                            </div>

                            {group.duplicates.map((d) => (
  <div key={`${group.id}-${d.normalized_name}`} style={duplicateItem}>
    <div style={{ fontWeight: 950 }}>{d.normalized_name}</div>

    <div style={{ ...muted, marginTop: 4 }}>
      Key rilevate:
    </div>

    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      {d.player_keys.map((key) => {
        const otherKeys = d.player_keys.filter((x) => x !== key);
        const phone =
          d.player_phones.find((p) => String(p).replace(/[^\d]/g, "") === key) ??
          d.player_phones[0] ??
          null;

        return (
          <div key={key} style={mergeKeyRow}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, wordBreak: "break-all" }}>
                {key}
              </div>
              {phone ? (
                <div style={muted}>Telefono: {phone}</div>
              ) : null}
            </div>

            <button
              type="button"
              disabled={otherKeys.length === 0}
              onClick={() =>
                mergePlayerKeys({
                  circuitId: c.id,
                  rankingGroupId: group.id,
                  correctKey: key,
                  wrongKeys: otherKeys,
                  playerName: d.normalized_name,
                  playerPhone: phone,
                })
              }
              style={mergeButton}
            >
              Usa questa
            </button>
          </div>
        );
      })}
    </div>
  </div>
))}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </section>

        <CircuitDialog
          open={open}
          onClose={() => setOpen(false)}
          circuit={editing}
          onSaved={load}
        />
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone = "#ffffff",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ color: tone }}>{icon}</div>
      <div style={{ marginTop: 12, fontSize: 25, fontWeight: 950 }}>{value}</div>
      <div style={muted}>{label}</div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
  padding: "24px 16px 44px",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  marginBottom: 22,
  flexWrap: "wrap",
};

const cardStyle: React.CSSProperties = {
  borderRadius: 26,
  padding: 18,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 14,
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 650,
};

const primaryButton: React.CSSProperties = {
  minHeight: 46,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: 0,
  borderRadius: 18,
  padding: "0 15px",
  background: "linear-gradient(135deg, #fbbf24, #f97316)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryButton: React.CSSProperties = {
  minHeight: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  borderRadius: 16,
  padding: "0 12px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
  textDecoration: "none",
};

const dangerButton: React.CSSProperties = {
  ...secondaryButton,
  color: "#fca5a5",
  border: "1px solid rgba(248,113,113,0.22)",
  background: "rgba(248,113,113,0.12)",
};

const circuitRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const actionsRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const titleLink: React.CSSProperties = {
  display: "inline-block",
  color: "white",
  fontSize: 20,
  fontWeight: 950,
  letterSpacing: -0.3,
  textDecoration: "none",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: "rgba(255,255,255,0.72)",
  fontSize: 12,
  fontWeight: 900,
};

const alertCard: React.CSSProperties = {
  ...cardStyle,
  border: "1px solid rgba(251,191,36,0.22)",
  background:
    "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(255,255,255,0.035))",
  marginBottom: 14,
};

const duplicatesBox: React.CSSProperties = {
  marginTop: 14,
  borderRadius: 22,
  padding: 13,
  background: "rgba(251,191,36,0.08)",
  border: "1px solid rgba(251,191,36,0.16)",
};

const duplicateGroupBox: React.CSSProperties = {
  borderRadius: 18,
  padding: 12,
  background: "rgba(3,7,18,0.24)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const duplicateItem: React.CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.08)",
  paddingTop: 8,
  marginTop: 8,
};

const emptyCard: React.CSSProperties = {
  ...cardStyle,
  color: "rgba(255,255,255,0.58)",
  fontSize: 14,
  fontWeight: 750,
};

const mergeKeyRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  borderRadius: 16,
  padding: 10,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  flexWrap: "wrap",
};

const mergeButton: React.CSSProperties = {
  minHeight: 36,
  border: 0,
  borderRadius: 14,
  padding: "0 11px",
  background: "linear-gradient(135deg, #fbbf24, #f97316)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};