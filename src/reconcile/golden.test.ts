import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createMockDocumentLlm } from "@/lib/llm/mock";
import { EXTRACTION_SCHEMAS } from "@/lib/llm/schemas";

import { reconcilePropertyMonth } from "./index";
import type {
  EngineBudgetLine,
  EnginePmAgreement,
  EngineTransaction,
  TransactionCategory,
} from "./types";

// Golden-file tests for the reconciliation engine: synthetic statements are
// extracted by the deterministic mock provider, turned into transactions,
// and reconciled against a fixed budget/agreement context per property.
// Outputs pin to src/reconcile/__golden__/. Regenerate with
// `npx vitest run --update` after an intentional rule change.

interface GoldenCase {
  name: string;
  // Fixtures are extracted in order and their lines concatenated, so
  // trailing-window rules (repeat repair, aging, jumps) see real history.
  fixtures: string[];
  month: string;
  propertyId: string;
  propertyName: string;
  agreementFeeBps: number | null;
  budget: Partial<Record<TransactionCategory, number>>;
}

const CASES: GoldenCase[] = [
  {
    name: "appfolio-clean",
    fixtures: ["pm-statement-appfolio.txt"],
    month: "2026-03-01",
    propertyId: "prop-appfolio",
    propertyName: "421 Maple Street",
    agreementFeeBps: 1000,
    budget: { rent: 290_000, mgmt_fee: 29_750, repair: 20_000, maintenance: 10_000 },
  },
  {
    name: "buildium-clean",
    fixtures: ["pm-statement-buildium.txt"],
    month: "2026-03-01",
    propertyId: "prop-buildium",
    propertyName: "88 Oak Avenue",
    agreementFeeBps: 1000,
    budget: { rent: 169_500, mgmt_fee: 16_950, repair: 34_000 },
  },
  {
    name: "propertyware-clean",
    fixtures: ["pm-statement-propertyware.txt"],
    month: "2026-03-01",
    propertyId: "prop-propertyware",
    propertyName: "17 Birch Lane",
    agreementFeeBps: 1000,
    budget: { rent: 127_500, mgmt_fee: 12_750, repair: 21_000 },
  },
  {
    name: "bank-statement-no-agreement",
    fixtures: ["bank-statement.txt"],
    month: "2026-03-01",
    propertyId: "prop-bank",
    propertyName: "Bank-only property",
    agreementFeeBps: null,
    budget: { utilities: 15_000, repair: 10_000, insurance: 80_000 },
  },
  {
    // 8% agreement but 10% charged, a duplicate pest-control charge, and
    // three repair lines inside the month.
    name: "maple-2026-03",
    fixtures: ["pm-statement-2026-03-maple.txt"],
    month: "2026-03-01",
    propertyId: "prop-maple",
    propertyName: "421 Maple Street",
    agreementFeeBps: 800,
    budget: { rent: 290_000, mgmt_fee: 23_200, repair: 20_000, maintenance: 10_000, insurance: 9_500 },
  },
  {
    // April adds: vacancy (one unit unpaid), an insurance jump, continued
    // fee drift, more repairs, and WO-2001 still being billed 35 days on.
    name: "maple-2026-04",
    fixtures: ["pm-statement-2026-03-maple.txt", "pm-statement-2026-04-maple.txt"],
    month: "2026-04-01",
    propertyId: "prop-maple",
    propertyName: "421 Maple Street",
    agreementFeeBps: 800,
    budget: { rent: 290_000, mgmt_fee: 23_200, repair: 20_000, maintenance: 10_000, insurance: 9_500 },
  },
];

const llm = createMockDocumentLlm();

interface ExtractedLine {
  date: string | null;
  description: string;
  amountCents: number;
  category: TransactionCategory | null;
}

