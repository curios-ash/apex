import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildDossierPayload } from "./index";
import { defaultDownsideParams } from "./assumptions";
import type { AssumptionKey, AssumptionValue } from "./types";
import { ASSUMPTION_UNITS } from "./assumptions";

// Golden-file test: a fixed assumption set produces a pinned pro forma,
// downside case, and checklist. Any change to the finance engine, the
// defaults, or the checklist rules shows up here as a diff to review.
// Regenerate with `npx vitest run --update` after an intentional change.

function assumption(
  key: AssumptionKey,
  valueNum: number | null,
  source: AssumptionValue["source"],
  confidence: AssumptionValue["confidence"],
  valueText: string | null = null,
): AssumptionValue {
  return { key, valueNum, valueText, unit: ASSUMPTION_UNITS[key], source, confidence };
}

// The "Maple duplex" deal: listing-stated price and rent, everything else
// defaulted — the typical first-pass dossier from a pasted listing.
function mapleDuplex(): Map<AssumptionKey, AssumptionValue> {
  const values: AssumptionValue[] = [
    assumption("address", null, "listing", "high", "421 Maple Street, Austin, TX 78701"),
    assumption("bedrooms", 4, "listing", "high"),
    assumption("bathrooms", 2, "listing", "high"),
    assumption("sqft", 1920, "listing", "high"),
    assumption("year_built", 1985, "listing", "high"),
    assumption("purchase_price", 28_900_000, "listing", "high"),
    assumption("monthly_rent", 185_000, "listing", "medium"),
    assumption("closing_costs", 867_000, "default", "low"),
    assumption("initial_repairs", 0, "default", "low"),
    assumption("other_monthly_income", 0, "default", "low"),
    assumption("vacancy_rate", 0.05, "default", "low"),
    assumption("property_tax_annual", 317_900, "default", "low"),
    assumption("insurance_annual", 144_500, "default", "low"),
    assumption("hoa_annual", 0, "default", "low"),
    assumption("utilities_annual", 0, "default", "low"),
    assumption("maintenance_annual", 111_000, "default", "low"),
    assumption("management_fee_annual", 177_600, "default", "low"),
    assumption("other_expenses_annual", 0, "default", "low"),
    assumption("rent_growth_rate", 0.02, "default", "low"),
    assumption("expense_growth_rate", 0.02, "default", "low"),
    assumption("appreciation_rate", 0.02, "default", "low"),
    assumption("selling_cost_rate", 0.06, "default", "low"),
    assumption("reserve_rate", 0.05, "default", "low"),
    assumption("holding_years", 10, "default", "low"),
    assumption("loan_principal", 21_675_000, "default", "low"),
    assumption("loan_interest_rate", 0.065, "default", "low"),
    assumption("loan_term_months", 360, "default", "low"),
    ...defaultDownsideParams(),
  ];
  return new Map(values.map((v) => [v.key, v]));
}

describe("dossier payload golden", () => {
  it("maple duplex dossier matches the golden file", async () => {
    const payload = buildDossierPayload({
      assumptions: mapleDuplex(),
      assumptionVersion: 1,
      now: new Date("2026-09-16T12:00:00Z"),
    });
    await expect(payload).toMatchFileSnapshot(
      path.join(__dirname, "__golden__", "maple-duplex.json"),
    );
  });
});
