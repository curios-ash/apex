// Conventions for the whole finance engine:
// - Money in and out is integer cents. Outputs are rounded to the nearest cent.
// - Rates are decimal fractions (0.065 = 6.5%).
// - Ratios (cap rate, DSCR, cash-on-cash, IRR) are decimal fractions at full
//   precision; they return null when the denominator is zero so results stay
//   JSON-serializable for dossier payloads.

export type LoanInputs = {
  principalCents: number;
  annualRate: number;
  termMonths: number;
};

export type YearProjection = {
  year: number;
  grossScheduledRentCents: number;
  vacancyLossCents: number;
  otherIncomeCents: number;
  effectiveGrossIncomeCents: number;
  operatingExpensesCents: number;
  noiCents: number;
  debtServiceCents: number;
  reservesCents: number;
  cashFlowBeforeTaxCents: number;
};

export type DealInputs = {
  purchasePriceCents: number;
  closingCostsCents: number;
  initialRepairsCents?: number;
  monthlyRentCents: number;
  otherMonthlyIncomeCents?: number;
  vacancyRate: number;
  annualOperatingExpensesCents: number;
  rentGrowthRate: number;
  expenseGrowthRate: number;
  appreciationRate: number;
  sellingCostRate: number;
  /** Fraction of effective gross income set aside for capital reserves each year. */
  reserveRate: number;
  holdingYears: number;
  loan?: LoanInputs | null;
};

export type DealYearOne = {
  effectiveGrossIncomeCents: number;
  noiCents: number;
  annualDebtServiceCents: number;
  reservesCents: number;
  cashFlowBeforeTaxCents: number;
  totalCashInvestedCents: number;
  capRate: number | null;
  dscr: number | null;
  cashOnCashReturn: number | null;
};

export type DealExit = {
  salePriceCents: number;
  sellingCostsCents: number;
  loanPayoffCents: number;
  netSaleProceedsCents: number;
};

export type DealAnalysis = {
  version: string;
  year1: DealYearOne;
  projection: YearProjection[];
  exit: DealExit;
  /** Levered IRR over the hold: −invested, annual cash flows, final year + net sale. */
  irr: number | null;
};

export type FinanceEngine = {
  effectiveGrossIncome(input: {
    scheduledRentCents: number;
    otherIncomeCents?: number;
    vacancyRate: number;
  }): number;
  noi(input: { effectiveGrossIncomeCents: number; operatingExpensesCents: number }): number;
  monthlyMortgagePayment(loan: LoanInputs): number;
  annualDebtService(loan: LoanInputs): number;
  remainingBalance(loan: LoanInputs & { monthsPaid: number }): number;
  cashFlowBeforeTax(input: {
    noiCents: number;
    annualDebtServiceCents: number;
    reservesCents?: number;
  }): number;
  cashOnCashReturn(input: {
    annualCashFlowCents: number;
    totalCashInvestedCents: number;
  }): number | null;
  dscr(input: { noiCents: number; annualDebtServiceCents: number }): number | null;
  capRate(input: { noiCents: number; propertyValueCents: number }): number | null;
  requiredReserves(input: {
    monthlyOperatingExpensesCents: number;
    monthlyDebtServiceCents: number;
    monthsCovered: number;
  }): number;
  totalCashInvested(input: {
    downPaymentCents: number;
    closingCostsCents: number;
    initialRepairsCents?: number;
  }): number;
  npv(rate: number, cashFlowsCents: number[]): number;
  irr(cashFlowsCents: number[]): number | null;
  projectCashFlows(inputs: DealInputs): YearProjection[];
  analyzeDeal(inputs: DealInputs): DealAnalysis;
};
