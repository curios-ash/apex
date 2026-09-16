import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { overallConfidence, extractionStatusFor } from "./confidence";
import { createMockDocumentLlm } from "./mock";
import { EXTRACTION_SCHEMAS, type ExtractableKind } from "./schemas";

// Golden-file tests: synthetic AppFolio/Buildium/Propertyware-style PM
// statements and a bank statement run through the deterministic mock
// provider; outputs are pinned to files under __golden__/. Regenerate with
// `npx vitest run --update` after an intentional parser change.

const CASES: { fixture: string; kind: ExtractableKind }[] = [
  { fixture: "pm-statement-appfolio.txt", kind: "pm_statement" },
  { fixture: "pm-statement-buildium.txt", kind: "pm_statement" },
  { fixture: "pm-statement-propertyware.txt", kind: "pm_statement" },
  { fixture: "bank-statement.txt", kind: "bank_statement" },
  { fixture: "invoice.txt", kind: "invoice" },
];

const llm = createMockDocumentLlm();

describe("golden extractions (mock provider)", () => {
  for (const { fixture, kind } of CASES) {
    it(`${fixture} matches the golden file`, async () => {
      const text = readFileSync(path.join(process.cwd(), "fixtures", fixture), "utf8");
      const input = { filename: fixture, text, mimeType: "text/plain" };

      const { output: classification } = await llm.classify(input);
      expect(classification.kind).toBe(kind);

      const entry = EXTRACTION_SCHEMAS[kind];
      const { output } = await llm.extract({ ...input, kind }, entry.schema, entry.version);

      await expect({
        schemaVersion: entry.version,
        classification,
        extraction: output,
        overallConfidence: overallConfidence(output.fieldConfidence),
        status: extractionStatusFor(output.fieldConfidence),
      }).toMatchFileSnapshot(path.join(__dirname, "__golden__", `${fixture}.json`));
    });
  }
});

describe("statement math stays internally consistent", () => {
  it("appfolio: beginning + income - expenses - draw = ending", async () => {
    const text = readFileSync(path.join(process.cwd(), "fixtures", "pm-statement-appfolio.txt"), "utf8");
    const entry = EXTRACTION_SCHEMAS.pm_statement;
    const { output } = await llm.extract(
      { filename: "pm-statement-appfolio.txt", text, mimeType: "text/plain", kind: "pm_statement" },
      entry.schema,
      entry.version,
    );
    const f = output.fields as {
      beginningBalanceCents: number;
      endingBalanceCents: number;
      managementFeeCents: number;
      ownerDrawCents: number;
      lines: { amountCents: number }[];
    };
    const lineSum = f.lines.reduce((s, l) => s + l.amountCents, 0);
    expect(f.beginningBalanceCents + lineSum).toBe(f.endingBalanceCents);
    expect(f.managementFeeCents).toBe(29750);
    expect(f.ownerDrawCents).toBe(240250);
  });

  it("bank statement: beginning + lines = ending", async () => {
    const text = readFileSync(path.join(process.cwd(), "fixtures", "bank-statement.txt"), "utf8");
    const entry = EXTRACTION_SCHEMAS.bank_statement;
    const { output } = await llm.extract(
      { filename: "bank-statement.txt", text, mimeType: "text/plain", kind: "bank_statement" },
      entry.schema,
      entry.version,
    );
    const f = output.fields as {
      beginningBalanceCents: number;
      endingBalanceCents: number;
      lines: { amountCents: number }[];
    };
    const lineSum = f.lines.reduce((s, l) => s + l.amountCents, 0);
    expect(f.beginningBalanceCents + lineSum).toBe(f.endingBalanceCents);
  });
});
