import { financeV1, type DealAnalysis, type DealInputs } from "@/finance";

export const CALCULATOR_ENGINE = "finance-v1";

export type CalculatorInputs = {
  purchasePriceCents: number;
  monthlyRentCents: number;
  otherMonthlyIncomeCents: number;
  vacancyRate: number;
  annualOperatingExpensesCents: number;
  closingCostsCents: number;
  initialRepairsCents: number;
  loanPrincipalCents: number;
  loanInterestRate: number;
  loanTermMonths: number;
  reserveRate: number;
  downsideRentShock: number;
  downsideVacancyDelta: number;
  downsideExpenseShock: number;
};

export const DEFAULT_CALCULATOR_INPUTS: CalculatorInputs = {
  purchasePriceCents: 289_000_00,
  monthlyRentCents: 2_400_00,
  otherMonthlyIncomeCents: 0,
  vacancyRate: 0.05,
  annualOperatingExpensesCents: 8_700_00,
  closingCostsCents: 8_670_00,
  initialRepairsCents: 0,
  loanPrincipalCents: 216_750_00,
  loanInterestRate: 0.065,
  loanTermMonths: 360,
  reserveRate: 0.05,
  downsideRentShock: 0.1,
  downsideVacancyDelta: 0.05,
  downsideExpenseShock: 0.15,
};

export type CalculatorOutputs = {
  engine: typeof CALCULATOR_ENGINE;
  computable: boolean;
  missing: string[];
  inputs: DealInputs | null;
  base: DealAnalysis | null;
  downside: DealAnalysis | null;
  monthlyMortgageCents: number | null;
};

export function missingCalculatorInputs(input: CalculatorInputs): string[] {
  const missing: string[] = [];
  if (!(input.purchasePriceCents > 0)) missing.push("purchase_price");
  if (!(input.monthlyRentCents > 0)) missing.push("monthly_rent");
  return missing;
}

export function toDealInputsFromCalculator(input: CalculatorInputs): DealInputs {
  return {
    purchasePriceCents: input.purchasePriceCents,
    closingCostsCents: input.closingCostsCents,
    initialRepairsCents: input.initialRepairsCents,
    monthlyRentCents: input.monthlyRentCents,
    otherMonthlyIncomeCents: input.otherMonthlyIncomeCents,
    vacancyRate: input.vacancyRate,
    annualOperatingExpensesCents: input.annualOperatingExpensesCents,
    rentGrowthRate: 0.02,
    expenseGrowthRate: 0.02,
    appreciationRate: 0.02,
    sellingCostRate: 0.06,
    reserveRate: input.reserveRate,
    holdingYears: 10,
    loan:
      input.loanPrincipalCents > 0
        ? {
            principalCents: input.loanPrincipalCents,
            annualRate: input.loanInterestRate,
            termMonths: input.loanTermMonths,
          }
        : null,
  };
}

export function applyCalculatorDownside(inputs: DealInputs, shocks: CalculatorInputs): DealInputs {
  const shockedRent = Math.round(inputs.monthlyRentCents * (1 - shocks.downsideRentShock));
  const shockedVacancy = Math.min(0.95, inputs.vacancyRate + shocks.downsideVacancyDelta);
  const shockedOpex = Math.round(
    inputs.annualOperatingExpensesCents * (1 + shocks.downsideExpenseShock),
  );
  return {
    ...inputs,
    monthlyRentCents: shockedRent,
    vacancyRate: shockedVacancy,
    annualOperatingExpensesCents: shockedOpex,
  };
}

export function runCalculator(input: CalculatorInputs): CalculatorOutputs {
  const missing = missingCalculatorInputs(input);
  if (missing.length > 0) {
    return {
      engine: CALCULATOR_ENGINE,
      computable: false,
      missing,
      inputs: null,
      base: null,
      downside: null,
      monthlyMortgageCents: null,
    };
  }

  const dealInputs = toDealInputsFromCalculator(input);
  const base = financeV1.analyzeDeal(dealInputs);
  const downside = financeV1.analyzeDeal(applyCalculatorDownside(dealInputs, input));
  const monthlyMortgageCents =
    dealInputs.loan ? financeV1.monthlyMortgagePayment(dealInputs.loan) : 0;

  return {
    engine: CALCULATOR_ENGINE,
    computable: true,
    missing: [],
    inputs: dealInputs,
    base,
    downside,
    monthlyMortgageCents,
  };
}

