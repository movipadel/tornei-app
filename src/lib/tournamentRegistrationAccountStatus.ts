export type RegistrationAccountStatus = "ACCOUNT_LINKED" | "IDENTITY_ONLY" | "NEEDS_REVIEW";

export type RegistrationIdentityLink = {
  id: string;
  status: string;
  merged_into_player_id: string | null;
  account_user_id: string | null;
};

export type RegistrationAccountLink = {
  id: string;
  identity_status: string;
  merged_into_user_id: string | null;
};

export function registrationAccountStatus(
  playerIdentityId: string | null,
  identity: RegistrationIdentityLink | undefined,
  account: RegistrationAccountLink | undefined,
): RegistrationAccountStatus {
  if (!playerIdentityId || identity?.id !== playerIdentityId || identity.status !== "active" || identity.merged_into_player_id !== null) {
    return "NEEDS_REVIEW";
  }
  if (identity.account_user_id === null) return "IDENTITY_ONLY";
  return account?.id === identity.account_user_id && account.identity_status === "active" && account.merged_into_user_id === null
    ? "ACCOUNT_LINKED"
    : "NEEDS_REVIEW";
}
