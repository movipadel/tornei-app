export type MixedPreparationSnapshot = {
  eligible: boolean;
  reason: string | null;
  male_count: number;
  female_count: number;
  unknown_count: number;
};

export function tournamentMixedPreparationView(
  type: string,
  category: string,
  hasRun: boolean,
  snapshot: MixedPreparationSnapshot | null,
  loading: boolean,
) {
  const relevant = type === "Baraonda" && (category === "libero" || category === "misto");
  const frozen = hasRun || snapshot?.reason === "RUN_GIA_CREATA" || snapshot?.reason === "TAPPA_GIA_CONCLUSA";
  return {
    showBlock: relevant && (!frozen || category === "misto"),
    canEditGender: relevant && Boolean(snapshot) && !frozen && !loading,
    canConvertMisto: relevant && category === "libero" && Boolean(snapshot?.eligible) && !frozen && !loading,
    canConvertLibero: relevant && category === "misto" && Boolean(snapshot) && !frozen && !loading,
    showUnknownHint: Boolean(snapshot && snapshot.unknown_count > 0),
    showBalanceHint: Boolean(snapshot && snapshot.unknown_count === 0 && snapshot.male_count !== snapshot.female_count),
  };
}
