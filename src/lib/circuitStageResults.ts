export type PublicCircuitStageResult = { player_name: string; points: number; placement: number | null };

// Preserve the Phase 1 public stage ordering: points, authoritative placement, Italian name.
export function sortPublicCircuitStageResults<T extends PublicCircuitStageResult>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.placement == null && b.placement == null) return a.player_name.localeCompare(b.player_name, "it");
    if (a.placement == null) return 1;
    if (b.placement == null) return -1;
    if (a.placement !== b.placement) return a.placement - b.placement;
    return a.player_name.localeCompare(b.player_name, "it");
  });
}
