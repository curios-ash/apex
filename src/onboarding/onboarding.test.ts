import { describe, expect, it } from "vitest";

import {
  addMonths,
  nextMonths,
  parseDollarsToCents,
  priorMonths,
  slugifyWorkspaceName,
  suggestBudgetFromHistory,
  suggestBudgetFromPurchaseModel,
} from "./index";

describe("slugifyWorkspaceName", () => {
  it("slugifies and trims", () => {
    expect(slugifyWorkspaceName("Maple Street Rentals")).toBe("maple-street-rentals");
    expect(slugifyWorkspaceName("  Ashwin's  Properties!! ")).toBe("ashwin-s-properties");
  });

  it("falls back for names with no slug characters", () => {
    expect(slugifyWorkspaceName("!!!")).toBe("workspace");
  });

  it("caps length", () => {
    expect(slugifyWorkspaceName("a".repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

describe("month math", () => {
  it("addMonths crosses year boundaries", () => {
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("nextMonths returns consecutive first-of-months", () => {
    expect(nextMonths("2026-09-01", 3)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
  });

  it("priorMonths returns the three full months before, oldest first", () => {
    expect(priorMonths("2026-09-01", 3)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01"]);
  });
});

describe("parseDollarsToCents", () => {
  it("parses plain and formatted dollars", () => {
    expect(parseDollarsToCents("1450")).toBe(1450_00);
    expect(parseDollarsToCents("1,450.00")).toBe(1450_00);
    expect(parseDollarsToCents("$45.5")).toBe(45_50);
  });

  it("returns null for blank, negative, or non-numeric input", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("  ")).toBeNull();
    expect(parseDollarsToCents("-5")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
  });
});

describe("suggestBudgetFromPurchaseModel", () => {
  it("derives rent and management fee from the property record", () => {
    const result = suggestBudgetFromPurchaseModel({
      monthlyRentCents: 2900_00,
      pmFeeBps: 800,
      dossier: null,
    });
    expect(result.source).toBe("property");
    expect(result.amounts.rent).toBe(2900_00);
    expect(result.amounts.mgmt_fee).toBe(232_00); // 8% of rent
    expect(result.notes.join(" ")).toContain("unit market rents");
  });

  it("prefers dossier assumptions, spreading annual figures over 12 months", () => {
    const result = suggestBudgetFromPurchaseModel({
      monthlyRentCents: 2900_00,
      pmFeeBps: 800,
      dossier: {
        monthlyRentCents: 3000_00,
        propertyTaxAnnualCents: 6000_00,
        insuranceAnnualCents: 1200_00,
        hoaAnnualCents: null,
        utilitiesAnnualCents: null,
        maintenanceAnnualCents: 1800_00,
        managementFeeAnnualCents: 2880_00,
        otherExpensesAnnualCents: null,
      },
    });
    expect(result.source).toBe("dossier");
    expect(result.amounts.rent).toBe(3000_00); // dossier wins over unit rents
    expect(result.amounts.mgmt_fee).toBe(240_00); // dossier annual / 12, not 8% of rent
    expect(result.amounts.property_tax).toBe(500_00);
    expect(result.amounts.insurance).toBe(100_00);
    expect(result.amounts.maintenance).toBe(150_00);
    expect(result.amounts.hoa).toBeUndefined();
  });

  it("emits nothing when there is no data", () => {
    const result = suggestBudgetFromPurchaseModel({
      monthlyRentCents: null,
      pmFeeBps: null,
      dossier: null,
    });
    expect(result.amounts).toEqual({});
    expect(result.notes).toEqual([]);
  });
});

describe("suggestBudgetFromHistory", () => {
  const months = ["2026-06-01", "2026-07-01", "2026-08-01"];

  it("averages each category across the target months, missing months count as 0", () => {
    const result = suggestBudgetFromHistory({
      months,
      lines: [
        { category: "rent", month: "2026-06-01", amountCents: 2900_00 },
        { category: "rent", month: "2026-07-01", amountCents: 2900_00 },
        { category: "rent", month: "2026-08-01", amountCents: 2900_00 },
        // One repair in three months -> averaged down to a third.
        { category: "repair", month: "2026-07-01", amountCents: -300_00 },
      ],
    });
    expect(result.amounts.rent).toBe(2900_00);
    expect(result.amounts.repair).toBe(100_00);
  });

  it("uses magnitudes for signed expense lines", () => {
    const result = suggestBudgetFromHistory({
      months,
      lines: [{ category: "mgmt_fee", month: "2026-06-01", amountCents: -232_00 }],
    });
    expect(result.amounts.mgmt_fee).toBe(77_33); // 23200/3 rounded
  });

  it("ignores lines outside the target months", () => {
    const result = suggestBudgetFromHistory({
      months,
      lines: [{ category: "rent", month: "2026-01-01", amountCents: 9999_00 }],
    });
    expect(result.amounts.rent).toBeUndefined();
    expect(result.notes).toEqual([]);
  });
});
