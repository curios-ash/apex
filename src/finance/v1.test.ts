import { describe, expect, it } from "vitest";

import { FINANCE_VERSION, getFinanceEngine } from "./index";
import { FINANCE_V1, financeV1 as f } from "./v1";

describe("engine registry", () => {
  it("resolves finance-v1 as the current version", () => {
    expect(FINANCE_VERSION).toBe("finance-v1");
    expect(getFinanceEngine()).toBe(f);
    expect(getFinanceEngine("finance-v1")).toBe(f);
  });

  it("rejects unknown versions", () => {
    expect(() => getFinanceEngine("finance-v99")).toThrow(/Unknown finance engine/);
  });
});

describe("monthlyMortgagePayment", () => {
  it("matches the textbook payment for $100k at 6% for 30 years", () => {
    // Standard reference: $599.55/month.
    const payment = f.monthlyMortgagePayment({
      principalCents: 10_000_000,
      annualRate: 0.06,
      termMonths: 360,
    });
    expect(payment).toBe(59_955);
  });

  it("scales linearly with principal", () => {
    const payment = f.monthlyMortgagePayment({
      principalCents: 40_000_000,
      annualRate: 0.065,
      termMonths: 360,
    });
    // Standard reference: $2,528.27/month.
    expect(Math.abs(payment - 252_827)).toBeLessThanOrEqual(1);
  });

  it("handles a zero-interest loan as straight-line division", () => {
    expect(
      f.monthlyMortgagePayment({ principalCents: 1_200_000, annualRate: 0, termMonths: 12 }),
    ).toBe(100_000);
  });

  it("returns 0 for a zero principal", () => {
    expect(
      f.monthlyMortgagePayment({ principalCents: 0, annualRate: 0.07, termMonths: 360 }),
    ).toBe(0);
  });

  it("rejects a non-positive term", () => {
    expect(() =>
      f.monthlyMortgagePayment({ principalCents: 100_000, annualRate: 0.06, termMonths: 0 }),
    ).toThrow();
  });
});

describe("annualDebtService", () => {
  it("is twelve monthly payments", () => {
    expect(
      f.annualDebtService({ principalCents: 10_000_000, annualRate: 0.06, termMonths: 360 }),
    ).toBe(719_460);
  });
});

describe("remainingBalance", () => {
  const loan = { principalCents: 10_000_000, annualRate: 0.06, termMonths: 360 };

  it("equals the principal before any payment", () => {
    expect(f.remainingBalance({ ...loan, monthsPaid: 0 })).toBe(10_000_000);
  });

  it("is fully amortized at the end of the term", () => {
    expect(f.remainingBalance({ ...loan, monthsPaid: 360 })).toBe(0);
  });

  it("equals the present value of the remaining payments", () => {
    // Independent check: after k payments, the balance must equal the
    // discounted value of the n−k payments still owed, at the exact payment.
    const k = 60;
    const r = 0.06 / 12;
    const exactPayment = (10_000_000 * r) / (1 - Math.pow(1 + r, -360));
    const pvRemaining = exactPayment * ((1 - Math.pow(1 + r, -(360 - k))) / r);
    expect(
      Math.abs(f.remainingBalance({ ...loan, monthsPaid: k }) - Math.round(pvRemaining)),
    ).toBeLessThanOrEqual(1);
  });

  it("decreases monotonically", () => {
    let prev = f.remainingBalance({ ...loan, monthsPaid: 0 });
    for (const k of [12, 60, 120, 240, 359]) {
      const bal = f.remainingBalance({ ...loan, monthsPaid: k });
      expect(bal).toBeLessThan(prev);
      prev = bal;
    }
  });
});

describe("income, NOI, and ratios", () => {
  // Duplex fixture: 2 × $1,200/mo, $600/yr laundry, 5% vacancy, $10,960 opex.
  const egi = f.effectiveGrossIncome({
    scheduledRentCents: 2_880_000,
    otherIncomeCents: 60_000,
    vacancyRate: 0.05,
  });

  it("computes effective gross income with vacancy loss", () => {
    expect(egi).toBe(2_796_000);
  });

  it("computes NOI as EGI minus operating expenses", () => {
    expect(f.noi({ effectiveGrossIncomeCents: egi, operatingExpensesCents: 1_096_000 })).toBe(
      1_700_000,
    );
  });

  it("computes cap rate", () => {
    expect(f.capRate({ noiCents: 1_700_000, propertyValueCents: 34_000_000 })).toBe(0.05);
  });

  it("computes DSCR", () => {
    expect(f.dscr({ noiCents: 2_000_000, annualDebtServiceCents: 1_000_000 })).toBe(2);
    expect(
      f.dscr({ noiCents: 1_700_000, annualDebtServiceCents: 1_438_920 }),
    ).toBeCloseTo(1.1814, 3);
  });

  it("computes cash-on-cash return", () => {
    expect(
      f.cashOnCashReturn({ annualCashFlowCents: 500_000, totalCashInvestedCents: 10_000_000 }),
    ).toBe(0.05);
  });

  it("returns null ratios for zero denominators so results stay JSON-safe", () => {
    expect(f.capRate({ noiCents: 1_700_000, propertyValueCents: 0 })).toBeNull();
    expect(f.dscr({ noiCents: 1_700_000, annualDebtServiceCents: 0 })).toBeNull();
    expect(
      f.cashOnCashReturn({ annualCashFlowCents: 500_000, totalCashInvestedCents: 0 }),
    ).toBeNull();
  });
});

