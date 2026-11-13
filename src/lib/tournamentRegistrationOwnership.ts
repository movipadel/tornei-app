export type TournamentRegistrationOwnerRow = {
  id: string;
  tournament_id: string;
  is_reserve: boolean;
  user_id: string | null;
  p1_player_identity_id: string | null;
  p2_player_identity_id: string | null;
  p1_phone: string | null;
  p2_phone: string | null;
};

export type TournamentRegistrationOwnerScope = {
  userIds: string[];
  playerIds: string[];
  legacyKeys: string[];
};

export type OwnedTournamentRegistration = {
  id: string;
  tournament_id: string;
  is_reserve: boolean;
};

export function ownedTournamentStatus(
  registrations: OwnedTournamentRegistration[],
  tournamentId: string,
): "none" | "main" | "reserve" {
  const registration = registrations.find((row) => row.tournament_id === tournamentId);
  return registration ? registration.is_reserve ? "reserve" : "main" : "none";
}

export function upsertOwnedTournamentRegistration(
  current: OwnedTournamentRegistration[],
  registration: OwnedTournamentRegistration,
): OwnedTournamentRegistration[] {
  return [...current.filter((row) => row.tournament_id !== registration.tournament_id), registration];
}

export function removeOwnedTournamentRegistration(
  current: OwnedTournamentRegistration[],
  registrationId: string,
): OwnedTournamentRegistration[] {
  return current.filter((row) => row.id !== registrationId);
}

// Match the existing movi_activity_phone_key convention for unlinked historical slots.
export function tournamentRegistrationPhoneKey(value: string | null): string {
  return String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/[().-]/g, "")
    .replace(/^(\+39|0039)/, "")
    .replace(/[^0-9]/g, "");
}

export function ownsTournamentRegistration(
  row: TournamentRegistrationOwnerRow,
  scope: TournamentRegistrationOwnerScope,
): boolean {
  if (row.user_id && scope.userIds.includes(row.user_id)) return true;
  if (row.p1_player_identity_id && scope.playerIds.includes(row.p1_player_identity_id)) return true;
  if (row.p2_player_identity_id && scope.playerIds.includes(row.p2_player_identity_id)) return true;

  const keys = new Set(scope.legacyKeys.filter((key) => /^\d{8,}$/.test(key)));
  return Boolean(
    (!row.user_id && !row.p1_player_identity_id && keys.has(tournamentRegistrationPhoneKey(row.p1_phone))) ||
    (!row.p2_player_identity_id && row.p2_phone && keys.has(tournamentRegistrationPhoneKey(row.p2_phone))),
  );
}
