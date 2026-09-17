import { describe, expect, it } from "vitest";

import { formatAddress, inboundTagFromId, normalizeAddressKey, parseFreeformAddress } from "./address";
import { calculatorFromForm, runCalculator } from "./calculator";
import { freeTextSuggestion, MOCK_GEOCODER_ID, searchMockPlaces } from "./geocode";
import { formatDealInboundAddress, parseInboundAlias } from "./inbound-alias";
import { sortTimelineNewestFirst } from "./timeline";

describe("parseFreeformAddress", () => {
  it("parses a full US street address", () => {
    expect(parseFreeformAddress("421 Maple Street, Austin, TX 78701")).toEqual({
      line1: "421 Maple Street",
      line2: null,
      city: "Austin",
      state: "TX",
      zip: "78701",
    });
  });

  it("keeps a free-text line when city/state are missing", () => {
    const parsed = parseFreeformAddress("the duplex on maple");
    expect(parsed.line1).toBe("the duplex on maple");
    expect(parsed.city).toBe("Unknown");
    expect(parsed.state).toBe("NA");
    expect(parsed.zip).toBe("00000");
  });
});

describe("normalizeAddressKey", () => {
  it("collapses punctuation so the same listing matches", () => {
    expect(normalizeAddressKey("421 Maple Street, Austin, TX 78701")).toBe(
      normalizeAddressKey("421 maple street austin tx 78701"),
    );
  });
});

describe("mock geocoder", () => {
  it("returns seed Austin when the query mentions maple", () => {
    const hits = searchMockPlaces("maple austin");
    expect(hits.some((h) => h.placeId === "mock-421-maple-austin")).toBe(true);
    expect(MOCK_GEOCODER_ID).toBe("mock-places-v1");
  });

  it("always offers a free-text create when Places misses", () => {
    const suggestion = freeTextSuggestion("9 Imaginary Lane, Austin, TX 78702");
    expect(suggestion.geocoder).toBe("manual");
    expect(suggestion.matched).toBe(false);
    expect(suggestion.address.city).toBe("Austin");
    expect(formatAddress(suggestion.address)).toContain("78702");
  });
});

describe("calculator", () => {
  it("computes NOI, DSCR, CoC, and mortgage from finance-v1 only", () => {
    const result = runCalculator(
      calculatorFromForm({
        purchasePrice: "289000",
        monthlyRent: "2400",
        vacancyPercent: "5",
        annualOperatingExpenses: "8700",
        closingCosts: "8670",
        loanPrincipal: "216750",
        interestPercent: "6.5",
        loanTermMonths: "360",
        reservePercent: "5",
        downsideRentPercent: "10",
        downsideVacancyPoints: "5",
        downsideExpensePercent: "15",
      }),
    );
    expect(result.engine).toBe("finance-v1");
    expect(result.computable).toBe(true);
    expect(result.base?.year1.noiCents).toBeGreaterThan(0);
    expect(result.base?.year1.dscr).not.toBeNull();
    expect(result.base?.year1.cashOnCashReturn).not.toBeNull();
    expect(result.monthlyMortgageCents).toBeGreaterThan(0);
    expect(result.downside?.year1.noiCents).toBeLessThan(result.base!.year1.noiCents);
  });

  it("does not invent outputs when price or rent is missing", () => {
    const result = runCalculator(
      calculatorFromForm({ purchasePrice: "0", monthlyRent: "2400" }),
    );
    expect(result.computable).toBe(false);
    expect(result.missing).toContain("purchase_price");
    expect(result.base).toBeNull();
  });
});

describe("inbound alias", () => {
  it("parses a deal plus-tag without breaking the workspace slug", () => {
    expect(parseInboundAlias(["demo+a1b2c3d4@in.apex.example.com"])).toEqual({
      slug: "demo",
      tag: "a1b2c3d4",
    });
    expect(parseInboundAlias(["demo@in.apex.example.com"])).toEqual({ slug: "demo", tag: null });
    expect(formatDealInboundAddress("demo", "a1b2c3d4", "in.apex.example.com")).toBe(
      "demo+a1b2c3d4@in.apex.example.com",
    );
  });

  it("builds a stable 8-char tag from a uuid", () => {
    expect(inboundTagFromId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe("a1b2c3d4");
  });
});

describe("timeline", () => {
  it("sorts newest first", () => {
    const sorted = sortTimelineNewestFirst([
      {
        id: "1",
        kind: "note",
        title: "old",
        summary: null,
        refType: null,
        refId: null,
        createdAt: new Date("2026-01-01"),
        metadata: {},
      },
      {
        id: "2",
        kind: "document",
        title: "new",
        summary: null,
        refType: null,
        refId: null,
        createdAt: new Date("2026-06-01"),
        metadata: {},
      },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["2", "1"]);
  });
});
