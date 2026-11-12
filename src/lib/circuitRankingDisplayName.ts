type RankingRow = { player_name: string };
type ResultNameSource = { player_name: string | null; player_identity_id: string | null };
export type RankingPlayerIdentity = {
  full_name: string | null;
  status: string;
  merged_into_player_id: string | null;
};

// Decorate the already aggregated rows. Historical names remain the grouping keys.
export function withCanonicalCircuitRankingNames<T extends RankingRow>(
  ranking: ReadonlyArray<T>,
  results: ReadonlyArray<ResultNameSource>,
  identities: ReadonlyMap<string, RankingPlayerIdentity>,
): Array<T & { display_name: string }> {
  const identityIdsBySourceName = new Map<string, Set<string | null>>();
  for (const result of results) {
    const sourceName = String(result.player_name ?? "").trim();
    if (!sourceName) continue;
    const ids = identityIdsBySourceName.get(sourceName) ?? new Set<string | null>();
    ids.add(result.player_identity_id);
    identityIdsBySourceName.set(sourceName, ids);
  }

  return ranking.map((row) => {
    const ids = identityIdsBySourceName.get(row.player_name);
    const id = ids?.size === 1 ? ids.values().next().value : null;
    const identity = id ? identities.get(id) : undefined;
    const canonicalName = identity?.status === "active" && !identity.merged_into_player_id
      ? String(identity.full_name ?? "").trim()
      : "";
    return { ...row, display_name: canonicalName || row.player_name };
  });
}

export function formatCircuitRankingDisplayName(value: string): string {
  return value.toLocaleUpperCase("it");
}
