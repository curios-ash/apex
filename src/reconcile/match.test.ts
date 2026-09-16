import { describe, expect, it } from "vitest";

import { computeActualLines, computeVariances, preferredSource, selectWorkingTransactions } from "./match";
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
    ...partial,
  };
}

function budget(category: EngineBudgetLine["category"], amountCents: number, month = "2026-04-01"): EngineBudgetLine {
  return { propertyId: "p1", category, month, amountCents };
}

describe("preferredSource", () => {
  it("prefers pm_statement over bank and manual", () => {
    const txs = [
      tx({ transactionDate: "2026-04-01", amountCents: 100, category: "rent", source: "bank" }),
      tx({ transactionDate: "2026-04-01", amountCents: 100, category: "rent", source: "pm_statement" }),
      tx({ transactionDate: "2026-04-01", amountCents: 100, category: "rent", source: "manual" }),
    ];
    expect(preferredSource(txs)).toBe("pm_statement");
  });

  it("falls back to bank, then manual", () => {
    expect(
      preferredSource([
        tx({ transactionDate: "2026-04-01", amountCents: 100, category: "rent", source: "bank" }),
        tx({ transactionDate: "2026-04-01", amountCents: 100, category: "rent", source: "manual" }),
      ]),
    ).toBe("bank");
    expect(
      preferredSource([
        tx({ transactionDate: "2026-04-01", amountCents: 100, category: "rent", source: "manual" }),
      ]),
    ).toBe("manual");
  });

  it("working set keeps the preferred source plus manual rows", () => {
    const txs = [
      tx({ transactionDate: "2026-04-01", amountCents: 100, category: "rent", source: "pm_statement" }),
      tx({ transactionDate: "2026-04-01", amountCents: 100, category: "rent", source: "bank" }),
      tx({ transactionDate: "2026-04-01", amountCents: 50, category: "rent", source: "manual" }),
    ];
    const working = selectWorkingTransactions(txs);
    expect(working).toHaveLength(2);
    expect(working.map((t) => t.source).sort()).toEqual(["manual", "pm_statement"]);
  });
});

describe("computeActualLines", () => {
  it("sums signed amounts per category for the target month only", () => {
    const lines = computeActualLines(
      [
        tx({ transactionDate: "2026-04-03", amountCents: 145_000, category: "rent" }),
        tx({ transactionDate: "2026-04-03", amountCents: 145_000, category: "rent" }),
        tx({ transactionDate: "2026-04-05", amountCents: -29_000, category: "mgmt_fee" }),
        tx({ transactionDate: "2026-03-03", amountCents: 999_999, category: "rent" }),
      ],
      "p1",
      "2026-04-01",
    );
    expect(lines).toEqual([
      { propertyId: "p1", category: "mgmt_fee", month: "2026-04-01", amountCents: -29_000, source: "pm_statement" },
      { propertyId: "p1", category: "rent", month: "2026-04-01", amountCents: 290_000, source: "pm_statement" },
    ]);
  });
});

describe("computeVariances", () => {
  it("income variance is actual - budget (positive = ahead)", () => {
    const [v] = computeVariances(
      [budget("rent", 290_000)],
      [{ propertyId: "p1", category: "rent", month: "2026-04-01", amountCents: 300_000, source: "pm_statement" }],
      "p1",
      "2026-04-01",
    );
    expect(v.varianceCents).toBe(10_000);
    expect(v.variancePct).toBeCloseTo(10_000 / 290_000);
  });

  it("expense variance is |actual| - budget (positive = overspend)", () => {
    const [v] = computeVariances(
      [budget("repair", 20_000)],
      [{ propertyId: "p1", category: "repair", month: "2026-04-01", amountCents: -35_000, source: "pm_statement" }],
      "p1",
      "2026-04-01",
    );
    expect(v.varianceCents).toBe(15_000);
  });

  it("covers the union of budgeted and actual categories, null pct on zero budget", () => {
    const variances = computeVariances(
      [budget("rent", 290_000)],
      [{ propertyId: "p1", category: "repair", month: "2026-04-01", amountCents: -5_000, source: "pm_statement" }],
      "p1",
      "2026-04-01",
    );
    expect(variances.map((v) => v.category)).toEqual(["rent", "repair"]);
    const repair = variances.find((v) => v.category === "repair")!;
    expect(repair.budgetCents).toBe(0);
    expect(repair.variancePct).toBeNull();
    const rent = variances.find((v) => v.category === "rent")!;
    expect(rent.actualCents).toBe(0);
    expect(rent.varianceCents).toBe(-290_000);
  });
});
