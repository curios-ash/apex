import type { DealInputs } from "@/finance/types";

import type {
  AssumptionKey,
  AssumptionValue,
  DownsideParams,
  EngineAssumptionKey,
} from "./types";
import { DEFAULT_DOWNSIDE_PARAMS, DOWNSIDE_ASSUMPTION_KEYS } from "./types";

// Defaults for anything the listing (or the user) did not state. Stored as
// explicit values with source "default" and confidence "low" so the pro
// forma is fully reproducible and the checklist can flag each one for
// verification. Defaults that derive from price/rent are computed once at
// creation time; after that they are ordinary stored assumptions.

export interface DefaultContext {
  purchasePriceCents: number | null;
  monthlyRentCents: number | null;
}

const RATIO_DEFAULTS: Partial<Record<EngineAssumptionKey, number>> = {
  vacancy_rate: 0.05,
  rent_growth_rate: 0.02,
  expense_growth_rate: 0.02,
  appreciation_rate: 0.02,
  selling_cost_rate: 0.06,
  reserve_rate: 0.05,
  loan_interest_rate: 0.065,
};

export const DEFAULT_HOLDING_YEARS = 10;
export const DEFAULT_LOAN_TERM_MONTHS = 360;
// 25% down is the conventional investor loan.
export const DEFAULT_LOAN_FRACTION = 0.75;
export const DEFAULT_CLOSING_COST_RATE = 0.03;
// County tax and landlord-policy placeholders, as fractions of price.
export const DEFAULT_PROPERTY_TAX_RATE = 0.011;
export const DEFAULT_INSURANCE_RATE = 0.005;
// Maintenance and management as fractions of scheduled rent.
export const DEFAULT_MAINTENANCE_RATE = 0.05;
export const DEFAULT_MANAGEMENT_FEE_RATE = 0.08;

export const ASSUMPTION_UNITS: Record<AssumptionKey, AssumptionValue["unit"]> = {
  purchase_price: "usd_cents",
  closing_costs: "usd_cents",
  initial_repairs: "usd_cents",
  monthly_rent: "usd_cents",
  other_monthly_income: "usd_cents",
  vacancy_rate: "ratio",
  property_tax_annual: "usd_cents",
  insurance_annual: "usd_cents",
  hoa_annual: "usd_cents",
  utilities_annual: "usd_cents",
  maintenance_annual: "usd_cents",
  management_fee_annual: "usd_cents",
  other_expenses_annual: "usd_cents",
  rent_growth_rate: "ratio",
  expense_growth_rate: "ratio",
  appreciation_rate: "ratio",
  selling_cost_rate: "ratio",
  reserve_rate: "ratio",
  holding_years: "years",
  loan_principal: "usd_cents",
  loan_interest_rate: "ratio",
  loan_term_months: "months",
  downside_rent_shock: "ratio",
  downside_vacancy_delta: "ratio",
  downside_expense_shock: "ratio",
  address: "text",
  bedrooms: "count",
  bathrooms: "count",
  sqft: "count",
  year_built: "count",
  tenant_occupied: "count",
};

export function defaultValueFor(
  key: EngineAssumptionKey,
  ctx: DefaultContext,
): number {
  const price = ctx.purchasePriceCents ?? 0;
  const annualRent = (ctx.monthlyRentCents ?? 0) * 12;
  switch (key) {
    case "purchase_price":
      return ctx.purchasePriceCents ?? 0;
    case "closing_costs":
      return Math.round(price * DEFAULT_CLOSING_COST_RATE);
    case "initial_repairs":
      return 0;
    case "monthly_rent":
      return ctx.monthlyRentCents ?? 0;
    case "other_monthly_income":
      return 0;
    case "property_tax_annual":
      return Math.round(price * DEFAULT_PROPERTY_TAX_RATE);
    case "insurance_annual":
      return Math.round(price * DEFAULT_INSURANCE_RATE);
    case "hoa_annual":
    case "utilities_annual":
    case "other_expenses_annual":
      return 0;
    case "maintenance_annual":
      return Math.round(annualRent * DEFAULT_MAINTENANCE_RATE);
    case "management_fee_annual":
      return Math.round(annualRent * DEFAULT_MANAGEMENT_FEE_RATE);
    case "holding_years":
      return DEFAULT_HOLDING_YEARS;
    case "loan_principal":
      return Math.round(price * DEFAULT_LOAN_FRACTION);
    case "loan_term_months":
      return DEFAULT_LOAN_TERM_MONTHS;
    default:
      return RATIO_DEFAULTS[key] ?? 0;
  }
}