describe("cashFlowBeforeTax", () => {
  it("subtracts debt service and reserves from NOI", () => {
    expect(
      f.cashFlowBeforeTax({
        noiCents: 1_700_000,
        annualDebtServiceCents: 1_438_920,
        reservesCents: 139_800,
      }),
    ).toBe(121_280);
  });

  it("defaults reserves to zero", () => {
    expect(
      f.cashFlowBeforeTax({ noiCents: 1_700_000, annualDebtServiceCents: 1_438_920 }),
    ).toBe(261_080);
  });
});

describe("requiredReserves", () => {
  it("covers the requested months of opex plus debt service", () => {
    expect(
      f.requiredReserves({
        monthlyOperatingExpensesCents: 90_000,
        monthlyDebtServiceCents: 119_910,
        monthsCovered: 6,
      }),
    ).toBe(1_259_460);
  });
});

describe("totalCashInvested", () => {
  it("sums down payment, closing costs, and initial repairs", () => {
    expect(
      f.totalCashInvested({
        downPaymentCents: 6_000_000,
        closingCostsCents: 600_000,
        initialRepairsCents: 450_000,
      }),
    ).toBe(7_050_000);
  });
});

describe("npv", () => {
  it("discounts each cash flow by its period", () => {
    const value = f.npv(0.1, [-100_000, 60_000, 60_000]);
    expect(value).toBeCloseTo(4_132.23, 2);
  });

  it("is the plain sum at a zero rate", () => {
    expect(f.npv(0, [-100_000, 60_000, 60_000])).toBe(20_000);
  });
});

describe("irr", () => {
  it("solves the canonical doubling-style cash flow", () => {
    // $1,000 grows at 10% for 4 years to $1,464.10.
    const rate = f.irr([-100_000, 0, 0, 0, 146_410]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.1, 6);
  });

  it("drives NPV to zero for a realistic deal stream", () => {
    const cashFlows = [-6_600_000, -246_704, -190_104, -132_052, 120_000, 25_500_000];
    const rate = f.irr(cashFlows);
    expect(rate).not.toBeNull();
    expect(Math.abs(f.npv(rate!, cashFlows))).toBeLessThan(0.01);
  });

  it("returns null when there is no sign change", () => {
    expect(f.irr([100_000, 200_000])).toBeNull();
    expect(f.irr([-100_000, -200_000])).toBeNull();
  });

  it("returns null for degenerate input", () => {
    expect(f.irr([])).toBeNull();
    expect(f.irr([-100_000])).toBeNull();
  });
});

describe("projectCashFlows", () => {
  const base = {
    purchasePriceCents: 30_000_000,
    closingCostsCents: 600_000,
    monthlyRentCents: 200_000,
    vacancyRate: 0.05,
    annualOperatingExpensesCents: 800_000,
    rentGrowthRate: 0.03,
    expenseGrowthRate: 0.02,
    appreciationRate: 0.02,
    sellingCostRate: 0.06,
    reserveRate: 0,
    holdingYears: 3,
    loan: null,
  };

  it("matches hand-computed year-by-year values", () => {
    const years = f.projectCashFlows(base);
    expect(years).toHaveLength(3);

    expect(years[0]).toMatchObject({
      year: 1,
      grossScheduledRentCents: 2_400_000,
      vacancyLossCents: 120_000,
      effectiveGrossIncomeCents: 2_280_000,
      operatingExpensesCents: 800_000,
      noiCents: 1_480_000,
      debtServiceCents: 0,
      cashFlowBeforeTaxCents: 1_480_000,
    });

    expect(years[1]).toMatchObject({
      grossScheduledRentCents: 2_472_000,
      vacancyLossCents: 123_600,
      effectiveGrossIncomeCents: 2_348_400,
      operatingExpensesCents: 816_000,
      noiCents: 1_532_400,
    });

    expect(years[2]).toMatchObject({
      grossScheduledRentCents: 2_546_160,
      vacancyLossCents: 127_308,
      effectiveGrossIncomeCents: 2_418_852,
      operatingExpensesCents: 832_320,
      noiCents: 1_586_532,
    });
  });

  it("produces identical years when all growth rates are zero", () => {
    const years = f.projectCashFlows({
      ...base,
      rentGrowthRate: 0,
      expenseGrowthRate: 0,
      holdingYears: 10,
    });
    expect(years).toHaveLength(10);
    for (const year of years) {
      expect(year.noiCents).toBe(years[0].noiCents);
      expect(year.grossScheduledRentCents).toBe(2_400_000);
    }
  });

  it("carries constant debt service across the projection", () => {
    const loan = { principalCents: 24_000_000, annualRate: 0.06, termMonths: 360 };
    const years = f.projectCashFlows({ ...base, loan, holdingYears: 5 });
    for (const year of years) {
      expect(year.debtServiceCents).toBe(1_726_704);
      expect(year.cashFlowBeforeTaxCents).toBe(
        year.noiCents - year.debtServiceCents - year.reservesCents,
      );
    }
  });

  it("withholds reserves as a fraction of EGI", () => {
    const years = f.projectCashFlows({ ...base, reserveRate: 0.05, holdingYears: 2 });
    expect(years[0].reservesCents).toBe(114_000);
    expect(years[0].cashFlowBeforeTaxCents).toBe(1_480_000 - 114_000);
    expect(years[1].reservesCents).toBe(117_420);
  });
});

