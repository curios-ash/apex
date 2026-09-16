import { describe, expect, it } from "vitest";

import {
  buildTemplateNarrative,
  findUngroundedNumbers,
  getNarrativeLlm,
  type ReviewFigures,
} from "./narrative";

const FIGURES: ReviewFigures = {
  propertyName: "421 Maple Street",
  month: "2026-04-01",
  monthLabel: "April 2026",
  incomeBudgetCents: 290_000,
  incomeActualCents: 145_000,
  incomeVarianceCents: -145_000,
  expenseBudgetCents: 52_700,
  expenseActualCents: 101_000,
  expenseVarianceCents: 48_300,
  netCashFlowCents: 44_000,
  variances: [
    {
      category: "rent",
      budgetCents: 290_000,
      actualCents: 145_000,
      varianceCents: -145_000,
      variancePct: -0.5,
    },
    {
      category: "insurance",
      budgetCents: 9_500,
      actualCents: -24_000,
      varianceCents: 14_500,
      variancePct: 1.5263157894736843,
    },
  ],
  exceptions: [
    {
      id: "11111111-2222-3333-4444-555555555555",
      shortId: "11111111",
      ruleId: "vacancy_vs_plan_v1",
      severity: "critical",
      status: "open",
      dollarImpactCents: 145_000,
      summary: "Collected rent $1,450.00 vs $2,900.00 planned ($1,450.00 short, 50%)",
    },
    {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      shortId: "aaaaaaaa",
      ruleId: "insurance_tax_jump_v1",
      severity: "critical",
      status: "open",
      dollarImpactCents: 14_500,
      summary: "Insurance jumped to $240.00 vs $95.00 baseline (+153%)",
    },
  ],
  openExceptionCount: 2,
  confirmedImpactToDateCents: 9_500,
};

describe("buildTemplateNarrative", () => {
  it("is deterministic", () => {
    expect(buildTemplateNarrative(FIGURES)).toBe(buildTemplateNarrative(FIGURES));
  });

  it("cites exception short ids and pulls figures from the payload", () => {
    const text = buildTemplateNarrative(FIGURES);
    expect(text).toContain("April 2026");
    expect(text).toContain("421 Maple Street");
    expect(text).toContain("$1,450.00");
    expect(text).toContain("[11111111]");
    expect(text).toContain("[aaaaaaaa]");
    expect(text).toContain("$95.00");
  });

  it("is grounded by construction", () => {
    expect(findUngroundedNumbers(buildTemplateNarrative(FIGURES), FIGURES)).toEqual([]);
  });

  it("handles a clean month", () => {
    const clean = { ...FIGURES, exceptions: [], openExceptionCount: 0 };
    const text = buildTemplateNarrative(clean);
    expect(text).toContain("No open exceptions");
    expect(findUngroundedNumbers(text, clean)).toEqual([]);
  });
});

describe("findUngroundedNumbers", () => {
  it("flags invented dollar amounts", () => {
    const text = `${buildTemplateNarrative(FIGURES)} Fees were $9,999.00.`;
    expect(findUngroundedNumbers(text, FIGURES)).toEqual(["$9,999.00"]);
  });

  it("flags invented percentages", () => {
    const text = `${buildTemplateNarrative(FIGURES)} That is a 73% miss.`;
    expect(findUngroundedNumbers(text, FIGURES)).toEqual(["73%"]);
  });

  it("accepts numbers quoted from engine summaries and variance percents", () => {
    const text =
      "Rent came in at $1,450.00 against $2,900.00 planned (50% of plan). " +
      "Insurance jumped to $240.00 vs $95.00 baseline (+153%). " +
      `Confirmed impact to date: $95.00. Net cash flow: $440.00.`;
    expect(findUngroundedNumbers(text, FIGURES)).toEqual([]);
  });
});

describe("getNarrativeLlm", () => {
  it("uses the mock template provider when no API key is set", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const llm = getNarrativeLlm();
    const { text, meta } = await llm.generateReview(FIGURES);
    expect(meta.provider).toBe("mock");
    expect(meta.promptVersion).toBe("review-narrative-v1");
    expect(text).toBe(buildTemplateNarrative(FIGURES));
  });
});
