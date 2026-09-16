import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { auditStatement, type AuditLine } from "./index";
import { duplicateCharges, feeDrift, unexplainedFees, workOrderAging } from "./rules";
import { createMockDocumentLlm } from "@/lib/llm/mock";
import { EXTRACTION_SCHEMAS } from "@/lib/llm/schemas";

function line(
  description: string,
  amountCents: number,
  date: string | null = "2026-03-05",
  category: AuditLine["category"] = null,
): AuditLine {
  return { date, description, amountCents, category };
}

describe("feeDrift", () => {
  const income = [line("Rent - Unit A", 100_000, "2026-03-03", "rent")];

  it("flags fees above the agreement percentage", () => {
    // 10% charged on $1,000 collected, agreement is 8% -> $20 drift.
    const lines = [...income, line("Management fee", -10_000, "2026-03-05", "mgmt_fee")];
    const flags = feeDrift(lines, 800);
    expect(flags).toHaveLength(1);
    expect(flags[0].dollarImpactCents).toBe(2_000);
    expect(flags[0].ruleId).toBe("fee_drift");
  });

  it("stays silent inside tolerance", () => {
    // Exactly 8% charged.
    const lines = [...income, line("Management fee", -8_000, "2026-03-05", "mgmt_fee")];
    expect(feeDrift(lines, 800)).toHaveLength(0);
  });

  it("stays silent with no fee lines or no income", () => {
    expect(feeDrift(income, 800)).toHaveLength(0);
    expect(feeDrift([line("Management fee", -8_000, null, "mgmt_fee")], 800)).toHaveLength(0);
  });
});

describe("duplicateCharges", () => {
  it("flags the later of two identical charges within the window", () => {
    const lines = [
      line("Plumbing repair - Unit A", -18_500, "2026-03-12", "repair"),
      line("Plumbing repair - Unit A", -18_500, "2026-03-14", "repair"),
    ];
    const flags = duplicateCharges(lines);
    expect(flags).toHaveLength(1);
    expect(flags[0].dollarImpactCents).toBe(18_500);
    expect(flags[0].lines).toHaveLength(2);
  });

  it("ignores same-amount charges outside the window or with different descriptions", () => {
    const apart = [
      line("Plumbing repair - Unit A", -18_500, "2026-03-01", "repair"),
      line("Plumbing repair - Unit A", -18_500, "2026-03-20", "repair"),
    ];
    expect(duplicateCharges(apart)).toHaveLength(0);
    const different = [
      line("Plumbing repair - Unit A", -18_500, "2026-03-12", "repair"),
      line("Plumbing repair - Unit B", -18_500, "2026-03-13", "repair"),
    ];
    expect(duplicateCharges(different)).toHaveLength(0);
  });

  it("never flags income lines", () => {
    const lines = [
      line("Rent - Unit A", 145_000, "2026-03-03", "rent"),
      line("Rent - Unit A", 145_000, "2026-03-04", "rent"),
    ];
    expect(duplicateCharges(lines)).toHaveLength(0);
  });
});

describe("unexplainedFees", () => {
  it("flags uncategorized money out, skips known categories and owner draws", () => {
    const lines = [
      line("Administrative surcharge", -4_500, "2026-04-15", null),
      line("Management fee", -29_750, "2026-04-05", "mgmt_fee"),
      line("Owner draw - ACH transfer", -747_500, "2026-04-28", "other_expense"),
    ];
    const flags = unexplainedFees(lines);
    expect(flags).toHaveLength(1);
    expect(flags[0].dollarImpactCents).toBe(4_500);
    expect(flags[0].summary).toContain("Administrative surcharge");
  });
});

describe("workOrderAging", () => {
  it("flags the same work-order reference billed across more than 30 days", () => {
    const lines = [
      line("HVAC repair work order WO-3001", -25_000, "2026-03-05", "repair"),
      line("HVAC follow-up work order WO-3001", -19_000, "2026-05-02", "repair"),
    ];
    const flags = workOrderAging(lines);
    expect(flags).toHaveLength(1);
    expect(flags[0].dollarImpactCents).toBe(19_000);
    expect(flags[0].summary).toContain("WO-3001");
  });

  it("ignores work orders billed within 30 days", () => {
    const lines = [
      line("HVAC repair work order WO-3001", -25_000, "2026-03-05", "repair"),
      line("HVAC follow-up work order WO-3001", -19_000, "2026-03-28", "repair"),
    ];
    expect(workOrderAging(lines)).toHaveLength(0);
  });
});

describe("auditStatement", () => {
  it("sums all flags into the total and sorts by dollar impact", () => {
    const lines = [
      line("Rent - Unit A", 100_000, "2026-03-03", "rent"),
      line("Management fee", -10_000, "2026-03-05", "mgmt_fee"),
      line("Plumbing repair - Unit A", -18_500, "2026-03-12", "repair"),
      line("Plumbing repair - Unit A", -18_500, "2026-03-14", "repair"),
      line("Administrative surcharge", -4_500, "2026-03-15", null),
    ];
    const result = auditStatement(lines, 800);
    expect(result.totalFlaggedCents).toBe(2_000 + 18_500 + 4_500);
    expect(result.flags[0].dollarImpactCents).toBeGreaterThanOrEqual(
      result.flags[result.flags.length - 1].dollarImpactCents,
    );
    expect(result.lineCount).toBe(5);
  });
});

describe("synthetic AppFolio-style statement (mock extraction -> audit)", () => {
  it("flags the four planted issues with the exact dollar total", async () => {
    const text = readFileSync(
      path.join(process.cwd(), "fixtures", "pm-statement-audit.txt"),
      "utf8",
    );
    const llm = createMockDocumentLlm();
    const entry = EXTRACTION_SCHEMAS.pm_statement;
    const { output } = await llm.extract(
      { filename: "pm-statement-audit.txt", text, mimeType: "text/plain", kind: "pm_statement" },
      entry.schema,
      entry.version,
    );
    const fields = output.fields as { lines: AuditLine[] };

    // Owner's agreement says 8%; the statement charges 10%.
    const result = auditStatement(fields.lines, 800);
    const byRule = new Map(result.flags.map((f) => [f.ruleId, f]));

    // Fee drift: charged 3 x $297.50 = $892.50; expected 8% of $8,775 = $702.00.
    expect(byRule.get("fee_drift")?.dollarImpactCents).toBe(19_050);
    // Duplicate: the second $185.00 plumbing charge.
    expect(byRule.get("duplicate_charge")?.dollarImpactCents).toBe(18_500);
    // Unexplained: the $45.00 administrative surcharge.
    expect(byRule.get("unexplained_fee")?.dollarImpactCents).toBe(4_500);
    // Aging: WO-3001 re-billed $190.00 after 58 days.
    expect(byRule.get("work_order_aging")?.dollarImpactCents).toBe(19_000);

    expect(result.totalFlaggedCents).toBe(61_050);
    // The owner draw is not flagged as unexplained.
    expect(result.flags.some((f) => f.detail.includes("Owner draw"))).toBe(false);
  });
});
