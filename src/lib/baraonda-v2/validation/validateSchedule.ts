import type {
  BaraondaContext,
  Participant,
  Turn,
  ValidationIssue,
  ValidationReport,
} from "../domain/types";

import { validateStructure } from "./validateStructure";
import { validateEquity } from "./validateEquity";
import { validatePartners } from "./validatePartners";
import { validateRests } from "./validateRests";

export function validateSchedule(
  context: BaraondaContext,
  turns: Turn[],
  participants: Participant[]
): ValidationReport {
  const structureReport = validateStructure(context, turns, participants);
  const equityReport = validateEquity(context, turns, participants);
  const partnerReport = validatePartners(context, turns, participants);
  const restsReport = validateRests(context, turns, participants);

  const issues: ValidationIssue[] = [
    ...structureReport.issues,
    ...equityReport.issues,
    ...partnerReport.issues,
    ...restsReport.issues,
  ];

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    summary: buildSummary(issues),
    issues,
  };
}

function buildSummary(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return "Schedule valida";
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;

  return `Schedule non valida: ${errors} errori, ${warnings} warning`;
}