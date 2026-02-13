"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type MatchUI = {
  id: string;
  match_number: number;
  team1_games: number | null;
  team2_games: number | null;
  team1: string[];
  team2: string[];
  patch_url: string;
};

function toInputValue(v: number | null): string {
  return v === null || v === undefined ? "" : String(v);
}

function parseNullableInt(s: string): number | null {
  const t = (s ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export default function RunScoreClient({ match }: { match: MatchUI }) {
  const router = useRouter();

  const [left, setLeft] = useState<string>(() => toInputValue(match.team1_games));
  const [right, setRight] = useState<string>(() => toInputValue(match.team2_games));
  const [saving, setSaving] = useState(false);

  const scoreChip = useMemo(() => {
    const l = left.trim() === "" ? "-" : left.trim();
    const r = right.trim() === "" ? "-" : right.trim();
    return `${l} - ${r}`;
  }, [left, right]);

  async function save() {
    setSaving(true);
    try {
      const team1_games = parseNullableInt(left);
      const team2_games = parseNullableInt(right);

      const res = await fetch(match.patch_url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1_games, team2_games }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore salvataggio punteggio");

      toast.success("Punteggio salvato");
      router.refresh(); // ricarica i dati server-side
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      const res = await fetch(match.patch_url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1_games: null, team2_games: null }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore reset punteggio");

      toast.success("Punteggio azzerato");
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
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
        <div style={{ fontWeight: 800, color: "#334155" }}>Match {match.match_number}</div>
        <div className="base44-chip" style={{ padding: "2px 10px" }}>
          {scoreChip}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 700, color: "#0f172a" }}>{(match.team1 ?? []).join(" + ")}</div>
        <div style={{ color: "#94a3b8", fontWeight: 900 }}>VS</div>
        <div style={{ fontWeight: 700, color: "#0f172a", textAlign: "right" }}>
          {(match.team2 ?? []).join(" + ")}
        </div>
      </div>

      {/* score editor */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#64748b", fontWeight: 700 }}>Score:</span>

          <input
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            style={{
              width: 64,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              outline: "none",
              textAlign: "center",
            }}
          />

          <span style={{ fontWeight: 900, color: "#94a3b8" }}>-</span>

          <input
            value={right}
            onChange={(e) => setRight(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            style={{
              width: 64,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              outline: "none",
              textAlign: "center",
            }}
          />
        </div>

        <button
          className="base44-primary-btn"
          onClick={save}
          disabled={saving}
          style={{ padding: "10px 14px", borderRadius: 999, opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Salvo..." : "Salva"}
        </button>

        <button
          className="base44-csv-btn"
          onClick={clear}
          disabled={saving}
          style={{ padding: "10px 14px", borderRadius: 999, opacity: saving ? 0.7 : 1 }}
        >
          Azzera
        </button>
      </div>

      <div style={{ color: "#94a3b8", fontSize: 12 }}>
        Match ID: {match.id}
      </div>
    </div>
  );
}
