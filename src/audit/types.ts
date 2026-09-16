import type { TransactionCategory } from "@/reconcile";

// The free PM Statement Audit engine: pure TypeScript over the lines of a
// single owner statement plus the management-fee percentage the owner typed
// in. No DB, no workspace, no clock — anonymous uploads are processed in
// memory and never persisted, so this module only sees plain data.

export const STATEMENT_AUDIT_VERSION = "statement-audit-v1" as const;

export interface AuditLine {
  // yyyy-mm-dd when the statement states one, else null.
  date: string | null;
  description: string;
  // Signed: income positive, expense negative.
  amountCents: number;
  category: TransactionCategory | null;
}

export type AuditRuleId =
  | "fee_drift"
  | "duplicate_charge"
  | "unexplained_fee"
  | "work_order_aging";

export interface AuditFlag {
  ruleId: AuditRuleId;
  severity: "info" | "warning" | "critical";
  // Magnitude at stake, always >= 0.
  dollarImpactCents: number;
  summary: string;
  detail: string;
  // The statement lines behind the finding (descriptions + dates), so the
  // owner can see exactly what fired without us storing their statement.
  lines: { date: string | null; description: string; amountCents: number }[];
}

export interface AuditResult {
  version: typeof STATEMENT_AUDIT_VERSION;
  flags: AuditFlag[];
  totalFlaggedCents: number;
  lineCount: number;
}
