type MatchdayResult = { status: string } | null;

export type MatchdayUiRound = {
  id: string;
  matches: ReadonlyArray<{ result: MatchdayResult }>;
};

const DEFINITIVE_RESULT_STATES = new Set(["confirmed", "special"]);

export type MatchdayUiStats = {
  total: number;
  played: number;
  definitive: number;
  complete: boolean;
  partial: boolean;
  future: boolean;
};

export function getMatchdayUiStats(round: MatchdayUiRound): MatchdayUiStats {
  const total = round.matches.length;
  const played = round.matches.filter((match) => match.result !== null).length;
  const definitive = round.matches.filter((match) => match.result && DEFINITIVE_RESULT_STATES.has(match.result.status)).length;
  const complete = total > 0 && definitive === total;

  return {
    total,
    played,
    definitive,
    complete,
    partial: played > 0 && !complete,
    future: played === 0 && !complete,
  };
}

function encounterLabel(count: number) {
  return `${count} ${count === 1 ? "incontro" : "incontri"}`;
}

function playedLabel(count: number) {
  return `${count} ${count === 1 ? "giocato" : "giocati"}`;
}

function definitiveLabel(count: number) {
  return `${count} ${count === 1 ? "definitivo" : "definitivi"}`;
}

export function getMatchdaySummary(round: MatchdayUiRound) {
  const stats = getMatchdayUiStats(round);
  const total = encounterLabel(stats.total);

  if (stats.complete) return `${total} · ${definitiveLabel(stats.definitive)}`;
  if (stats.played === 0) return `${total} · da giocare`;

  const remaining = stats.total - stats.played;
  if (remaining > 0) return `${total} · ${playedLabel(stats.played)} · ${remaining} da giocare`;

  return `${total} · ${playedLabel(stats.played)} · ${definitiveLabel(stats.definitive)}`;
}

export function getDefaultOpenMatchdayIds(rounds: ReadonlyArray<MatchdayUiRound>) {
  if (!rounds.length) return [];

  const states = rounds.map(getMatchdayUiStats);
  const partialIndex = states.findIndex((state) => state.partial);

  if (partialIndex >= 0) {
    const open = [rounds[partialIndex].id];
    const nextFutureIndex = states.findIndex((state, index) => index > partialIndex && state.future);
    if (nextFutureIndex >= 0) open.push(rounds[nextFutureIndex].id);
    return open;
  }

  let latestCompletedIndex = -1;
  states.forEach((state, index) => {
    if (state.complete) latestCompletedIndex = index;
  });

  if (latestCompletedIndex >= 0) {
    const open = [rounds[latestCompletedIndex].id];
    const nextIncompleteIndex = states.findIndex((state, index) => index > latestCompletedIndex && !state.complete);
    if (nextIncompleteIndex >= 0) open.push(rounds[nextIncompleteIndex].id);
    return open;
  }

  const firstUpcomingIndex = states.findIndex((state) => !state.complete);
  return firstUpcomingIndex >= 0 ? [rounds[firstUpcomingIndex].id] : [];
}

export function toggleOpenMatchday(openIds: ReadonlySet<string>, roundId: string) {
  const next = new Set(openIds);
  if (next.has(roundId)) next.delete(roundId);
  else next.add(roundId);
  return next;
}
