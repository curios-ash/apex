import type { transactionCategoryEnum } from "@/lib/db/schema";

// The reconciliation engine is pure TypeScript: no LLM, no I/O, no dates
// from the system clock. Everything it needs comes in as plain data and
// every finding cites the rows it used. Money is integer cents; months are
// first-of-month ISO dates (yyyy-mm-01).

export type TransactionCategory = (typeof transactionCategoryEnum.enumValues)[number];

export const INCOME_CATEGORIES: readonly TransactionCategory[] = [
  "rent",
  "late_fee",
  "application_fee",
  "other_income",
];

export function isIncomeCategory(category: TransactionCategory): boolean {
  return INCOME_CATEGORIES.includes(category);
}

export interface EngineTransaction {
  id: string;
  propertyId: string | null;
  // yyyy-mm-dd
  transactionDate: string;
  description: string;
  // Signed: income positive, expense negative.
  amountCents: number;
  category: TransactionCategory;
  source: "bank" | "pm_statement" | "manual";
  documentId?: string | null;
}

export interface EngineBudgetLine {
  propertyId: string;
  category: TransactionCategory;
  // yyyy-mm-01
  month: string;
  // Magnitude (always >= 0); the sign convention comes from the category
  // group — income categories are expected inflows, the rest outflows.
  amountCents: number;
}

export interface EnginePmAgreement {
  propertyId: string;
  pmCompanyName: string;
  // Management fee in basis points of collected income (800 = 8.00%).
  feeBps: number;
}

export interface ReconcilePropertyMonthInput {
  propertyId: string;
  propertyName: string;
  // Target month, yyyy-mm-01.
  month: string;
  // Full transaction history for the property (any month) — trailing-window
  // rules (repeat repair, insurance/tax jump, work-order aging) look back.
  transactions: EngineTransaction[];
  budgetLines: EngineBudgetLine[];
  pmAgreement: EnginePmAgreement | null;
}

export interface ActualLine {
  propertyId: string;
  category: TransactionCategory;
  month: string;
  // Signed sum of the selected transactions (income positive).
  amountCents: number;
  source: "bank" | "pm_statement" | "manual";
}

export interface CategoryVariance {
  propertyId: string;
  category: TransactionCategory;
  month: string;
  // Budget magnitude as entered (>= 0).
  budgetCents: number;
  // Signed actual (income positive, expense negative).
  actualCents: number;
  // Income: actual - budget (positive = ahead of plan).
  // Expense: |actual| - budget (positive = overspend).
  varianceCents: number;
  // varianceCents / budgetCents; null when the budget is zero.
  variancePct: number | null;
}

export type RuleId =
  | "fee_drift_v1"
  | "duplicate_charge_v1"
  | "repeat_repair_v1"
  | "insurance_tax_jump_v1"
  | "vacancy_vs_plan_v1"
  | "work_order_aging_v1";

export interface RuleEvidence {
  documentId?: string;
  transactionId?: string;
  note?: string;
}

export interface RuleException {
  ruleId: RuleId;
  propertyId: string;
  month: string;
  severity: "info" | "warning" | "critical";
  // Magnitude at stake, always >= 0.
  dollarImpactCents: number;
  summary: string;
  evidence: RuleEvidence[];
  recommendedAction: string;
}

export interface ReconcilePropertyMonthOutput {
  propertyId: string;
  month: string;
  actualLines: ActualLine[];
  variances: CategoryVariance[];
  exceptions: RuleException[];
}

export const RECONCILE_VERSION = "reconcile-v1" as const;

export function monthOf(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

export function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);
}
