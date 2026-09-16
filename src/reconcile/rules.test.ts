import { describe, expect, it } from "vitest";

import {
  duplicateChargeRule,
  feeDriftRule,
  insuranceTaxJumpRule,
  normalizeDescription,
  repeatRepairRule,
  vacancyVsPlanRule,
  workOrderAgingRule,
  workOrderRef,
  type RuleContext,
} from "./rules";
import type { EngineBudgetLine, EngineTransaction } from "./types";

let seq = 0;
function tx(
  partial: Partial<EngineTransaction> &
    Pick<EngineTransaction, "transactionDate" | "amountCents" | "category">,
): EngineTransaction {
  seq += 1;
  return {
    id: `t${seq}`,
    propertyId: "p1",
    description: "desc",
    source: "pm_statement",
    documentId: "doc1",
    ...partial,
  };
}

function budget(category: EngineBudgetLine["category"], amountCents: number, month = "2026-04-01"): EngineBudgetLine {
  return { propertyId: "p1", category, month, amountCents };
}

function ctx(overrides: Partial<RuleContext>): RuleContext {
  return {
    propertyId: "p1",
    propertyName: "421 Maple Street",
    month: "2026-04-01",
    working: [],
    budgetLines: [],
    pmAgreement: null,
    ...overrides,
  };
}

const AGREEMENT_8PCT = { propertyId: "p1", pmCompanyName: "Sunset PM", feeBps: 800 };

describe("fee_drift_v1", () => {
  it("flags fees charged above the agreement percentage", () => {
    const [ex] = feeDriftRule(
      ctx({
        pmAgreement: AGREEMENT_8PCT,
        working: [
          tx({ transactionDate: "2026-04-03", amountCents: 290_000, category: "rent", description: "Rent" }),
          tx({ transactionDate: "2026-04-05", amountCents: -29_000, category: "mgmt_fee", description: "Management fee" }),
        ],
      }),
    );
    // 8% of 2900.00 = 232.00; charged 290.00 -> drift 58.00.
    expect(ex.dollarImpactCents).toBe(5_800);
    expect(ex.ruleId).toBe("fee_drift_v1");
    expect(ex.severity).toBe("warning");
    expect(ex.summary).toContain("$290.00");
    expect(ex.summary).toContain("$232.00");
    expect(ex.recommendedAction).toContain("Sunset PM");
    expect(ex.evidence.some((e) => e.transactionId)).toBe(true);
  });

  it("stays quiet within tolerance and without an agreement", () => {
    const within = feeDriftRule(
      ctx({
        pmAgreement: AGREEMENT_8PCT,
        working: [
          tx({ transactionDate: "2026-04-03", amountCents: 290_000, category: "rent" }),
          // 232.50 vs 232.00 expected — under the $1 + 1% tolerance.
          tx({ transactionDate: "2026-04-05", amountCents: -23_250, category: "mgmt_fee" }),
        ],
      }),
    );
    expect(within).toEqual([]);

    const noAgreement = feeDriftRule(
      ctx({
        working: [
          tx({ transactionDate: "2026-04-03", amountCents: 290_000, category: "rent" }),
          tx({ transactionDate: "2026-04-05", amountCents: -99_000, category: "mgmt_fee" }),
        ],
      }),
    );
    expect(noAgreement).toEqual([]);
  });

  it("stays quiet when no fee was charged or no income collected", () => {
    expect(
      feeDriftRule(
        ctx({
          pmAgreement: AGREEMENT_8PCT,
          working: [tx({ transactionDate: "2026-04-03", amountCents: 290_000, category: "rent" })],
        }),
      ),
    ).toEqual([]);
    expect(
      feeDriftRule(
        ctx({
          pmAgreement: AGREEMENT_8PCT,
          working: [tx({ transactionDate: "2026-04-05", amountCents: -29_000, category: "mgmt_fee" })],
        }),
      ),
    ).toEqual([]);
  });
});

