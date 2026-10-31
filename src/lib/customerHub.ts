export type CustomerAuthAccess = {
  key: "active" | "to_activate" | "review" | "conflict" | "unknown" | "absent";
  label: string;
};

export function customerAuthAccess(authMigrationState: string | null | undefined, authLinked: boolean): CustomerAuthAccess {
  if (authMigrationState === "review_required") return { key: "review", label: "Nuovo accesso: revisione necessaria" };
  if (authMigrationState === "conflict") return { key: "conflict", label: "Nuovo accesso: conflitto" };
  if (authMigrationState === "linked" && authLinked) return { key: "active", label: "Nuovo accesso: attivo" };
  if ((authMigrationState === "legacy" || authMigrationState === "activation_pending") && !authLinked) {
    return { key: "to_activate", label: "Nuovo accesso: da attivare" };
  }
  if (!authMigrationState && !authLinked) return { key: "absent", label: "Nuovo accesso: non configurato" };
  return { key: "unknown", label: "Nuovo accesso: da verificare" };
}

export function customerHubMatchesSearch(
  query: string,
  values: Array<string | null | undefined>,
) {
  const needle = query.trim().toLocaleLowerCase("it-IT");
  if (!needle) return true;
  const digits = query.replace(/[^+\d]/g, "");
  return values.some((value) => {
    const text = String(value ?? "");
    return text.toLocaleLowerCase("it-IT").includes(needle)
      || (digits.length >= 3 && text.replace(/[^+\d]/g, "").includes(digits));
  });
}
