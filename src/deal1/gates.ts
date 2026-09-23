import { FINANCE_VERSION, finance, type DealInputs } from "@/finance";

// Starting buy box for a first small rental. Huntsville, wide ceiling $350k,
// Deal #1 pass line $275k, 2–4 units, fully leased, no heavy rehab, 25% down,
// fixed rate, DSCR 1.20. The pass/fail line is price and DSCR only.
export const DEFAULT_DEAL1_GATES: Deal1Gates = {
  place: "Huntsville, AL",
  wideCeilingCents: 350_000_00,
  passLineCents: 275_000_00,
  minUnits: 2,
  maxUnits: 4,
  fullyLeasedRequired: true,
  noHeavyRehabRequired: true,
  downPaymentRate: 0.25,
  annualRate: 0.065,
  dscrGate: 1.2,
};

// Blank score fields fall back to these. Rent and operating expenses match the
// existing calculator defaults so a blank form is an estimate, not a new model.
// Price and rate fall back to the saved gates (pass line and fixed rate).
export const DEAL1_ESTIMATES = {
  monthlyRentCents: 2_400_00,
  vacancyRate: 0.05,
  annualOperatingExpensesCents: 8_700_00,
  units: 2,
  fullyLeased: true,
  heavyRehab: false,
  termMonths: 360,
} as const;

export type InputSource = "estimate" | "entered";

export type Sourced<T> = {
  value: T;
  source: InputSource;
};

export type Deal1Gates = {
  place: string;
  wideCeilingCents: number;
  passLineCents: number;
  minUnits: number;
  maxUnits: number;
  fullyLeasedRequired: boolean;
  noHeavyRehabRequired: boolean;
  downPaymentRate: number;
  annualRate: number;
  dscrGate: number;
};

export type Deal1Underwriting = {
  purchasePriceCents: Sourced<number>;
  monthlyRentCents: Sourced<number>;
  vacancyRate: Sourced<number>;
  annualOperatingExpensesCents: Sourced<number>;
  annualRate: Sourced<number>;
  units: Sourced<number>;
  fullyLeased: Sourced<boolean>;
  heavyRehab: Sourced<boolean>;
};

export type Deal1Score = {
  engine: typeof FINANCE_VERSION;
  noiCents: number;
  dscr: number | null;
  cashFlowBeforeTaxCents: number;
  annualDebtServiceCents: number;
  pricePass: boolean;
  dscrPass: boolean;
  pass: boolean;
};

const DSCR_EPSILON = 1e-9;

export function dealInputsForScore(gates: Deal1Gates, input: Deal1Underwriting): DealInputs {
  const price = input.purchasePriceCents.value;
  const downPaymentCents = Math.round(price * gates.downPaymentRate);
  const principalCents = Math.max(0, price - downPaymentCents);
  return {
    purchasePriceCents: price,
    closingCostsCents: 0,
    initialRepairsCents: 0,
    monthlyRentCents: input.monthlyRentCents.value,
    otherMonthlyIncomeCents: 0,
    vacancyRate: input.vacancyRate.value,
    annualOperatingExpensesCents: input.annualOperatingExpensesCents.value,
    rentGrowthRate: 0,
    expenseGrowthRate: 0,
    appreciationRate: 0,
    sellingCostRate: 0,
    reserveRate: 0,
    holdingYears: 1,
    loan:
      principalCents > 0
        ? {
            principalCents,
            annualRate: input.annualRate.value,
            termMonths: DEAL1_ESTIMATES.termMonths,
          }
        : null,
  };
}

// NOI, DSCR, and cash flow are the finance engine's year-1 figures.
// Pass means price is at or under the Deal #1 line and DSCR meets the gate.
export function scoreDeal1(gates: Deal1Gates, input: Deal1Underwriting): Deal1Score {
  const dealInputs = dealInputsForScore(gates, input);
  const analysis = finance.analyzeDeal(dealInputs);
  const pricePass = input.purchasePriceCents.value <= gates.passLineCents;
  const dscr = analysis.year1.dscr;
  const dscrPass = dscr !== null && dscr + DSCR_EPSILON >= gates.dscrGate;
  return {
    engine: FINANCE_VERSION,
    noiCents: analysis.year1.noiCents,
    dscr,
    cashFlowBeforeTaxCents: analysis.year1.cashFlowBeforeTaxCents,
    annualDebtServiceCents: analysis.year1.annualDebtServiceCents,
    pricePass,
    dscrPass,
    pass: pricePass && dscrPass,
  };
}

export function buyBoxNotes(
  gates: Deal1Gates,
  input: { units: number; fullyLeased: boolean; heavyRehab: boolean; purchasePriceCents: number },
): string[] {
  const notes: string[] = [];
  if (input.units < gates.minUnits || input.units > gates.maxUnits) {
    notes.push(`${input.units} units is outside the ${gates.minUnits}–${gates.maxUnits} unit gate.`);
  }
  if (gates.fullyLeasedRequired && !input.fullyLeased) {
    notes.push("Not fully leased. The buy box wants a leased building.");
  }
  if (gates.noHeavyRehabRequired && input.heavyRehab) {
    notes.push("Heavy rehab. The buy box wants a building that does not need one.");
  }
  if (input.purchasePriceCents > gates.wideCeilingCents) {
    notes.push("Above the wide ceiling. The Deal #1 line is the pass/fail price.");
  }
  return notes;
}
