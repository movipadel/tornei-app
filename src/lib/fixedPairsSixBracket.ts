export type RankedFixedPair = {
  pairId: string;
  groupId: string;
  groupRank: number;
};

export type RankedFixedPairGroup<T extends RankedFixedPair> = {
  group: {
    id: string;
    position: number;
  };
  rows: T[];
};

export type FixedPairsSixBracketPlan<T extends RankedFixedPair> = {
  kind: "two_groups_of_three_all_qualify";
  groupXId: string;
  groupYId: string;
  quarterfinals: Array<{ home: T; away: T }>;
  semifinalByes: T[];
};

function rowsByRank<T extends RankedFixedPair>(rows: T[]) {
  if (rows.length !== 3) return null;

  const byRank = new Map<number, T>();
  for (const row of rows) {
    if (![1, 2, 3].includes(row.groupRank) || byRank.has(row.groupRank)) {
      return null;
    }
    byRank.set(row.groupRank, row);
  }

  const first = byRank.get(1);
  const second = byRank.get(2);
  const third = byRank.get(3);
  if (!first || !second || !third) return null;

  return { first, second, third };
}

export function buildFixedPairsSixBracketPlan<T extends RankedFixedPair>(
  groupsRanked: RankedFixedPairGroup<T>[],
  qualifiersCount: number,
  qualified: T[]
): FixedPairsSixBracketPlan<T> | null {
  if (qualifiersCount !== 6 || qualified.length !== 6 || groupsRanked.length !== 2) {
    return null;
  }

  const groups = [...groupsRanked].sort(
    (a, b) => Number(a.group.position) - Number(b.group.position)
  );

  const positions = groups.map((entry) => Number(entry.group.position));
  if (
    positions.some((position) => !Number.isInteger(position) || position < 1) ||
    positions[0] === positions[1]
  ) {
    return null;
  }

  const groupXId = String(groups[0].group.id ?? "");
  const groupYId = String(groups[1].group.id ?? "");
  if (!groupXId || !groupYId || groupXId === groupYId) return null;

  if (
    groups[0].rows.some((row) => String(row.groupId) !== groupXId) ||
    groups[1].rows.some((row) => String(row.groupId) !== groupYId)
  ) {
    return null;
  }

  const groupX = rowsByRank(groups[0].rows);
  const groupY = rowsByRank(groups[1].rows);
  if (!groupX || !groupY) return null;

  const rankedIds = [
    ...groups[0].rows.map((row) => String(row.pairId)),
    ...groups[1].rows.map((row) => String(row.pairId)),
  ];
  const qualifiedIds = qualified.map((row) => String(row.pairId));

  if (
    new Set(rankedIds).size !== 6 ||
    new Set(qualifiedIds).size !== 6 ||
    rankedIds.some((pairId) => !qualifiedIds.includes(pairId))
  ) {
    return null;
  }

  return {
    kind: "two_groups_of_three_all_qualify",
    groupXId,
    groupYId,
    quarterfinals: [
      { home: groupX.second, away: groupY.third },
      { home: groupY.second, away: groupX.third },
    ],
    // autoAdvanceBracket maps quarterfinal row N to semifinal row N.
    // This mirrored order guarantees each winner meets the other group's winner.
    semifinalByes: [groupY.first, groupX.first],
  };
}
