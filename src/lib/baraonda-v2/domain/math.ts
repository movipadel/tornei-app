import type { BaraondaCategory, BaraondaFormula } from "./types";
import {
  MIXED_FORMULA_MATCHES_PER_PLAYER,
  NON_MIXED_FORMULA_MATCHES_PER_PLAYER,
} from "./formats";

export function isTournamentMathValid(players: number, matchesPerPlayer: number): boolean {
  if (players <= 0 || matchesPerPlayer <= 0) return false;
  return (players * matchesPerPlayer) % 4 === 0;
}

export function getTotalMatches(players: number, matchesPerPlayer: number): number {
  return (players * matchesPerPlayer) / 4;
}

export function getMixedMaxUniquePartners(perSexPlayers: number): number {
  return perSexPlayers;
}

export function getMixedRepeatMin(
  perSexPlayers: number,
  matchesPerPlayer: number
): number {
  return Math.max(0, matchesPerPlayer - getMixedMaxUniquePartners(perSexPlayers));
}

export function getNonMixedMaxUniquePartners(players: number): number {
  return players - 1;
}

export function getNonMixedRepeatMin(
  players: number,
  matchesPerPlayer: number
): number {
  return Math.max(0, matchesPerPlayer - getNonMixedMaxUniquePartners(players));
}

export function isNonMixedMarathonAvailable(players: number): boolean {
  if (players < 4) return false;
  return (players * (players - 1)) % 4 === 0;
}

export function isMixedPlayersCountValid(players: number): boolean {
  return players % 2 === 0;
}

export function isMixedGenderSplitValid(males: number, females: number): boolean {
  return males > 0 && females > 0 && males === females;
}

export function resolveMatchesPerPlayer(
  category: BaraondaCategory,
  players: number,
  formula: BaraondaFormula | null
): number | null {
  if (!formula) return null;

  if (category === "misto") {
    const perSex = players / 2;
    return MIXED_FORMULA_MATCHES_PER_PLAYER[perSex]?.[formula] ?? null;
  }

  return NON_MIXED_FORMULA_MATCHES_PER_PLAYER[players]?.[formula] ?? null;
}