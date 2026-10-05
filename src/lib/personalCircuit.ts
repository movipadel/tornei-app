type PublicRankingRow = { position: number; player_name: string; total_points: number; events_played: number };
type PersonalCircuitDependencies = {
  buildPublicCircuitRanking: (rows: ReadonlyArray<{ player_name: string | null; points: number | null }>) => PublicRankingRow[];
  ownsCircuitResult: (row: { player_identity_id?: string | null; player_key: string }, playerIds: readonly string[], legacyKeys: readonly string[]) => boolean;
};

export type PersonalCircuitResult = {
  ranking_group_id: string;
  source_tournament_id: string | null;
  tournament_name: string | null;
  tournament_date: string | null;
  player_key: string;
  player_name: string | null;
  player_identity_id: string | null;
  points: number | null;
  placement: number | null;
};

export type PersonalStageTournament = {
  id: string;
  name: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  category: string | null;
  level: string | null;
};

export type PersonalCircuitStage = {
  source_tournament_id: string | null;
  name: string;
  date: string | null;
  time: string | null;
  location: string | null;
  category: string | null;
  level: string | null;
  placement: number | null;
  points: number;
};

export type PersonalCircuitResolution =
  | { state: "empty"; ownedRows: PersonalCircuitResult[] }
  | { state: "review_required"; ownedRows: PersonalCircuitResult[] }
  | { state: "ready"; ownedRows: PersonalCircuitResult[]; rank: PublicRankingRow; totalRankedPlayers: number };

export function resolvePersonalCircuit(
  rows: readonly PersonalCircuitResult[],
  playerIds: readonly string[],
  legacyKeys: readonly string[],
  dependencies: PersonalCircuitDependencies,
): PersonalCircuitResolution {
  const { buildPublicCircuitRanking, ownsCircuitResult } = dependencies;
  const ownedRows = rows.filter((row) => ownsCircuitResult(row, playerIds, legacyKeys));
  if (!ownedRows.length) return { state: "empty", ownedRows };

  const names = [...new Set(ownedRows.map((row) => String(row.player_name ?? "").trim()).filter(Boolean))];
  const unambiguous = names.length === 1 && !rows.some((row) =>
    String(row.player_name ?? "").trim() === names[0] && !ownsCircuitResult(row, playerIds, legacyKeys)
  );
  if (!unambiguous) return { state: "review_required", ownedRows };

  const ranking = buildPublicCircuitRanking(rows);
  const rank = ranking.find((row) => row.player_name === names[0]);
  return rank ? { state: "ready", ownedRows, rank, totalRankedPlayers: ranking.length } : { state: "review_required", ownedRows };
}

function sameSportingResult(a: PersonalCircuitResult, b: PersonalCircuitResult) {
  return a.points === b.points && a.placement === b.placement &&
    a.tournament_name === b.tournament_name && a.tournament_date === b.tournament_date;
}

export function buildPersonalCircuitStages(
  ownedRows: readonly PersonalCircuitResult[],
  tournaments: readonly PersonalStageTournament[],
): { state: "ready"; stages: PersonalCircuitStage[] } | { state: "review_required"; stages: [] } {
  const unique = new Map<string, PersonalCircuitResult>();
  for (const row of ownedRows) {
    const key = row.source_tournament_id
      ? `${row.ranking_group_id}:${row.source_tournament_id}`
      : `${row.ranking_group_id}:legacy:${row.tournament_name ?? ""}:${row.tournament_date ?? ""}`;
    const existing = unique.get(key);
    if (existing && !sameSportingResult(existing, row)) return { state: "review_required", stages: [] };
    if (!existing) unique.set(key, row);
  }

  const byId = new Map(tournaments.map((tournament) => [tournament.id, tournament]));
  const stages = [...unique.values()].map((row) => {
    const source = row.source_tournament_id ? byId.get(row.source_tournament_id) : undefined;
    return {
      source_tournament_id: row.source_tournament_id,
      name: String(source?.name ?? row.tournament_name ?? "Tappa"),
      date: source?.date ?? row.tournament_date ?? null,
      time: source?.time ?? null,
      location: source?.location ?? null,
      category: source?.category ?? null,
      level: source?.level ?? null,
      placement: row.placement,
      points: Number(row.points ?? 0),
    };
  }).sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || a.name.localeCompare(b.name, "it"));

  return { state: "ready", stages };
}