export function defaultDownsideParams(): AssumptionValue[] {
  return DOWNSIDE_ASSUMPTION_KEYS.map((key) => ({
    key,
    valueNum:
      key === "downside_rent_shock"
        ? DEFAULT_DOWNSIDE_PARAMS.rentShockRate
        : key === "downside_vacancy_delta"
          ? DEFAULT_DOWNSIDE_PARAMS.vacancyDelta
          : DEFAULT_DOWNSIDE_PARAMS.expenseShockRate,
    valueText: null,
    unit: "ratio" as const,
    source: "default" as const,
    confidence: "low" as const,
  }));
}

// ---------------------------------------------------------------------------
// Assumption set -> engine inputs
// ---------------------------------------------------------------------------

export function numValue(
  assumptions: ReadonlyMap<AssumptionKey, AssumptionValue>,
  key: EngineAssumptionKey,
): number {
  return assumptions.get(key)?.valueNum ?? 0;
}

// The inputs the pro forma cannot be computed without.
export const REQUIRED_INPUTS: EngineAssumptionKey[] = ["purchase_price", "monthly_rent"];

export function missingRequiredInputs(
  assumptions: ReadonlyMap<AssumptionKey, AssumptionValue>,
): EngineAssumptionKey[] {
  return REQUIRED_INPUTS.filter((key) => numValue(assumptions, key) <= 0);
}

export function toDealInputs(
  assumptions: ReadonlyMap<AssumptionKey, AssumptionValue>,
): DealInputs {
  const get = (key: EngineAssumptionKey) => numValue(assumptions, key);
  const annualOperatingExpensesCents =
    get("property_tax_annual") +
    get("insurance_annual") +
    get("hoa_annual") +
    get("utilities_annual") +
    get("maintenance_annual") +
    get("management_fee_annual") +
    get("other_expenses_annual");

  const loanPrincipal = get("loan_principal");
  const loan =
    loanPrincipal > 0
      ? {
          principalCents: loanPrincipal,
          annualRate: get("loan_interest_rate"),
          termMonths: Math.max(1, Math.round(get("loan_term_months"))),
        }
      : null;

  return {
    purchasePriceCents: get("purchase_price"),
    closingCostsCents: get("closing_costs"),
    initialRepairsCents: get("initial_repairs"),
    monthlyRentCents: get("monthly_rent"),
    otherMonthlyIncomeCents: get("other_monthly_income"),
    vacancyRate: get("vacancy_rate"),
    annualOperatingExpensesCents,
    rentGrowthRate: get("rent_growth_rate"),
    expenseGrowthRate: get("expense_growth_rate"),
    appreciationRate: get("appreciation_rate"),
    sellingCostRate: get("selling_cost_rate"),
    reserveRate: get("reserve_rate"),
    holdingYears: Math.max(1, Math.round(get("holding_years"))),
    loan,
  };
}

export function downsideParamsFrom(
  assumptions: ReadonlyMap<AssumptionKey, AssumptionValue>,
): DownsideParams {
  return {
    rentShockRate:
      assumptions.get("downside_rent_shock")?.valueNum ?? DEFAULT_DOWNSIDE_PARAMS.rentShockRate,
    vacancyDelta:
      assumptions.get("downside_vacancy_delta")?.valueNum ?? DEFAULT_DOWNSIDE_PARAMS.vacancyDelta,
    expenseShockRate:
      assumptions.get("downside_expense_shock")?.valueNum ??
      DEFAULT_DOWNSIDE_PARAMS.expenseShockRate,
  };
}

// The downside case: rent shocked down, vacancy up by percentage points,
// operating expenses shocked up. Financing terms are unchanged — the loan
// does not renegotiate itself when the deal gets worse.
export function applyDownside(inputs: DealInputs, params: DownsideParams): DealInputs {
  return {
    ...inputs,
    monthlyRentCents: Math.round(inputs.monthlyRentCents * (1 + params.rentShockRate)),
    vacancyRate: Math.min(1, Math.max(0, inputs.vacancyRate + params.vacancyDelta)),
    annualOperatingExpensesCents: Math.round(
      inputs.annualOperatingExpensesCents * (1 + params.expenseShockRate),
    ),
  };
}
