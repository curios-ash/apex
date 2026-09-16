import { describe, expect, it } from "vitest";

import {
  applyDownside,
  defaultDownsideParams,
  defaultValueFor,
  missingRequiredInputs,
  numValue,
  toDealInputs,
} from "./assumptions";
import { buildChecklist } from "./checklist";
import { buildDossierPayload } from "./index";
import type { AssumptionKey, AssumptionValue } from "./types";
import { ASSUMPTION_UNITS } from "./assumptions";

function assumption(
  key: AssumptionKey,
  valueNum: number | null,
  source: AssumptionValue["source"] = "manual",
  confidence: AssumptionValue["confidence"] = "high",
): AssumptionValue {
  return { key, valueNum, valueText: null, unit: ASSUMPTION_UNITS[key], source, confidence };
}

function mapOf(...values: AssumptionValue[]): Map<AssumptionKey, AssumptionValue> {
  return new Map(values.map((v) => [v.key, v]));
}

// A complete, realistic deal: $300k duplex, $2,400/mo total rent, 25% down.
function fullDeal(): Map<AssumptionKey, AssumptionValue> {
  return mapOf(
    assumption("purchase_price", 30_000_000),
    assumption("closing_costs", 900_000),
    assumption("initial_repairs", 0),
    assumption("monthly_rent", 240_000),
    assumption("other_monthly_income", 0),
    assumption("vacancy_rate", 0.05),
    assumption("property_tax_annual", 330_000),
    assumption("insurance_annual", 150_000),
    assumption("hoa_annual", 0),
    assumption("utilities_annual", 0),
    assumption("maintenance_annual", 144_000),
    assumption("management_fee_annual", 230_400),
    assumption("other_expenses_annual", 0),
    assumption("rent_growth_rate", 0.02),
    assumption("expense_growth_rate", 0.02),
    assumption("appreciation_rate", 0.02),
    assumption("selling_cost_rate", 0.06),
    assumption("reserve_rate", 0.05),
    assumption("holding_years", 10),
    assumption("loan_principal", 22_500_000),
    assumption("loan_interest_rate", 0.065),
    assumption("loan_term_months", 360),
    ...defaultDownsideParams(),
  );
}

describe("defaultValueFor", () => {
  it("derives price- and rent-based defaults", () => {
    const ctx = { purchasePriceCents: 30_000_000, monthlyRentCents: 240_000 };
    expect(defaultValueFor("closing_costs", ctx)).toBe(900_000);
    expect(defaultValueFor("property_tax_annual", ctx)).toBe(330_000);
    expect(defaultValueFor("insurance_annual", ctx)).toBe(150_000);
    expect(defaultValueFor("maintenance_annual", ctx)).toBe(144_000);
    expect(defaultValueFor("management_fee_annual", ctx)).toBe(230_400);
    expect(defaultValueFor("loan_principal", ctx)).toBe(22_500_000);
  });

  it("yields zeros when nothing is known", () => {
    const ctx = { purchasePriceCents: null, monthlyRentCents: null };
    expect(defaultValueFor("closing_costs", ctx)).toBe(0);
    expect(defaultValueFor("loan_principal", ctx)).toBe(0);
    expect(defaultValueFor("vacancy_rate", ctx)).toBe(0.05);
  });
});

describe("toDealInputs", () => {
  it("sums expense components into annual operating expenses", () => {
    const inputs = toDealInputs(fullDeal());
    // 3300 + 1500 + 0 + 0 + 1440 + 2304 + 0 = 8544.00
    expect(inputs.annualOperatingExpensesCents).toBe(854_400);
    expect(inputs.purchasePriceCents).toBe(30_000_000);
    expect(inputs.monthlyRentCents).toBe(240_000);
    expect(inputs.loan).toEqual({
      principalCents: 22_500_000,
      annualRate: 0.065,
      termMonths: 360,
    });
  });

  it("treats a zero principal as all-cash (no loan)", () => {
    const deal = fullDeal();
    deal.set("loan_principal", assumption("loan_principal", 0));
    expect(toDealInputs(deal).loan).toBeNull();
  });
});

describe("missingRequiredInputs", () => {
  it("requires price and rent", () => {
    expect(missingRequiredInputs(fullDeal())).toEqual([]);
    const noPrice = fullDeal();
    noPrice.delete("purchase_price");
    expect(missingRequiredInputs(noPrice)).toEqual(["purchase_price"]);
    const empty = mapOf();
    expect(missingRequiredInputs(empty)).toEqual(["purchase_price", "monthly_rent"]);
  });
});

