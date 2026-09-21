export function mondayLeagueAdminReadError(
  area: "results" | "standings",
  scope: string,
  error: { code?: string } | null | undefined,
) {
  console.error(`[monday-league] admin ${area} read failed`, { scope, code: error?.code ?? "unknown" });
  return {
    status: 500 as const,
    body: { error: "Dati Monday League temporaneamente non disponibili", code: "ML_ADMIN_DATA_UNAVAILABLE" },
  };
}
