import type { AssumptionKey } from "@/dossier";

// Form parsing for the dossier server actions. Forms post dollars and
// percents; the schema and engine speak cents and ratios — the conversion
// happens here, once. Lives outside actions.ts because "use server" modules
// may only export async functions.

function parseDollars(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parsePercent(raw: string): number | null {
  const cleaned = raw.replace(/[%\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

function parseCount(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Form fields use the assumption key names; money fields are dollars, rate
// fields are percents, everything maps 1:1 onto assumption keys.
const MONEY_KEYS = [
  "purchase_price",
  "closing_costs",
  "initial_repairs",
  "monthly_rent",
  "other_monthly_income",
  "property_tax_annual",
  "insurance_annual",
  "hoa_annual",
  "utilities_annual",
  "maintenance_annual",
  "management_fee_annual",
  "other_expenses_annual",
  "loan_principal",
] as const;

const PERCENT_KEYS = [
  "vacancy_rate",
  "rent_growth_rate",
  "expense_growth_rate",
  "appreciation_rate",
  "selling_cost_rate",
  "reserve_rate",
  "loan_interest_rate",
  "downside_rent_shock",
  "downside_vacancy_delta",
  "downside_expense_shock",
] as const;

const COUNT_KEYS = [
  "holding_years",
  "loan_term_months",
  "bedrooms",
  "bathrooms",
  "sqft",
  "year_built",
] as const;

export function parseAssumptionUpdates(
  formData: FormData,
): Partial<Record<AssumptionKey, number | string | null>> {
  const updates: Partial<Record<AssumptionKey, number | string | null>> = {};
  for (const key of MONEY_KEYS) {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const cents = parseDollars(raw);
    if (cents !== null) updates[key] = cents;
  }
  for (const key of PERCENT_KEYS) {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const ratio = parsePercent(raw);
    if (ratio !== null) updates[key] = ratio;
  }
  for (const key of COUNT_KEYS) {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const n = parseCount(raw);
    if (n !== null) updates[key] = n;
  }
  const address = formData.get("address");
  if (typeof address === "string" && address.trim()) updates.address = address.trim();
  return updates;
}
