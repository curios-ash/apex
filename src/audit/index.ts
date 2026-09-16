import { duplicateCharges, feeDrift, unexplainedFees, workOrderAging } from "./rules";
import type { AuditResult, AuditLine } from "./types";
import { STATEMENT_AUDIT_VERSION } from "./types";

// Runs the full statement-audit rule set over one owner statement's lines.
// `feeBps` is the management-fee percentage from the owner's agreement
// (800 = 8.00%). Pure and deterministic — same lines, same flags.
export function auditStatement(lines: AuditLine[], feeBps: number): AuditResult {
  const flags = [
    ...feeDrift(lines, feeBps),
    ...duplicateCharges(lines),
    ...unexplainedFees(lines),
    ...workOrderAging(lines),
  ].sort((a, b) => b.dollarImpactCents - a.dollarImpactCents);

  return {
    version: STATEMENT_AUDIT_VERSION,
    flags,
    totalFlaggedCents: flags.reduce((sum, f) => sum + f.dollarImpactCents, 0),
    lineCount: lines.length,
  };
}

export * from "./types";
