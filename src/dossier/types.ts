import type { DealAnalysis, DealInputs } from "@/finance/types";

// The underwriter's pure-TS core: assumptions in, pro forma out. Mirrors the
// conventions of src/finance and src/reconcile — no LLM, no I/O, no system
// clock. Money is integer cents; rates are decimal fractions.
//
// Every number the finance engine consumes is stored as a row in the
// `assumptions` table with source + confidence + version. This module maps
// those rows to DealInputs, applies the downside case, and generates the
// diligence checklist from the deal's gaps. It never computes finance
// outputs itself — that is always `financeV1.analyzeDeal`.

export const DOSSIER_SCHEMA_VERSION = "dossier-v1" as const;

// Assumption keys. Engine inputs are stored in the exact units the engine
// consumes (cents / ratios / months); display fields carry provenance only.
export const ENGINE_ASSUMPTION_KEYS = [
  "purchase_price",
  "closing_costs",
  "initial_repairs",
  "monthly_rent",
  "other_monthly_income",
  "vacancy_rate",
  "property_tax_annual",
  "insurance_annual",
  "hoa_annual",
  "utilities_annual",
  "maintenance_annual",
  "management_fee_annual",
  "other_expenses_annual",
  "rent_growth_rate",
  "expense_growth_rate",
  "appreciation_rate",
  "selling_cost_rate",
  "reserve_rate",
  "holding_years",
  "loan_principal",
  "loan_interest_rate",
  "loan_term_months",
] as const;

export const DOWNSIDE_ASSUMPTION_KEYS = [
  "downside_rent_shock",
  "downside_vacancy_delta",
  "downside_expense_shock",
] as const;

export const DISPLAY_ASSUMPTION_KEYS = [
  "address",
  "bedrooms",
  "bathrooms",
  "sqft",
  "year_built",
  "tenant_occupied",
] as const;

export type EngineAssumptionKey = (typeof ENGINE_ASSUMPTION_KEYS)[number];
export type DownsideAssumptionKey = (typeof DOWNSIDE_ASSUMPTION_KEYS)[number];
export type DisplayAssumptionKey = (typeof DISPLAY_ASSUMPTION_KEYS)[number];
export type AssumptionKey =
  | EngineAssumptionKey
  | DownsideAssumptionKey
  | DisplayAssumptionKey;

export type AssumptionSource = "listing" | "manual" | "default" | "comp";
export type AssumptionConfidence = "low" | "medium" | "high";

// One assumption as the engine sees it: the value plus its provenance.
export interface AssumptionValue {
  key: AssumptionKey;
  valueNum: number | null;
  valueText: string | null;
  unit: "usd_cents" | "ratio" | "months" | "years" | "count" | "text";
  source: AssumptionSource;
  confidence: AssumptionConfidence;
  // Raw DB/source string (e.g. "listing:document:<id>", "comp:rentcast:median").
  // The engine and checklist use `source`; the UI uses this when present.
  sourceRef?: string;
}

export interface DownsideParams {
  // e.g. -0.10 = rents 10% below plan.
  rentShockRate: number;
  // Percentage points added to the vacancy rate, as a fraction (0.05 = +5pp).
  vacancyDelta: number;
  // e.g. 0.15 = operating expenses 15% above plan.
  expenseShockRate: number;
}

export const DEFAULT_DOWNSIDE_PARAMS: DownsideParams = {
  rentShockRate: -0.1,
  vacancyDelta: 0.05,
  expenseShockRate: 0.15,
};

export interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
  severity: "critical" | "important" | "standard";
}

export interface DossierPayload {
  schemaVersion: typeof DOSSIER_SCHEMA_VERSION;
  // The assumptions version this payload was computed from.
  assumptionVersion: number;
  // Injected clock — the engine never reads the system time.
  generatedAt: string;
  address: string | null;
  // False when required inputs (price, rent) are missing; base/downside are
  // null then and the checklist leads with the gaps.
  computable: boolean;
  missingInputs: EngineAssumptionKey[];
  inputs: DealInputs | null;
  base: DealAnalysis | null;
  downside: {
    params: DownsideParams;
    inputs: DealInputs;
    analysis: DealAnalysis;
  } | null;
  checklist: ChecklistItem[];
  // Provenance-only RentCast (or mock) snapshot. Never an engine input —
  // monthly_rent is applied as an assumption row if the owner accepts it.
  comps?: import("@/comps/types").CompSet | null;
}
