"use client";

import { useState } from "react";
import { toast } from "sonner";

type Match = {
  id: string;
  match_number: number;
  team1_games: number | null;
  team2_games: number | null;
  team1: [string, string];
  team2: [string, string];
  patch_url: string;
};

type Turn = {
  id: string;
  turn_number: number;
  matches: Match[];
  resting: string[];
};

export default function TurnCard({ turn }: { turn: Turn }) {
  return (
    <div className="base44-card space-y-3">
      <div className="font-semibold">Turno #{turn.turn_number}</div>

      {turn.matches.map((match) => (
        <MatchRow key={match.id} match={match} />
      ))}

      {turn.resting.length > 0 && (
        <div className="text-sm text-muted-foreground">
          A riposo: {turn.resting.join(", ")}
        </div>
      )}
    </div>
  );
}

function MatchRow({ match }: { match: Match }) {
  const [g1, setG1] = useState<string>(
    match.team1_games === null ? "" : String(match.team1_games)
  );
  const [g2, setG2] = useState<string>(
    match.team2_games === null ? "" : String(match.team2_games)
  );

  async function save() {
    const n1 = Number(g1);
    const n2 = Number(g2);

    if (!Number.isFinite(n1) || !Number.isFinite(n2) || n1 < 0 || n2 < 0) {
      toast.error("Punteggi non validi");
      return;
    }

    const res = await fetch(match.patch_url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team1_games: n1, team2_games: n2 }),
    });

    if (res.ok) toast.success("Risultato salvato");
    else toast.error("Errore salvataggio");
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm flex-1">
        <span className="font-medium">{match.team1[0]}</span> +{" "}
        <span className="font-medium">{match.team1[1]}</span>
        {"  "}vs{"  "}
        <span className="font-medium">{match.team2[0]}</span> +{" "}
        <span className="font-medium">{match.team2[1]}</span>
      </div>

      <input
        className="base44-input w-14"
        value={g1}
        onChange={(e) => setG1(e.target.value)}
        type="number"
        min={0}
      />
      <span>-</span>
      <input
        className="base44-input w-14"
        value={g2}
        onChange={(e) => setG2(e.target.value)}
        type="number"
        min={0}
      />

      <button onClick={save} className="base44-btn-sm">
        Salva
      </button>
    </div>
  );
}
