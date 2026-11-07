export type PostponableMatch = {
  match_status: string;
  current_result_id: string | null;
  current_special_outcome_id: string | null;
};

export function canPostponeMatch(
  match: PostponableMatch,
  seasonStatus: string,
  phaseStatus: string,
  hasOpenContest: boolean,
): boolean {
  return seasonStatus !== "completed"
    && phaseStatus !== "finalized"
    && match.match_status === "scheduled"
    && match.current_result_id === null
    && match.current_special_outcome_id === null
    && !hasOpenContest;
}
