import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { mockClassify, parseDateToIso, parseMoneyToCents } from "./mock";

function fixture(name: string): string {
  return readFileSync(path.join(process.cwd(), "fixtures", name), "utf8");
}

describe("parseDateToIso", () => {
  it.each([
    ["03/05/2026", "2026-03-05"],
    ["3/5/26", "2026-03-05"],
    ["2026-03-05", "2026-03-05"],
    ["March 5, 2026", "2026-03-05"],
    ["Mar 5 2026", "2026-03-05"],
    ["5 March 2026", "2026-03-05"],
    ["March 31, 2026", "2026-03-31"],
  ])("parses %s", (input, expected) => {
    expect(parseDateToIso(input)).toBe(expected);
  });

  it.each([["not a date"], ["13/40/2026"], [""], ["March 5"]])("rejects %s", (input) => {
    expect(parseDateToIso(input)).toBeNull();
  });
});

describe("parseMoneyToCents", () => {
  it.each([
    ["$1,250.00", 125000],
    ["1,450.00", 145000],
    ["-297.50", -29750],
    ["(185.00)", -18500],
    ["90.00-", -9000],
    ["$0.00", 0],
    ["2402.50", 240250],
  ])("parses %s", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each([[""], ["abc"], ["1.2.3"], ["$"]])("rejects %s", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });
});

describe("mockClassify", () => {
  it.each([
    ["pm-statement-appfolio.txt", "pm_statement"],
    ["pm-statement-buildium.txt", "pm_statement"],
    ["pm-statement-propertyware.txt", "pm_statement"],
    ["bank-statement.txt", "bank_statement"],
    ["invoice.txt", "invoice"],
  ] as const)("classifies %s as %s", (filename, kind) => {
    const result = mockClassify({ filename, text: fixture(filename), mimeType: "text/plain" });
    expect(result.kind).toBe(kind);
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("falls back to other for unrecognized content", () => {
    const result = mockClassify({
      filename: "notes.txt",
      text: "grocery list: milk, eggs, bread",
      mimeType: "text/plain",
    });
    expect(result.kind).toBe("other");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("classifies from the filename when there is no text (PDF path)", () => {
    const result = mockClassify({
      filename: "pm-statement-march.pdf",
      text: null,
      mimeType: "application/pdf",
    });
    expect(result.kind).toBe("pm_statement");
    expect(result.confidence).toBeLessThan(0.9);
  });
});
