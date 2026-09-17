import { describe, expect, it } from "vitest";

import { buildCpaPackageFiles, normalizeExportMonth, packageFilename, zipCpaPackage, type CpaExportInput } from "./cpa";
import { centsToUsd, csvEscape, toCsv } from "./csv";
import { zipStore, utf8 } from "./zip";

describe("csv", () => {
  it("escapes quotes, commas, and newlines", () => {
    expect(csvEscape('Fee "drift", see note')).toBe('"Fee ""drift"", see note"');
    expect(toCsv(["a", "b"], [["x", "y,z"]])).toBe("a,b\r\nx,\"y,z\"\r\n");
  });

  it("formats cents as fixed two-decimal usd without float invention", () => {
    expect(centsToUsd(12345)).toBe("123.45");
    expect(centsToUsd(-50)).toBe("-0.50");
    expect(centsToUsd(0)).toBe("0.00");
  });
});

describe("zipStore", () => {
  it("writes a PK zip that contains the file bytes", () => {
    const bytes = zipStore([{ name: "hello.txt", data: utf8("hello") }], new Date("2026-09-16T00:00:00Z"));
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const asText = new TextDecoder().decode(bytes);
    expect(asText).toContain("hello.txt");
    expect(asText).toContain("hello");
  });
});

describe("cpa package", () => {
  const input: CpaExportInput = {
    workspaceName: "Demo Workspace",
    workspaceSlug: "demo",
    property: { id: "p1", name: "421 Maple Street" },
    month: "2026-03-01",
    generatedAt: new Date("2026-09-16T00:00:00Z"),
    ledger: [
      {
        occurredOn: "2026-03-01",
        propertyName: "421 Maple Street",
        entryType: "fee_recovered",
        description: 'Mgmt fee $290 vs $232 expected',
        amountCents: 5800,
        confirmed: true,
        exceptionId: "ex-1",
      },
    ],
    exceptions: [
      {
        id: "ex-1",
        propertyName: "421 Maple Street",
        month: "2026-03-01",
        ruleId: "fee_drift_v1",
        severity: "warning",
        status: "confirmed",
        summary: "Management fee overcharge",
        dollarImpactCents: 5800,
        recommendedAction: "Email the PM",
        evidenceNotes: "source document",
      },
    ],
    actuals: [
      {
        propertyName: "421 Maple Street",
        month: "2026-03-01",
        category: "rent",
        amountCents: 240_000,
        source: "pm_statement",
      },
    ],
  };

  it("builds CSVs whose usd columns match cents/100", () => {
    const files = Object.fromEntries(buildCpaPackageFiles(input).map((f) => [f.name, f.text]));
    expect(files["ledger.csv"]).toContain("5800,58.00,true");
    expect(files["exceptions.csv"]).toContain("5800,58.00");
    expect(files["actuals.csv"]).toContain("240000,2400.00");
    expect(files["manifest.json"]).toContain("cpa-export-v1");
    expect(files["README.txt"]).toContain("Do not treat narrative text");
  });

  it("names the zip from workspace + property + month", () => {
    expect(packageFilename(input)).toBe("apex-cpa-demo-421-maple-street-2026-03.zip");
  });

  it("normalizes month query params to first-of-month", () => {
    expect(normalizeExportMonth("2026-03")).toBe("2026-03-01");
    expect(normalizeExportMonth("2026-03-15")).toBe("2026-03-01");
    expect(normalizeExportMonth("nope")).toBeNull();
    expect(normalizeExportMonth(null)).toBeNull();
  });

  it("zips the package", () => {
    const files = buildCpaPackageFiles(input);
    const zip = zipCpaPackage(files, input.generatedAt);
    expect(zip[0]).toBe(0x50);
    expect(new TextDecoder().decode(zip)).toContain("ledger.csv");
  });
});
