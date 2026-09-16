import type { FinanceEngine, YearProjection } from "./types";

export const FINANCE_V1 = "finance-v1" as const;

const roundCents = (value: number): number => Math.round(value);

const effectiveGrossIncome: FinanceEngine["effectiveGrossIncome"] = ({
  scheduledRentCents,
  otherIncomeCents = 0,
  vacancyRate,
}) => roundCents(scheduledRentCents * (1 - vacancyRate) + otherIncomeCents);

const noi: FinanceEngine["noi"] = ({ effectiveGrossIncomeCents, operatingExpensesCents }) =>
  roundCents(effectiveGrossIncomeCents - operatingExpensesCents);

const monthlyMortgagePayment: FinanceEngine["monthlyMortgagePayment"] = ({
  principalCents,
  annualRate,
  termMonths,
}) => {
  if (termMonths <= 0) throw new Error("termMonths must be positive");
  if (principalCents <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return roundCents(principalCents / termMonths);
  return roundCents((principalCents * r) / (1 - Math.pow(1 + r, -termMonths)));
};

const annualDebtService: FinanceEngine["annualDebtService"] = (loan) =>
  roundCents(monthlyMortgagePayment(loan) * 12);

const remainingBalance: FinanceEngine["remainingBalance"] = ({
  principalCents,
  annualRate,
  termMonths,
  monthsPaid,
}) => {
  if (principalCents <= 0) return 0;
  const k = Math.min(Math.max(monthsPaid, 0), termMonths);
  const r = annualRate / 12;
  if (r === 0) return roundCents(principalCents * (1 - k / termMonths));
  // Uses the exact (unrounded) payment so the theoretical curve amortizes to
  // exactly zero; monthlyMortgagePayment's rounded value is for display.
  const exactPayment = (principalCents * r) / (1 - Math.pow(1 + r, -termMonths));
  const growth = Math.pow(1 + r, k);
  const balance = principalCents * growth - exactPayment * ((growth - 1) / r);
  return Math.max(0, roundCents(balance));
};

const cashFlowBeforeTax: FinanceEngine["cashFlowBeforeTax"] = ({
  noiCents,
  annualDebtServiceCents,
  reservesCents = 0,
}) => roundCents(noiCents - annualDebtServiceCents - reservesCents);

const cashOnCashReturn: FinanceEngine["cashOnCashReturn"] = ({
  annualCashFlowCents,
  totalCashInvestedCents,
}) => (totalCashInvestedCents === 0 ? null : annualCashFlowCents / totalCashInvestedCents);

const dscr: FinanceEngine["dscr"] = ({ noiCents, annualDebtServiceCents }) =>
  annualDebtServiceCents === 0 ? null : noiCents / annualDebtServiceCents;

const capRate: FinanceEngine["capRate"] = ({ noiCents, propertyValueCents }) =>
  propertyValueCents === 0 ? null : noiCents / propertyValueCents;

const requiredReserves: FinanceEngine["requiredReserves"] = ({
  monthlyOperatingExpensesCents,
  monthlyDebtServiceCents,
  monthsCovered,
}) => roundCents((monthlyOperatingExpensesCents + monthlyDebtServiceCents) * monthsCovered);

const totalCashInvested: FinanceEngine["totalCashInvested"] = ({
  downPaymentCents,
  closingCostsCents,
  initialRepairsCents = 0,
}) => roundCents(downPaymentCents + closingCostsCents + initialRepairsCents);

const npv: FinanceEngine["npv"] = (rate, cashFlowsCents) =>
  cashFlowsCents.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

const irr: FinanceEngine["irr"] = (cashFlowsCents) => {
  if (cashFlowsCents.length < 2) return null;
  const hasPositive = cashFlowsCents.some((cf) => cf > 0);
  const hasNegative = cashFlowsCents.some((cf) => cf < 0);
  if (!hasPositive || !hasNegative) return null;

  // Bisection on NPV over (-1, 10]: robust for conventional deal cash flows
  // and never diverges, unlike Newton-Raphson on flat NPV curves.
  let lo = -0.999999;
  let hi = 10;
  let fLo = npv(lo, cashFlowsCents);
  const fHi = npv(hi, cashFlowsCents);
  if (fLo === 0) return lo;
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, cashFlowsCents);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
};

