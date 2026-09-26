export type GameProfileCompletenessStatus = "complete" | "partial" | "incomplete";

export type GameProfileCompletenessInput = {
  hasProfile: boolean;
  descriptiveLevel: string | null;
  moviLevel: number | null;
  preferredClubs: string[];
  availableOtherClubs: boolean | null;
  availabilityCount: number;
  preferredMatchTypes: string[];
  availableLastMinute: boolean | null;
};

export type GameProfileCompleteness = {
  score: number;
  total: 5;
  status: GameProfileCompletenessStatus;
  label: "Completo" | "Parziale" | "Da completare";
  missing: string[];
};

export function computeGameProfileCompleteness(input: GameProfileCompletenessInput): GameProfileCompleteness {
  const level = input.moviLevel !== null || Boolean(input.descriptiveLevel);
  // Nel profilo corrente una lista club vuota rappresenta nessuna restrizione.
  // L'assenza dell'intero profilo, invece, resta un dato ancora da verificare.
  const club = input.hasProfile && (
    input.preferredClubs.length > 0 ||
    input.availableOtherClubs === true ||
    input.preferredClubs.length === 0
  );
  const weeklyAvailability = input.availabilityCount > 0;
  const matchType = input.preferredMatchTypes.length > 0;
  const lastMinute = input.availableLastMinute === true || input.availableLastMinute === false;

  const groups = [
    { complete: level, label: "livello" },
    { complete: club, label: "preferenza club" },
    { complete: weeklyAvailability, label: "disponibilità settimanale" },
    { complete: matchType, label: "tipo partita" },
    { complete: lastMinute, label: "disponibilità last minute" },
  ];
  const score = groups.filter((group) => group.complete).length;
  const status: GameProfileCompletenessStatus = score === 5 ? "complete" : score >= 3 ? "partial" : "incomplete";
  const label = status === "complete" ? "Completo" : status === "partial" ? "Parziale" : "Da completare";
  return { score, total: 5, status, label, missing: groups.filter((group) => !group.complete).map((group) => group.label) };
}
