import { describe, expect, it } from "vitest";

import {
  medianCents,
  mockCompSet,
  rentAssumptionFromComps,
  rentIsUnverified,
  shouldApplyRent,
  summarizeListings,
  type CompListing,
} from "./index";
import { ASSUMPTION_UNITS } from "@/dossier";
import type { AssumptionKey, AssumptionValue } from "@/dossier";

function listing(rentCents: number, id = "x"): CompListing {
  return {
    id,
    formattedAddress: `${id} Test St`,
    city: "Austin",
    state: "TX",
    zip: "78701",
    rentCents,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1400,
    listedDate: null,
    distanceMiles: 0.4,
  };
}

describe("medianCents", () => {
  it("returns null for an empty list", () => {
    expect(medianCents([])).toBeNull();
  });

  it("returns the middle value for an odd-length list", () => {
    expect(medianCents([100, 200, 400])).toBe(200);
  });

  it("averages the two middle values for an even-length list", () => {
    expect(medianCents([100, 200, 300, 400])).toBe(250);
  });
});

describe("summarizeListings", () => {
  it("computes min/max/mean/median in cents", () => {
    const summary = summarizeListings([
      listing(180_000, "a"),
      listing(200_000, "b"),
      listing(220_000, "c"),
    ]);
    expect(summary).toEqual({
      listingCount: 3,
      medianRentCents: 200_000,
      minRentCents: 180_000,
      maxRentCents: 220_000,
      meanRentCents: 200_000,
    });
  });

  it("ignores non-positive rents in the statistics", () => {
    const summary = summarizeListings([listing(0, "zero"), listing(150_000, "ok")]);
    expect(summary.medianRentCents).toBe(150_000);
    expect(summary.listingCount).toBe(2);
  });
});

describe("mockCompSet", () => {
  const query = {
    address: "421 Maple Street, Austin, TX 78704",
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1400,
    radiusMiles: 2,
  };
  const now = new Date("2026-09-16T00:00:00Z");

  it("is deterministic for the same address", () => {
    const a = mockCompSet(query, now);
    const b = mockCompSet(query, now);
    expect(a.listings).toEqual(b.listings);
    expect(a.summary).toEqual(b.summary);
    expect(a.usedMock).toBe(true);
    expect(a.listings).toHaveLength(5);
    expect(a.summary.medianRentCents).toBeGreaterThan(0);
  });

  it("changes when the address changes", () => {
    const a = mockCompSet(query, now);
    const b = mockCompSet({ ...query, address: "100 Other Ave, Austin, TX 78704" }, now);
    expect(a.listings.map((l) => l.rentCents)).not.toEqual(b.listings.map((l) => l.rentCents));
  });
});

describe("apply comps to assumptions", () => {
  function rent(
    source: AssumptionValue["source"],
    valueNum: number | null,
  ): Map<AssumptionKey, AssumptionValue> {
    const map = new Map<AssumptionKey, AssumptionValue>();
    if (valueNum !== null) {
      map.set("monthly_rent", {
        key: "monthly_rent",
        valueNum,
        valueText: null,
        unit: ASSUMPTION_UNITS.monthly_rent,
        source,
        confidence: "high",
      });
    }
    return map;
  }

  it("treats listing and default rents as unverified", () => {
    expect(rentIsUnverified(rent("listing", 200_000))).toBe(true);
    expect(rentIsUnverified(rent("default", 200_000))).toBe(true);
    expect(rentIsUnverified(rent("manual", 200_000))).toBe(false);
    expect(rentIsUnverified(rent("comp", 200_000))).toBe(false);
    expect(rentIsUnverified(new Map())).toBe(true);
  });

  it("builds a monthly_rent assumption from the median, never from an LLM", () => {
    const set = mockCompSet(
      {
        address: "1 Main St",
        bedrooms: 2,
        bathrooms: null,
        sqft: null,
        radiusMiles: 2,
      },
      new Date("2026-09-16T00:00:00Z"),
    );
    const assumption = rentAssumptionFromComps(set);
    expect(assumption?.key).toBe("monthly_rent");
    expect(assumption?.valueNum).toBe(set.summary.medianRentCents);
    expect(assumption?.source).toBe("comp");
    expect(assumption?.sourceRef).toContain("mock-rentcast-v1");
  });

  it("honors apply modes", () => {
    expect(shouldApplyRent("display_only", true)).toBe(false);
    expect(shouldApplyRent("overwrite", false)).toBe(true);
    expect(shouldApplyRent("fill_if_unverified", true)).toBe(true);
    expect(shouldApplyRent("fill_if_unverified", false)).toBe(false);
  });
});