describe("duplicate_charge_v1", () => {
  const base = {
    amountCents: -9_500,
    category: "repair" as const,
    description: "Repair - pest control - WO-2001",
  };

  it("flags same description + amount billed twice within a week", () => {
    const [ex] = duplicateChargeRule(
      ctx({
        working: [
          tx({ ...base, transactionDate: "2026-04-08" }),
          tx({ ...base, transactionDate: "2026-04-12" }),
        ],
      }),
    );
    expect(ex.dollarImpactCents).toBe(9_500);
    expect(ex.evidence).toHaveLength(2);
    expect(ex.summary).toContain("$95.00");
  });

  it("ignores pairs past the window, with different amounts, or income", () => {
    expect(
      duplicateChargeRule(
        ctx({
          working: [
            tx({ ...base, transactionDate: "2026-04-01" }),
            tx({ ...base, transactionDate: "2026-04-20" }),
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      duplicateChargeRule(
        ctx({
          working: [
            tx({ ...base, transactionDate: "2026-04-08" }),
            tx({ ...base, amountCents: -9_501, transactionDate: "2026-04-09" }),
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      duplicateChargeRule(
        ctx({
          working: [
            tx({ transactionDate: "2026-04-03", amountCents: 145_000, category: "rent", description: "Rent" }),
            tx({ transactionDate: "2026-04-03", amountCents: 145_000, category: "rent", description: "Rent" }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("normalizes punctuation and case before comparing", () => {
    expect(normalizeDescription("Repair:  Pest  Control (WO-2001)")).toBe(
      normalizeDescription("repair pest control wo 2001"),
    );
  });
});

describe("repeat_repair_v1", () => {
  it("fires at 3+ repair charges inside 90 days with the window total", () => {
    const [ex] = repeatRepairRule(
      ctx({
        working: [
          tx({ transactionDate: "2026-02-10", amountCents: -10_000, category: "repair" }),
          tx({ transactionDate: "2026-03-15", amountCents: -20_000, category: "repair" }),
          tx({ transactionDate: "2026-04-20", amountCents: -30_000, category: "repair" }),
        ],
      }),
    );
    expect(ex.dollarImpactCents).toBe(60_000);
    expect(ex.summary).toContain("3 repair charges");
  });

  it("ignores charges older than the window and categories under the count", () => {
    expect(
      repeatRepairRule(
        ctx({
          working: [
            tx({ transactionDate: "2025-12-01", amountCents: -10_000, category: "repair" }),
            tx({ transactionDate: "2026-03-15", amountCents: -20_000, category: "repair" }),
            tx({ transactionDate: "2026-04-20", amountCents: -30_000, category: "repair" }),
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      repeatRepairRule(
        ctx({
          working: [
            tx({ transactionDate: "2026-03-15", amountCents: -20_000, category: "repair" }),
            tx({ transactionDate: "2026-04-20", amountCents: -30_000, category: "repair" }),
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe("insurance_tax_jump_v1", () => {
  it("flags a jump over the property's own baseline", () => {
    const [ex] = insuranceTaxJumpRule(
      ctx({
        working: [
          tx({ transactionDate: "2026-03-02", amountCents: -9_500, category: "insurance" }),
          tx({ transactionDate: "2026-04-02", amountCents: -24_000, category: "insurance" }),
        ],
      }),
    );
    // Baseline 95.00; current 240.00; jump 145.00 (+152%).
    expect(ex.dollarImpactCents).toBe(14_500);
    expect(ex.severity).toBe("critical");
    expect(ex.summary).toContain("$240.00");
    expect(ex.summary).toContain("$95.00");
  });

  it("stays quiet without a baseline or under the tolerance", () => {
    expect(
      insuranceTaxJumpRule(
        ctx({
          working: [tx({ transactionDate: "2026-04-02", amountCents: -24_000, category: "insurance" })],
        }),
      ),
    ).toEqual([]);
    expect(
      insuranceTaxJumpRule(
        ctx({
          working: [
            tx({ transactionDate: "2026-03-02", amountCents: -9_500, category: "insurance" }),
            tx({ transactionDate: "2026-04-02", amountCents: -10_000, category: "insurance" }),
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe("vacancy_vs_plan_v1", () => {
  it("flags collected rent materially under plan", () => {
    const [ex] = vacancyVsPlanRule(
      ctx({
        budgetLines: [budget("rent", 290_000)],
        working: [tx({ transactionDate: "2026-04-03", amountCents: 145_000, category: "rent" })],
      }),
    );
    expect(ex.dollarImpactCents).toBe(145_000);
    expect(ex.severity).toBe("critical");
    expect(ex.summary).toContain("$1,450.00");
    expect(ex.summary).toContain("$2,900.00");
  });

  it("stays quiet within tolerance or without a rent budget", () => {
    expect(
      vacancyVsPlanRule(
        ctx({
          budgetLines: [budget("rent", 290_000)],
          working: [tx({ transactionDate: "2026-04-03", amountCents: 280_000, category: "rent" })],
        }),
      ),
    ).toEqual([]);
    expect(
      vacancyVsPlanRule(
        ctx({
          working: [tx({ transactionDate: "2026-04-03", amountCents: 145_000, category: "rent" })],
        }),
      ),
    ).toEqual([]);
  });
});

describe("work_order_aging_v1", () => {
  it("extracts work-order references", () => {
    expect(workOrderRef("Repair - pest control - WO-2001")).toBe("2001");
    expect(workOrderRef("Work order #A-42 plumbing")).toBe("a-42");
    expect(workOrderRef("HVAC repair work order WO-3001")).toBe("3001");
    expect(workOrderRef("Plain repair")).toBeNull();
  });

  it("flags a work order billed across more than 30 days", () => {
    const [ex] = workOrderAgingRule(
      ctx({
        working: [
          tx({ transactionDate: "2026-03-08", amountCents: -9_500, category: "repair", description: "Repair - pest control - WO-2001" }),
          tx({ transactionDate: "2026-03-12", amountCents: -9_500, category: "repair", description: "Repair - pest control - WO-2001" }),
          tx({ transactionDate: "2026-04-12", amountCents: -9_500, category: "repair", description: "Repair - pest control - WO-2001" }),
        ],
      }),
    );
    // 35 days; the two charges after the first are at risk: 95 + 95.
    expect(ex.dollarImpactCents).toBe(19_000);
    expect(ex.month).toBe("2026-04-01");
    expect(ex.summary).toContain("WO-2001");
    expect(ex.summary).toContain("35 days");
  });

  it("stays quiet within 30 days and ignores future months", () => {
    expect(
      workOrderAgingRule(
        ctx({
          working: [
            tx({ transactionDate: "2026-04-01", amountCents: -9_500, category: "repair", description: "Repair WO-7" }),
            tx({ transactionDate: "2026-04-20", amountCents: -9_500, category: "repair", description: "Repair WO-7" }),
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      workOrderAgingRule(
        ctx({
          month: "2026-03-01",
          working: [
            tx({ transactionDate: "2026-03-01", amountCents: -9_500, category: "repair", description: "Repair WO-7" }),
            tx({ transactionDate: "2026-05-15", amountCents: -9_500, category: "repair", description: "Repair WO-7" }),
          ],
        }),
      ),
    ).toEqual([]);
  });
});
