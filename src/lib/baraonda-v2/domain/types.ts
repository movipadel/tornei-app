export type BaraondaCategory = "misto" | "maschile" | "femminile" | "libero";
export type BaraondaEngineMode = "mixed" | "non_mixed";
export type BaraondaFormula = "snella" | "bilanciata" | "estesa" | "maratona";

export type ParticipantSex = "m" | "f";

export interface Participant {
  id: string;
  name: string;
  sex?: ParticipantSex;
}

export interface BaraondaInput {
  category: BaraondaCategory;
  formula: BaraondaFormula | null;
  participants: Participant[];
  maxCourts: number;
  autoCourts?: boolean;
}

export interface BaraondaContext {
  category: BaraondaCategory;
  engineMode: BaraondaEngineMode;
  formula: BaraondaFormula | null;

  participants: Participant[];
  playersCount: number;

  maxCourts: number;
  autoCourts: boolean;

  isMixed: boolean;

  maleCount: number;
  femaleCount: number;
  perSexCount: number | null;

  matchesPerPlayer: number;
  totalMatches: number;

  partnerUniqueMax: number;
  repeatMin: number;

  isValidMath: boolean;
  validationErrors: string[];
}

export interface Team {
  a: Participant;
  b: Participant;
}

export interface PlannedMatch {
  team1: Team;
  team2: Team;
  logicalRound?: number;
}

export interface TurnMatch {
  matchNumber: number;
  players: [Participant, Participant, Participant, Participant];
}

export interface Turn {
  turnNumber: number;
  matches: TurnMatch[];
  resting: Participant[];
}

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  summary: string;
  issues: ValidationIssue[];
}

export interface PlayerAudit {
  playerId: string;
  playerName: string;
  matches: number;
  partners: string[];
  partnerRepeats: Record<string, number>;
  opponents: string[];
  rests: number[];
}

export interface TournamentAudit {
  valid: boolean;
  errors: string[];
  warnings: string[];
  players: PlayerAudit[];
  quality: {
    totalPartnerRepeats: number;
    totalOpponentRepeats: number;
    consecutiveRestViolations: number;
  };
}

export interface GenerateBaraondaV2Result {
  context: BaraondaContext;
  turns: Turn[];
  validation: ValidationReport;
  audit: TournamentAudit;
}

export interface PairPlanTeam {
  id: string;
  a: Participant;
  b: Participant;
}

export interface PairRepeatEntry {
  playerAId: string;
  playerBId: string;
  occurrences: number;
}

export interface PairPlanPlayerStats {
  playerId: string;
  playerName: string;
  assignedTeams: number;
  uniquePartners: string[];
  repeatedPartners: Record<string, number>;
}

export type MixedPairPlanPlayerStats = PairPlanPlayerStats;

export interface MixedPairPlan {
  teams: PairPlanTeam[];
  teamsByPlayerId: Record<string, PairPlanTeam[]>;
  statsByPlayerId: Record<string, MixedPairPlanPlayerStats>;
  repeatPairs: PairRepeatEntry[];
}

export interface MixedPairPlanIssue {
  code: string;
  message: string;
}

export interface BuildMixedPairPlanResult {
  ok: boolean;
  pairPlan?: MixedPairPlan;
  issues: MixedPairPlanIssue[];
}

export interface PartnerValidationDetails {
  matchesPerPlayer: Record<string, number>;
  uniquePartnersByPlayer: Record<string, string[]>;
  repeatedPartnersByPlayer: Record<string, Record<string, number>>;
  totalPartnerRepeats: number;
}

export interface PartnerValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  details: PartnerValidationDetails;
}

export interface MatchPlanIssue {
  code: string;
  message: string;
}

export interface BuildMatchPlanResult {
  ok: boolean;
  matches?: PlannedMatch[];
  issues: MatchPlanIssue[];
}

// alias di compatibilità, così non rompiamo eventuali import già esistenti
export type MixedMatchPlanIssue = MatchPlanIssue;
export type BuildMixedMatchPlanResult = BuildMatchPlanResult;

export interface PackTurnsIssue {
  code: string;
  message: string;
}

export interface PackTurnsResult {
  ok: boolean;
  turns?: Turn[];
  issues: PackTurnsIssue[];
}

export interface NonMixedPairPlan {
  teams: PairPlanTeam[];
  statsByPlayerId: Record<string, PairPlanPlayerStats>;
  repeatPairs: PairRepeatEntry[];
}

export interface BuildNonMixedPairPlanResult {
  ok: boolean;
  pairPlan?: NonMixedPairPlan;
  issues: {
    code: string;
    message: string;
  }[];
}