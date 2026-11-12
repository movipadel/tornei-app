export type AccountIdentitySeverity = "CONSISTENT" | "MISSING_DATA" | "REVIEW_RECOMMENDED" | "CONFLICT";
export type AccountIdentityField = "name" | "phone" | "gender";
export type AccountIdentityFinding = {
  field: AccountIdentityField;
  kind: "missing" | "review" | "conflict";
  message: string;
};

export type AccountIdentityConsistency = {
  severity: AccountIdentitySeverity;
  findings: AccountIdentityFinding[];
};

type IdentitySide = { full_name: string | null; phone: string | null; gender: string | null };

// Phone values must be normalized by public.normalize_user_mobile_e164 before calling.
// The persisted player identity phone uses that same canonical E.164 contract.
export function classifyAccountIdentityConsistency(input: {
  account: IdentitySide;
  player: IdentitySide;
  accountPhoneE164: string | null;
  playerPhoneE164: string | null;
}): AccountIdentityConsistency {
  const findings: AccountIdentityFinding[] = [];
  const add = (field: AccountIdentityField, kind: AccountIdentityFinding["kind"], message: string) =>
    findings.push({ field, kind, message });
  const name = (value: string | null) => value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT") ?? "";
  const accountName = name(input.account.full_name);
  const playerName = name(input.player.full_name);
  if (!accountName || !playerName) {
    add("name", "missing", !accountName && !playerName ? "Nome non indicato in entrambi i profili."
      : !accountName ? "Nome account non indicato." : "Nome identità sportiva non indicato.");
  } else if (accountName !== playerName) {
    add("name", "conflict", "Nome account e nome identità sportiva non coincidono.");
  }

  const accountPhonePresent = Boolean(input.account.phone?.trim());
  const playerPhonePresent = Boolean(input.player.phone?.trim());
  if (!accountPhonePresent || !playerPhonePresent) {
    add("phone", "missing", !accountPhonePresent && !playerPhonePresent ? "Telefono non indicato in entrambi i profili."
      : !accountPhonePresent ? "Telefono account non indicato." : "Telefono identità sportiva non indicato.");
  } else if (!input.accountPhoneE164 || !input.playerPhoneE164) {
    add("phone", "review", !input.accountPhoneE164 ? "Telefono account non verificabile: formato non valido."
      : "Telefono identità sportiva non verificabile: formato non valido.");
  } else if (input.accountPhoneE164 !== input.playerPhoneE164) {
    add("phone", "conflict", "Telefono account e telefono identità sportiva non coincidono.");
  }

  const accountGender = input.account.gender?.trim().toUpperCase() ?? "";
  const playerGender = input.player.gender?.trim().toUpperCase() ?? "";
  if (!accountGender || !playerGender) {
    add("gender", "missing", !accountGender && !playerGender ? "Genere non indicato in entrambi i profili."
      : !accountGender ? "Genere account non indicato." : "Genere identità sportiva non indicato.");
  } else if (accountGender !== playerGender) {
    add("gender", "conflict", "Il genere presente nei due profili è diverso.");
  }

  const severity: AccountIdentitySeverity = findings.some((item) => item.kind === "conflict") ? "CONFLICT"
    : findings.some((item) => item.kind === "review") ? "REVIEW_RECOMMENDED"
    : findings.some((item) => item.kind === "missing") ? "MISSING_DATA" : "CONSISTENT";
  return { severity, findings };
}
