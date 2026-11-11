export type RegistrationGender = "M" | "F";

const knownGender = (value: string | null | undefined): RegistrationGender | null =>
  value === "M" || value === "F" ? value : null;

export function registrationGenderSuggestion(
  snapshotGender: string | null | undefined,
  canonicalIdentityGender: string | null | undefined,
  activeAccountGender: string | null | undefined,
  conflictingAccountLinks = false,
): { suggestion: RegistrationGender | null; conflict: boolean } {
  if (knownGender(snapshotGender)) return { suggestion: null, conflict: false };

  const identity = knownGender(canonicalIdentityGender);
  const account = knownGender(activeAccountGender);
  const conflict = conflictingAccountLinks || (identity !== null && account !== null && identity !== account);
  return { suggestion: conflict ? null : identity ?? account, conflict };
}