describe("analyzeDeal", () => {
  const analysis = f.analyzeDeal({
    purchasePriceCents: 30_000_000,
    closingCostsCents: 600_000,
    monthlyRentCents: 200_000,
    vacancyRate: 0.05,
    annualOperatingExpensesCents: 800_000,
    rentGrowthRate: 0.03,
    expenseGrowthRate: 0.02,
    appreciationRate: 0.02,
    sellingCostRate: 0.06,
    reserveRate: 0,
    holdingYears: 5,
    loan: { principalCents: 24_000_000, annualRate: 0.06, termMonths: 360 },
  });

  it("tags the output with the formula version", () => {
    expect(analysis.version).toBe(FINANCE_V1);
  });

  it("computes year-1 metrics", () => {
    expect(analysis.year1.noiCents).toBe(1_480_000);
    expect(analysis.year1.annualDebtServiceCents).toBe(1_726_704);
    expect(analysis.year1.cashFlowBeforeTaxCents).toBe(-246_704);
    expect(analysis.year1.totalCashInvestedCents).toBe(6_600_000);
    expect(analysis.year1.capRate).toBeCloseTo(0.049333, 5);
    expect(analysis.year1.dscr).toBeCloseTo(0.85713, 4);
    expect(analysis.year1.cashOnCashReturn).toBeCloseTo(-0.03738, 4);
  });

  it("computes the exit with appreciation, selling costs, and loan payoff", () => {
    expect(analysis.exit.salePriceCents).toBe(33_122_424);
    expect(analysis.exit.sellingCostsCents).toBe(1_987_345);
    expect(analysis.exit.loanPayoffCents).toBe(
      f.remainingBalance({
        principalCents: 24_000_000,
        annualRate: 0.06,
        termMonths: 360,
        monthsPaid: 60,
      }),
    );
    expect(analysis.exit.netSaleProceedsCents).toBe(
      analysis.exit.salePriceCents -
        analysis.exit.sellingCostsCents -
        analysis.exit.loanPayoffCents,
    );
  });

  it("produces a levered IRR whose NPV is zero", () => {
    expect(analysis.irr).not.toBeNull();
    const cashFlows = [
      -analysis.year1.totalCashInvestedCents,
      ...analysis.projection.map((y, i) =>
        i === analysis.projection.length - 1
          ? y.cashFlowBeforeTaxCents + analysis.exit.netSaleProceedsCents
          : y.cashFlowBeforeTaxCents,
      ),
    ];
    expect(Math.abs(f.npv(analysis.irr!, cashFlows))).toBeLessThan(0.01);
  });

  it("handles an all-cash purchase", () => {
    const cashDeal = f.analyzeDeal({
      purchasePriceCents: 30_000_000,
      closingCostsCents: 600_000,
      monthlyRentCents: 200_000,
      vacancyRate: 0.05,
      annualOperatingExpensesCents: 800_000,
      rentGrowthRate: 0.03,
      expenseGrowthRate: 0.02,
      appreciationRate: 0.02,
      sellingCostRate: 0.06,
      reserveRate: 0,
      holdingYears: 10,
      loan: null,
    });
    expect(cashDeal.projection).toHaveLength(10);
    expect(cashDeal.year1.annualDebtServiceCents).toBe(0);
    expect(cashDeal.year1.dscr).toBeNull();
    expect(cashDeal.exit.loanPayoffCents).toBe(0);
    expect(cashDeal.year1.totalCashInvestedCents).toBe(30_600_000);
    expect(cashDeal.irr).not.toBeNull();
  });
});