export function dollarsToCents(raw: string | number | null | undefined): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw * 100);
  if (typeof raw !== "string") return 0;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function percentToRatio(raw: string | number | null | undefined): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 1 ? raw / 100 : raw;
  if (typeof raw !== "string") return 0;
  const cleaned = raw.replace(/%/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

export function calculatorFromForm(form: {
  purchasePrice?: string;
  monthlyRent?: string;
  otherMonthlyIncome?: string;
  vacancyPercent?: string;
  annualOperatingExpenses?: string;
  closingCosts?: string;
  initialRepairs?: string;
  loanPrincipal?: string;
  interestPercent?: string;
  loanTermMonths?: string;
  reservePercent?: string;
  downsideRentPercent?: string;
  downsideVacancyPoints?: string;
  downsideExpensePercent?: string;
}): CalculatorInputs {
  return {
    purchasePriceCents: dollarsToCents(form.purchasePrice),
    monthlyRentCents: dollarsToCents(form.monthlyRent),
    otherMonthlyIncomeCents: dollarsToCents(form.otherMonthlyIncome),
    vacancyRate: percentToRatio(form.vacancyPercent || "5"),
    annualOperatingExpensesCents: dollarsToCents(form.annualOperatingExpenses),
    closingCostsCents: dollarsToCents(form.closingCosts),
    initialRepairsCents: dollarsToCents(form.initialRepairs),
    loanPrincipalCents: dollarsToCents(form.loanPrincipal),
    loanInterestRate: percentToRatio(form.interestPercent || "6.5"),
    loanTermMonths: Math.max(1, Math.round(Number(form.loanTermMonths || 360)) || 360),
    reserveRate: percentToRatio(form.reservePercent || "5"),
    downsideRentShock: percentToRatio(form.downsideRentPercent || "10"),
    downsideVacancyDelta: percentToRatio(form.downsideVacancyPoints || "5"),
    downsideExpenseShock: percentToRatio(form.downsideExpensePercent || "15"),
  };
}

export function calculatorFromDossierAssumptions(values: {
  purchase_price?: number | null;
  monthly_rent?: number | null;
  other_monthly_income?: number | null;
  vacancy_rate?: number | null;
  property_tax_annual?: number | null;
  insurance_annual?: number | null;
  hoa_annual?: number | null;
  utilities_annual?: number | null;
  maintenance_annual?: number | null;
  management_fee_annual?: number | null;
  other_expenses_annual?: number | null;
  closing_costs?: number | null;
  initial_repairs?: number | null;
  loan_principal?: number | null;
  loan_interest_rate?: number | null;
  loan_term_months?: number | null;
  reserve_rate?: number | null;
  downside_rent_shock?: number | null;
  downside_vacancy_delta?: number | null;
  downside_expense_shock?: number | null;
}): CalculatorInputs {
  const opex = [
    values.property_tax_annual,
    values.insurance_annual,
    values.hoa_annual,
    values.utilities_annual,
    values.maintenance_annual,
    values.management_fee_annual,
    values.other_expenses_annual,
  ].reduce<number>((sum, n) => sum + (n ?? 0), 0);

  return {
    purchasePriceCents: values.purchase_price ?? DEFAULT_CALCULATOR_INPUTS.purchasePriceCents,
    monthlyRentCents: values.monthly_rent ?? DEFAULT_CALCULATOR_INPUTS.monthlyRentCents,
    otherMonthlyIncomeCents: values.other_monthly_income ?? 0,
    vacancyRate: values.vacancy_rate ?? DEFAULT_CALCULATOR_INPUTS.vacancyRate,
    annualOperatingExpensesCents: opex || DEFAULT_CALCULATOR_INPUTS.annualOperatingExpensesCents,
    closingCostsCents: values.closing_costs ?? DEFAULT_CALCULATOR_INPUTS.closingCostsCents,
    initialRepairsCents: values.initial_repairs ?? 0,
    loanPrincipalCents: values.loan_principal ?? DEFAULT_CALCULATOR_INPUTS.loanPrincipalCents,
    loanInterestRate: values.loan_interest_rate ?? DEFAULT_CALCULATOR_INPUTS.loanInterestRate,
    loanTermMonths: values.loan_term_months ?? DEFAULT_CALCULATOR_INPUTS.loanTermMonths,
    reserveRate: values.reserve_rate ?? DEFAULT_CALCULATOR_INPUTS.reserveRate,
    downsideRentShock: Math.abs(values.downside_rent_shock ?? DEFAULT_CALCULATOR_INPUTS.downsideRentShock),
    downsideVacancyDelta:
      values.downside_vacancy_delta ?? DEFAULT_CALCULATOR_INPUTS.downsideVacancyDelta,
    downsideExpenseShock:
      values.downside_expense_shock ?? DEFAULT_CALCULATOR_INPUTS.downsideExpenseShock,
  };
}
