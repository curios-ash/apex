import { describe, expect, it } from "vitest";

import { fetchCompSet, isRentCastConfigured } from "./client";

describe("fetchCompSet", () => {
  it("uses the mock when the API key is unset", async () => {
    const set = await fetchCompSet({
      query: {
        address: "421 Maple Street, Austin, TX 78704",
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1400,
        radiusMiles: 2,
      },
      now: new Date("2026-09-16T00:00:00Z"),
      env: {},
      fetchImpl: async () => {
        throw new Error("network should not be called");
      },
    });
    expect(set.usedMock).toBe(true);
    expect(set.provider).toBe("mock-rentcast-v1");
    expect(set.listings.length).toBe(5);
  });

  it("maps live listings to cents and never calls the LLM", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/listings/")) {
        return Response.json([
          {
            id: "a",
            formattedAddress: "10 Oak St",
            city: "Austin",
            state: "TX",
            zipCode: "78704",
            price: 2100,
            bedrooms: 3,
            bathrooms: 2,
            squareFootage: 1300,
            distance: 0.4,
          },
          {
            id: "b",
            formattedAddress: "12 Oak St",
            price: 2300,
            bedrooms: 3,
          },
        ]);
      }
      return Response.json({ rent: 2200, rentRangeLow: 2000, rentRangeHigh: 2400 });
    };

    const set = await fetchCompSet({
      query: {
        address: "421 Maple Street, Austin, TX 78704",
        bedrooms: 3,
        bathrooms: null,
        sqft: null,
        radiusMiles: 2,
      },
      now: new Date("2026-09-16T00:00:00Z"),
      env: { RENTCAST_API_KEY: "test-key", RENTCAST_BASE_URL: "https://api.rentcast.io/v1" },
      fetchImpl,
    });
    expect(set.usedMock).toBe(false);
    expect(set.listings.map((l) => l.rentCents)).toEqual([210_000, 230_000]);
    expect(set.summary.medianRentCents).toBe(220_000);
    expect(set.avmRentCents).toBe(220_000);
  });

  it("reports configuration from the env", () => {
    expect(isRentCastConfigured({})).toBe(false);
    expect(isRentCastConfigured({ RENTCAST_API_KEY: "  " })).toBe(false);
    expect(isRentCastConfigured({ RENTCAST_API_KEY: "rc_live_x" })).toBe(true);
  });
});