const projectCashFlows: FinanceEngine["projectCashFlows"] = (inputs) => {
  const {
    monthlyRentCents,
    otherMonthlyIncomeCents = 0,
    vacancyRate,
    annualOperatingExpensesCents,
    rentGrowthRate,
    expenseGrowthRate,
    reserveRate,
    holdingYears,
    loan = null,
  } = inputs;

  const annualDebtServiceCents = loan ? annualDebtService(loan) : 0;
  const years: YearProjection[] = [];

  for (let year = 1; year <= holdingYears; year++) {
    const growth = Math.pow(1 + rentGrowthRate, year - 1);
    const grossScheduledRentCents = roundCents(monthlyRentCents * 12 * growth);
    const otherIncomeCents = roundCents(otherMonthlyIncomeCents * 12 * growth);
    const vacancyLossCents = roundCents(grossScheduledRentCents * vacancyRate);
    const effectiveGrossIncomeCents =
      grossScheduledRentCents - vacancyLossCents + otherIncomeCents;
    const operatingExpensesCents = roundCents(
      annualOperatingExpensesCents * Math.pow(1 + expenseGrowthRate, year - 1),
    );
    const noiCents = effectiveGrossIncomeCents - operatingExpensesCents;
    const reservesCents = roundCents(effectiveGrossIncomeCents * reserveRate);
    const cashFlow = cashFlowBeforeTax({
      noiCents,
      annualDebtServiceCents,
      reservesCents,
    });
    years.push({
      year,
      grossScheduledRentCents,
      vacancyLossCents,
      otherIncomeCents,
      effectiveGrossIncomeCents,
      operatingExpensesCents,
      noiCents,
      debtServiceCents: annualDebtServiceCents,
      reservesCents,
      cashFlowBeforeTaxCents: cashFlow,
    });
  }
  return years;
};

const analyzeDeal: FinanceEngine["analyzeDeal"] = (inputs) => {
  const loan = inputs.loan ?? null;
  const projection = projectCashFlows(inputs);
  const year1 = projection[0];

  const downPaymentCents = inputs.purchasePriceCents - (loan?.principalCents ?? 0);
  const invested = totalCashInvested({
    downPaymentCents,
    closingCostsCents: inputs.closingCostsCents,
    initialRepairsCents: inputs.initialRepairsCents,
  });

  const salePriceCents = roundCents(
    inputs.purchasePriceCents * Math.pow(1 + inputs.appreciationRate, inputs.holdingYears),
  );
  const sellingCostsCents = roundCents(salePriceCents * inputs.sellingCostRate);
  const loanPayoffCents = loan
    ? remainingBalance({ ...loan, monthsPaid: inputs.holdingYears * 12 })
    : 0;
  const netSaleProceedsCents = salePriceCents - sellingCostsCents - loanPayoffCents;

  const cashFlows = [
    -invested,
    ...projection.map((y, i) =>
      i === projection.length - 1
        ? y.cashFlowBeforeTaxCents + netSaleProceedsCents
        : y.cashFlowBeforeTaxCents,
    ),
  ];

  return {
    version: FINANCE_V1,
    year1: {
      effectiveGrossIncomeCents: year1.effectiveGrossIncomeCents,
      noiCents: year1.noiCents,
      annualDebtServiceCents: year1.debtServiceCents,
      reservesCents: year1.reservesCents,
      cashFlowBeforeTaxCents: year1.cashFlowBeforeTaxCents,
      totalCashInvestedCents: invested,
      capRate: capRate({ noiCents: year1.noiCents, propertyValueCents: inputs.purchasePriceCents }),
      dscr: dscr({ noiCents: year1.noiCents, annualDebtServiceCents: year1.debtServiceCents }),
      cashOnCashReturn: cashOnCashReturn({
        annualCashFlowCents: year1.cashFlowBeforeTaxCents,
        totalCashInvestedCents: invested,
      }),
    },
    projection,
    exit: { salePriceCents, sellingCostsCents, loanPayoffCents, netSaleProceedsCents },
    irr: irr(cashFlows),
  };
};

export const financeV1: FinanceEngine = {
  effectiveGrossIncome,
  noi,
  monthlyMortgagePayment,
  annualDebtService,
  remainingBalance,
  cashFlowBeforeTax,
  cashOnCashReturn,
  dscr,
  capRate,
  requiredReserves,
  totalCashInvested,
  npv,
  irr,
  projectCashFlows,
  analyzeDeal,
};