describe("applyDownside", () => {
  it("shocks rent down, vacancy up by points, expenses up", () => {
    const inputs = toDealInputs(fullDeal());
    const down = applyDownside(inputs, {
      rentShockRate: -0.1,
      vacancyDelta: 0.05,
      expenseShockRate: 0.15,
    });
    expect(down.monthlyRentCents).toBe(216_000);
    expect(down.vacancyRate).toBeCloseTo(0.1);
    expect(down.annualOperatingExpensesCents).toBe(982_560);
    // Financing terms are unchanged.
    expect(down.loan).toEqual(inputs.loan);
  });

  it("clamps vacancy at 100%", () => {
    const inputs = toDealInputs(fullDeal());
    const down = applyDownside(inputs, {
      rentShockRate: -0.1,
      vacancyDelta: 0.99,
      expenseShockRate: 0.15,
    });
    expect(down.vacancyRate).toBe(1);
  });
});

describe("buildDossierPayload", () => {
  const now = new Date("2026-09-16T00:00:00Z");

  it("computes base and downside through the finance engine", () => {
    const payload = buildDossierPayload({
      assumptions: fullDeal(),
      assumptionVersion: 1,
      now,
    });
    expect(payload.computable).toBe(true);
    expect(payload.base?.year1.noiCents).toBeGreaterThan(0);
    expect(payload.downside?.analysis.year1.noiCents).toBeLessThan(payload.base!.year1.noiCents);
    // Downside: EGI = 216000*12*0.9 = 23328.00; opex 9825.60 -> NOI 13502.40
    expect(payload.downside?.analysis.year1.noiCents).toBe(1_350_240);
    expect(payload.downside?.params).toEqual({
      rentShockRate: -0.1,
      vacancyDelta: 0.05,
      expenseShockRate: 0.15,
    });
    expect(payload.assumptionVersion).toBe(1);
  });

  it("is not computable when price or rent is missing, and the checklist leads with the gap", () => {
    const deal = fullDeal();
    deal.delete("monthly_rent");
    const payload = buildDossierPayload({ assumptions: deal, assumptionVersion: 2, now });
    expect(payload.computable).toBe(false);
    expect(payload.base).toBeNull();
    expect(payload.downside).toBeNull();
    expect(payload.missingInputs).toEqual(["monthly_rent"]);
    expect(payload.checklist[0]).toMatchObject({ id: "missing-rent", severity: "critical" });
  });
});

describe("buildChecklist", () => {
  it("flags default-sourced tax and insurance for verification", () => {
    const deal = fullDeal();
    deal.set("property_tax_annual", assumption("property_tax_annual", 330_000, "default", "low"));
    deal.set("insurance_annual", assumption("insurance_annual", 150_000, "default", "low"));
    const payload = buildDossierPayload({
      assumptions: deal,
      assumptionVersion: 1,
      now: new Date("2026-09-16T00:00:00Z"),
    });
    const ids = payload.checklist.map((c) => c.id);
    expect(ids).toContain("verify-taxes");
    expect(ids).toContain("verify-insurance");
    // Rent is manual in this deal, so no comp-verification item.
    expect(ids).not.toContain("verify-rent");
  });

  it("does not flag manual-sourced values", () => {
    const payload = buildDossierPayload({
      assumptions: fullDeal(),
      assumptionVersion: 1,
      now: new Date("2026-09-16T00:00:00Z"),
    });
    const ids = payload.checklist.map((c) => c.id);
    expect(ids).not.toContain("verify-taxes");
    expect(ids).not.toContain("verify-rent");
    // Standard items are always present.
    expect(ids).toContain("inspection");
    expect(ids).toContain("title");
  });

  it("adds tenant-occupied and HOA items when the deal has them", () => {
    const deal = fullDeal();
    deal.set("tenant_occupied", assumption("tenant_occupied", 1, "listing", "medium"));
    deal.set("hoa_annual", assumption("hoa_annual", 180_000, "listing", "medium"));
    const items = buildChecklist({
      assumptions: deal,
      missingInputs: [],
      base: null,
      downside: null,
    });
    const ids = items.map((c) => c.id);
    expect(ids).toContain("tenant-docs");
    expect(ids).toContain("hoa-docs");
  });

  it("escalates to critical when the downside DSCR breaks the floor", () => {
    const deal = fullDeal();
    // Expensive deal: rent too low for the price -> downside DSCR collapses.
    deal.set("monthly_rent", assumption("monthly_rent", 120_000));
    deal.set("management_fee_annual", assumption("management_fee_annual", 115_200));
    deal.set("maintenance_annual", assumption("maintenance_annual", 72_000));
    const payload = buildDossierPayload({
      assumptions: deal,
      assumptionVersion: 1,
      now: new Date("2026-09-16T00:00:00Z"),
    });
    const ids = payload.checklist.map((c) => c.id);
    expect(ids).toContain("downside-dscr");
    expect(ids).toContain("downside-cashflow");
    expect(payload.checklist[0].severity).toBe("critical");
  });

  it("numValue reads through the map", () => {
    expect(numValue(fullDeal(), "purchase_price")).toBe(30_000_000);
    expect(numValue(fullDeal(), "hoa_annual")).toBe(0);
  });
});
