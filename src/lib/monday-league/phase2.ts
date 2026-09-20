import "server-only";
import { createHash } from "node:crypto";
import { generateMondayLeagueRoundRobin } from "@/lib/monday-league/generator";

export type Phase2Standing = {
  position: number; team_id: string; team_name: string; points: number;
  set_difference: number; game_difference: number; tie_break_order: number;
};

export type Phase2Readiness = {
  season_id: string; source_phase_id: string; ready: boolean; fingerprint: string;
  already_generated: boolean; total_teams: number; total_matches: number; terminal_matches: number;
  blocking_matches: Array<{ match_id: string; home_team: string; away_team: string; reason: string }>;
  standings: Phase2Standing[]; serie_a: Phase2Standing[]; serie_b: Phase2Standing[];
};

function deterministicUuid(seed: string) {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function buildPhase2Generation(readiness: Phase2Readiness) {
  const serieAPhaseId = deterministicUuid(`monday-league|${readiness.season_id}|serie_a`);
  const serieBPhaseId = deterministicUuid(`monday-league|${readiness.season_id}|serie_b`);
  const build = (phaseId: string, rows: Phase2Standing[]) => generateMondayLeagueRoundRobin(
    phaseId,
    rows.map((row) => row.team_id),
    [...rows].sort((a, b) => a.tie_break_order - b.tie_break_order).map((row) => row.team_id)
  );
  return {
    serieAPhaseId,
    serieBPhaseId,
    serieA: build(serieAPhaseId, readiness.serie_a),
    serieB: build(serieBPhaseId, readiness.serie_b),
  };
}
