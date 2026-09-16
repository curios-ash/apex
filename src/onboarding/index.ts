import type { TransactionCategory } from "@/reconcile";

// Pure helpers for the self-serve onboarding wizard (slice 6). No I/O, no
// LLM — the DB binding lives in src/app/(internal)/onboarding/actions.ts.
// Budget suggestions are deterministic: purchase-model numbers come from the
// property record (or a dossier's stored assumptions), history numbers are
// plain averages of actual_lines. Nothing here computes finance outputs.

// --- Form parsing ------------------------------------------------------------

// Dollars ("1,450.00" / "1450" / "$45") -> integer cents; null when blank or
// invalid. Shared by the onboarding server actions and the budget wizard.
export function parseDollarsToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const dollars = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

// --- Workspace slugs -------------------------------------------------------

export function slugifyWorkspaceName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "workspace";
}

// --- Months ----------------------------------------------------------------

// "2026-09-01" + 3 -> "2026-12-01" (UTC-safe, no Date drift).
export function addMonths(firstOfMonth: string, n: number): string {
  const [y, m] = firstOfMonth.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function nextMonths(firstOfMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(firstOfMonth, i));
}

// The three full calendar months before `firstOfMonth`, oldest first.
export function priorMonths(firstOfMonth: string, count = 3): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(firstOfMonth, -(count - i)));
}

// --- Budget suggestions ----------------------------------------------------

export interface BudgetSuggestion {
  source: "dossier" | "property" | "history";
  // Positive cents per category (budget-line convention: magnitudes).
  amounts: Partial<Record<TransactionCategory, number>>;
  // Provenance notes shown in the UI so every prefilled number has a source.
  notes: string[];
}

export interface PurchaseModelInput {
  // Sum of unit market rents from the property record.
  monthlyRentCents: number | null;
  // PM agreement fee in basis points (800 = 8.00%), when one exists.
  pmFeeBps: number | null;
  // Latest assumptions of the property's newest dossier, when one exists.
  dossier: {
    monthlyRentCents: number | null;
    propertyTaxAnnualCents: number | null;
    insuranceAnnualCents: number | null;
    hoaAnnualCents: number | null;
    utilitiesAnnualCents: number | null;
    maintenanceAnnualCents: number | null;
    managementFeeAnnualCents: number | null;
    otherExpensesAnnualCents: number | null;
  } | null;
}

// Path A — "from the purchase model". A dossier's stored assumptions win
// (they are the purchase model); otherwise the property record (unit rents +
// PM fee %) fills rent and mgmt_fee. Annual figures are spread over 12
// months with the remainder dropped (round down, never up).
export function suggestBudgetFromPurchaseModel(input: PurchaseModelInput): BudgetSuggestion {
  const amounts: BudgetSuggestion["amounts"] = {};
  const notes: string[] = [];
  const d = input.dossier;

  const rent = d?.monthlyRentCents ?? input.monthlyRentCents;
  if (rent && rent > 0) {
    amounts.rent = Math.round(rent);
    notes.push(
      d?.monthlyRentCents
        ? "Rent from the dossier's monthly_rent assumption."
        : "Rent from the property's unit market rents.",
    );
  }

  if (d?.managementFeeAnnualCents != null) {
    amounts.mgmt_fee = Math.floor(d.managementFeeAnnualCents / 12);
    notes.push("Management fee from the dossier (annual assumption ÷ 12).");
  } else if (rent && input.pmFeeBps != null) {
    amounts.mgmt_fee = Math.round((rent * input.pmFeeBps) / 10_000);
    notes.push(`Management fee computed as ${(input.pmFeeBps / 100).toFixed(2)}% of rent.`);
  }

  const annuals: [TransactionCategory, number | null | undefined, string][] = [
    ["property_tax", d?.propertyTaxAnnualCents, "Property tax"],
    ["insurance", d?.insuranceAnnualCents, "Insurance"],
    ["hoa", d?.hoaAnnualCents, "HOA"],
    ["utilities", d?.utilitiesAnnualCents, "Utilities"],
    ["maintenance", d?.maintenanceAnnualCents, "Maintenance"],
    ["other_expense", d?.otherExpensesAnnualCents, "Other expenses"],
  ];
  for (const [category, annual, label] of annuals) {
    if (annual != null && annual > 0) {
      amounts[category] = Math.floor(annual / 12);
      notes.push(`${label} from the dossier (annual ÷ 12).`);
    }
  }

  return { source: d ? "dossier" : "property", amounts, notes };
}

// Path B — "from history". Averages actual_lines over the given months;
// months with no line count as 0 (irregular expenses belong in the budget at
// their true average, not their best month). Actual lines are signed, so
// expenses come back as magnitudes.
export function suggestBudgetFromHistory(input: {
  lines: { category: TransactionCategory; month: string; amountCents: number }[];
  months: string[];
}): BudgetSuggestion {
  const { lines, months } = input;
  const amounts: BudgetSuggestion["amounts"] = {};
  if (months.length === 0) return { source: "history", amounts, notes: [] };

  const totals = new Map<TransactionCategory, number>();
  for (const line of lines) {
    if (!months.includes(line.month)) continue;
    totals.set(line.category, (totals.get(line.category) ?? 0) + Math.abs(line.amountCents));
  }
  for (const [category, total] of [...totals.entries()].sort()) {
    amounts[category] = Math.round(total / months.length);
  }

  const notes =
    totals.size > 0
      ? [
          `Averaged ${totals.size} categor${totals.size === 1 ? "y" : "ies"} across ${months.length} month${
            months.length === 1 ? "" : "s"
          } of actuals (${months[0].slice(0, 7)} – ${months[months.length - 1].slice(0, 7)}).`,
        ]
      : [];
  return { source: "history", amounts, notes };
}
