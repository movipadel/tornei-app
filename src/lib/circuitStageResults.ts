export type PublicCircuitStageResult = { player_name: string; points: number; placement: number | null };

// Preserve the Phase 1 public stage ordering: points, authoritative placement, Italian name.
export function sortPublicCircuitStageResults<T extends PublicCircuitStageResult>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.placement == null && b.placement == null) return a.player_name.localeCompare(b.player_name, "it");
    if (a.placement == null) return 1;
    if (b.placement == null) return -1;
    if (a.placement !== b.placement) return a.placement - b.placement;
    return a.player_name.localeCompare(b.player_name, "it");
  });
}

export type CircuitStageResultRow = {
  tournament_name: string;
  tournament_type: string;
  tournament_date: string | null;
  player_name: string | null;
  points: number | null;
  placement: number | null;
};

type SourceTournament = {
  category: string | null;
  level: string | null;
  time: string | null;
  location: string | null;
};

export function buildCircuitStageDetail(
  sourceTournamentId: string,
  rows: readonly CircuitStageResultRow[],
  groupLevel: string | null,
  tournament: SourceTournament | null,
) {
  if (!rows.length) return null;
  const first = rows[0];
  if (rows.some((row) => row.tournament_name !== first.tournament_name ||
    row.tournament_type !== first.tournament_type || row.tournament_date !== first.tournament_date)) {
    return null;
  }

  return {
    stage: {
      id: sourceTournamentId,
      name: first.tournament_name,
      type: first.tournament_type,
      category: tournament?.category ?? null,
      level: tournament?.level ?? groupLevel,
      date: first.tournament_date,
      time: tournament?.time ?? null,
      location: tournament?.location ?? null,
    },
    results: sortPublicCircuitStageResults(rows.map((row) => ({
      player_name: String(row.player_name ?? "-"),
      points: Number(row.points ?? 0),
      placement: row.placement ?? null,
    }))),
  };
}