async function extractFixtureLines(fixture: string): Promise<ExtractedLine[]> {
  const text = readFileSync(path.join(process.cwd(), "fixtures", fixture), "utf8");
  const entry = EXTRACTION_SCHEMAS.pm_statement;
  const { output } = await llm.extract(
    { filename: fixture, text, mimeType: "text/plain", kind: "pm_statement" },
    entry.schema,
    entry.version,
  );
  return (output.fields as { lines: ExtractedLine[] }).lines;
}

async function caseTransactions(c: GoldenCase): Promise<EngineTransaction[]> {
  const transactions: EngineTransaction[] = [];
  for (const fixture of c.fixtures) {
    const lines = await extractFixtureLines(fixture);
    lines.forEach((line, i) => {
      transactions.push({
        id: `tx-${fixture}-${i}`,
        propertyId: c.propertyId,
        transactionDate: line.date ?? c.month,
        description: line.description,
        amountCents: line.amountCents,
        category: line.category ?? (line.amountCents >= 0 ? "other_income" : "other_expense"),
        source: "pm_statement",
        documentId: `doc-${fixture}`,
      });
    });
  }
  return transactions;
}

describe("golden reconciliations (mock provider + reconcile-v1)", () => {
  for (const c of CASES) {
    it(`${c.name} matches the golden file`, async () => {
      const transactions = await caseTransactions(c);
      const budgetLines: EngineBudgetLine[] = Object.entries(c.budget).map(
        ([category, amountCents]) => ({
          propertyId: c.propertyId,
          category: category as TransactionCategory,
          month: c.month,
          amountCents: amountCents ?? 0,
        }),
      );
      const pmAgreement: EnginePmAgreement | null =
        c.agreementFeeBps === null
          ? null
          : { propertyId: c.propertyId, pmCompanyName: "Golden PM", feeBps: c.agreementFeeBps };

      const output = reconcilePropertyMonth({
        propertyId: c.propertyId,
        propertyName: c.propertyName,
        month: c.month,
        transactions,
        budgetLines,
        pmAgreement,
      });

      await expect(output).toMatchFileSnapshot(
        path.join(__dirname, "__golden__", `${c.name}.json`),
      );
    });
  }
});

describe("golden rule coverage", () => {
  it("the maple fixtures fire every rule exactly once across the two months", async () => {
    const march = CASES.find((c) => c.name === "maple-2026-03")!;
    const april = CASES.find((c) => c.name === "maple-2026-04")!;
    const fired = new Set<string>();
    for (const c of [march, april]) {
      const output = reconcilePropertyMonth({
        propertyId: c.propertyId,
        propertyName: c.propertyName,
        month: c.month,
        transactions: await caseTransactions(c),
        budgetLines: Object.entries(c.budget).map(([category, amountCents]) => ({
          propertyId: c.propertyId,
          category: category as TransactionCategory,
          month: c.month,
          amountCents: amountCents ?? 0,
        })),
        pmAgreement: { propertyId: c.propertyId, pmCompanyName: "Golden PM", feeBps: 800 },
      });
      for (const ex of output.exceptions) fired.add(ex.ruleId);
    }
    expect([...fired].sort()).toEqual([
      "duplicate_charge_v1",
      "fee_drift_v1",
      "insurance_tax_jump_v1",
      "repeat_repair_v1",
      "vacancy_vs_plan_v1",
      "work_order_aging_v1",
    ]);
  });

  it("clean statements produce zero exceptions", async () => {
    for (const name of ["appfolio-clean", "buildium-clean", "propertyware-clean"]) {
      const c = CASES.find((k) => k.name === name)!;
      const output = reconcilePropertyMonth({
        propertyId: c.propertyId,
        propertyName: c.propertyName,
        month: c.month,
        transactions: await caseTransactions(c),
        budgetLines: Object.entries(c.budget).map(([category, amountCents]) => ({
          propertyId: c.propertyId,
          category: category as TransactionCategory,
          month: c.month,
          amountCents: amountCents ?? 0,
        })),
        pmAgreement: { propertyId: c.propertyId, pmCompanyName: "Golden PM", feeBps: 1000 },
      });
      expect(output.exceptions).toEqual([]);
    }
  });
});
