export type TournamentPosterMode = "review" | "production";

export const TOURNAMENT_POSTER_LAYOUT = {
  dynamicContentBottom: 889,
  sponsorZone: {
    top: 918,
    height: 122,
    bottom: 1040,
  },
  footerTop: 1092,
} as const;

export function showSponsorPlaceholder(mode: TournamentPosterMode) {
  return mode === "review";
}
