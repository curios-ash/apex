import {
  isIncomeCategory,
  monthOf,
  type ActualLine,
  type CategoryVariance,
  type EngineBudgetLine,
  type EngineTransaction,
  type TransactionCategory,
} from "./types";

// Matching transactions to budget lines is category + month based: a
// transaction "matches" the budget line for its property, category, and the
// month of its transaction date. There is no fuzzy line-item matching — the
// budget is a monthly plan per category, not a list of expected payments.

// A property-month is booked from at most one statement source. PM
// statements win when present (they carry the fee lines the audit cares
// about); bank statements cover properties without a PM; manual rows are
// always included. This keeps a bank statement and a PM statement covering
// the same month from double-counting.
export function preferredSource(
  transactions: EngineTransaction[],
): "pm_statement" | "bank" | "manual" {
  if (transactions.some((t) => t.source === "pm_statement")) return "pm_statement";
  if (transactions.some((t) => t.source === "bank")) return "bank";
  return "manual";
}

// Owner draws/distributions are transfers between the PM and the owner, not
// property income or expense. They are excluded from actuals, variances, and
// rules so a draw never inflates the expense lines it flows through.
export const OWNER_DRAW_PATTERN =
  /owner (draw|disbursement|distribution)|distribution to owner/i;

export function selectWorkingTransactions(
  transactions: EngineTransaction[],
): EngineTransaction[] {
  const preferred = preferredSource(transactions);
  return transactions.filter(
    (t) =>
      (t.source === preferred || t.source === "manual") &&
      !OWNER_DRAW_PATTERN.test(t.description),
  );
}

// Sums the working-set transactions of one month into signed actual lines,
// one per category present.
export function computeActualLines(
  workingSet: EngineTransaction[],
  propertyId: string,
  month: string,
): ActualLine[] {
  const byCategory = new Map<TransactionCategory, { amountCents: number; source: ActualLine["source"] }>();
  for (const t of workingSet) {
    if (monthOf(t.transactionDate) !== month) continue;
    const entry = byCategory.get(t.category) ?? { amountCents: 0, source: t.source };
    entry.amountCents += t.amountCents;
    byCategory.set(t.category, entry);
  }
  return [...byCategory.entries()]
    .map(([category, { amountCents, source }]) => ({
      propertyId,
      category,
      month,
      amountCents,
      source,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

// Budget vs actual per category for the month, over the union of budgeted
// and actual categories. Variance sign: positive is favorable for income,
// an overspend for expenses.
export function computeVariances(
  budgetLines: EngineBudgetLine[],
  actualLines: ActualLine[],
  propertyId: string,
  month: string,
): CategoryVariance[] {
  const budgetByCategory = new Map<TransactionCategory, number>();
  for (const b of budgetLines) {
    if (b.month !== month) continue;
    budgetByCategory.set(b.category, (budgetByCategory.get(b.category) ?? 0) + b.amountCents);
  }
  const actualByCategory = new Map<TransactionCategory, number>();
  for (const a of actualLines) {
    if (a.month !== month) continue;
    actualByCategory.set(a.category, (actualByCategory.get(a.category) ?? 0) + a.amountCents);
  }

  const categories = [...new Set([...budgetByCategory.keys(), ...actualByCategory.keys()])].sort();
  return categories.map((category) => {
    const budgetCents = budgetByCategory.get(category) ?? 0;
    const actualCents = actualByCategory.get(category) ?? 0;
    const varianceCents = isIncomeCategory(category)
      ? actualCents - budgetCents
      : Math.abs(actualCents) - budgetCents;
    return {
      propertyId,
      category,
      month,
      budgetCents,
      actualCents,
      varianceCents,
      variancePct: budgetCents === 0 ? null : varianceCents / budgetCents,
    };
  });
}
