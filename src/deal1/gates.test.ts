import { describe, expect, it } from "vitest";

import { finance } from "@/finance";

import {
  DEFAULT_DEAL1_GATES,
  buyBoxNotes,
  dealInputsForScore,
  scoreDeal1,
  type Deal1Underwriting,
} from "./gates";

const SOURCE = { source: "entered" as const };

function underwriting(priceCents: number, noiCents: number): Deal1Underwriting {
  // Vacancy 0 so year-1 NOI is rent × 12 − operating expenses, in cents.
  const monthlyRentCents = Math.ceil(noiCents / 12);
  const annualOperatingExpensesCents = monthlyRentCents * 12 - noiCents;
  return {
    purchasePriceCents: { value: priceCents, ...SOURCE },
    monthlyRentCents: { value: monthlyRentCents, ...SOURCE },
    vacancyRate: { value: 0, ...SOURCE },
    annualOperatingExpensesCents: { value: annualOperatingExpensesCents, ...SOURCE },
    annualRate: { value: DEFAULT_DEAL1_GATES.annualRate, ...SOURCE },
    units: { value: 2, ...SOURCE },
    fullyLeased: { value: true, ...SOURCE },
    heavyRehab: { value: false, ...SOURCE },
  };
}

function debtAndNoiBoundary(priceCents: number) {
  const sample = underwriting(priceCents, 1);
  const loan = dealInputsForScore(DEFAULT_DEAL1_GATES, sample).loan;
  if (!loan) throw new Error("expected a loan at 25% down");
  const annualDebtServiceCents = finance.annualDebtService(loan);
  let noiPassCents = Math.ceil(annualDebtServiceCents * DEFAULT_DEAL1_GATES.dscrGate);
  while (noiPassCents / annualDebtServiceCents < DEFAULT_DEAL1_GATES.dscrGate) noiPassCents += 1;
  return { annualDebtServiceCents, noiPassCents, noiFailCents: noiPassCents - 1 };
}

describe("Deal #1 line", () => {
  const price = DEFAULT_DEAL1_GATES.passLineCents;
  const { noiPassCents, noiFailCents, annualDebtServiceCents } = debtAndNoiBoundary(price);

  it("passes at $275k when finance-v1 DSCR is at least 1.20", () => {
    const input = underwriting(price, noiPassCents);
    const analysis = finance.analyzeDeal(dealInputsForScore(DEFAULT_DEAL1_GATES, input));
    const score = scoreDeal1(DEFAULT_DEAL1_GATES, input);

    expect(score.engine).toBe("finance-v1");
    expect(score.noiCents).toBe(analysis.year1.noiCents);
    expect(score.dscr).toBe(analysis.year1.dscr);
    expect(score.cashFlowBeforeTaxCents).toBe(analysis.year1.cashFlowBeforeTaxCents);
    expect(score.noiCents).toBe(noiPassCents);
    expect(score.dscr).not.toBeNull();
    expect(score.dscr!).toBeGreaterThanOrEqual(1.2);
    expect(score.noiCents / annualDebtServiceCents).toBeGreaterThanOrEqual(1.2);
    expect(score.pricePass).toBe(true);
    expect(score.dscrPass).toBe(true);
    expect(score.pass).toBe(true);
  });

  it("fails one cent over the $275k line even when DSCR clears 1.20", () => {
    const comfortableNoi = noiPassCents + 50_000_00;
    const score = scoreDeal1(DEFAULT_DEAL1_GATES, underwriting(price + 1, comfortableNoi));
    expect(score.pricePass).toBe(false);
    expect(score.dscrPass).toBe(true);
    expect(score.pass).toBe(false);
  });

  it("fails the wide ceiling price when it is over the Deal #1 line", () => {
    const score = scoreDeal1(
      DEFAULT_DEAL1_GATES,
      underwriting(DEFAULT_DEAL1_GATES.wideCeilingCents, noiPassCents + 50_000_00),
    );
    expect(DEFAULT_DEAL1_GATES.wideCeilingCents).toBe(350_000_00);
    expect(score.pricePass).toBe(false);
    expect(score.pass).toBe(false);
  });

  it("fails when finance-v1 DSCR is under 1.20 at the $275k line", () => {
    const input = underwriting(price, noiFailCents);
    const analysis = finance.analyzeDeal(dealInputsForScore(DEFAULT_DEAL1_GATES, input));
    const score = scoreDeal1(DEFAULT_DEAL1_GATES, input);

    expect(score.noiCents).toBe(analysis.year1.noiCents);
    expect(score.dscr).toBe(analysis.year1.dscr);
    expect(score.dscr).not.toBeNull();
    expect(score.dscr!).toBeLessThan(1.2);
    expect(score.pricePass).toBe(true);
    expect(score.dscrPass).toBe(false);
    expect(score.pass).toBe(false);
  });

  it("uses a custom DSCR gate without recomputing outside the engine", () => {
    const gates = { ...DEFAULT_DEAL1_GATES, dscrGate: 1.5 };
    const score = scoreDeal1(gates, underwriting(price, noiPassCents));
    expect(score.dscrPass).toBe(false);
    expect(score.pass).toBe(false);
    expect(score.dscr).toBe(
      finance.analyzeDeal(dealInputsForScore(gates, underwriting(price, noiPassCents))).year1.dscr,
    );
  });

  it("does not let unit count flip the price and DSCR line", () => {
    const input = underwriting(price, noiPassCents);
    input.units = { value: 8, source: "entered" };
    const score = scoreDeal1(DEFAULT_DEAL1_GATES, input);
    expect(score.pass).toBe(true);
    expect(buyBoxNotes(DEFAULT_DEAL1_GATES, { units: 8, fullyLeased: true, heavyRehab: false, purchasePriceCents: price })).toEqual([
      "8 units is outside the 2–4 unit gate.",
    ]);
  });
});
