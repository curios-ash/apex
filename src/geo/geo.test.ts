import { describe, expect, it } from "vitest";

import { parseFreeformAddress } from "@/deals/address";

import { parseBulkProperties } from "./csv";
import { parsePublicGeoFromAddress } from "./public-geo";
import { applyGeoFilter, parseGrain, rollupByGrain } from "./rollup";
import type { GeoPropertyFact } from "./types";

const facts: GeoPropertyFact[] = [
  {
    id: "a",
    state: "TX",
    county: "Travis County",
    city: "Austin",
    neighborhood: "Downtown",
    unitCount: 2,
    purchasePriceCents: 289_000_00,
    currentValueCents: 310_000_00,
    impactCents: 1_200_00,
  },
  {
    id: "b",
    state: "TX",
    county: "Harris County",
    city: "Houston",
    neighborhood: "Downtown",
    unitCount: 1,
    purchasePriceCents: 175_000_00,
    currentValueCents: null,
    impactCents: 0,
  },
  {
    id: "c",
    state: "FL",
    county: "Miami-Dade County",
    city: "Miami Beach",
    neighborhood: "South Beach",
    unitCount: 4,
    purchasePriceCents: null,
    currentValueCents: 900_000_00,
    impactCents: 50_00,
  },
  {
    id: "d",
    state: "TX",
    county: null,
    city: "Unknown",
    neighborhood: null,
    unitCount: 1,
    purchasePriceCents: 80_000_00,
    currentValueCents: 80_000_00,
    impactCents: 0,
  },
];

describe("parsePublicGeoFromAddress", () => {
  it("attaches Travis County and Downtown to the Maple Austin fixture", () => {
    const geo = parsePublicGeoFromAddress(
      parseFreeformAddress("421 Maple Street, Austin, TX 78701"),
    );
    expect(geo.county).toBe("Travis County");
    expect(geo.neighborhood).toBe("Downtown");
    expect(geo.latitude).toBe(30.2711);
    expect(geo.longitude).toBe(-97.7437);
    expect(geo.source).toBe("mock-census-v1");
  });

  it("uses city gazetteer when the street is unknown but city/state match", () => {
    const geo = parsePublicGeoFromAddress(
      parseFreeformAddress("9 Imaginary Lane, Austin, TX 78702"),
    );
    expect(geo.county).toBe("Travis County");
    expect(geo.neighborhood).toBe("East Austin");
    expect(geo.latitude).not.toBeNull();
  });

  it("leaves county empty when the city is not in the gazetteer", () => {
    const geo = parsePublicGeoFromAddress(parseFreeformAddress("the duplex on maple"));
    expect(geo.county).toBeNull();
    expect(geo.latitude).toBeNull();
  });
});

describe("parseBulkProperties", () => {
  it("parses one freeform address per line", () => {
    const rows = parseBulkProperties(
      "421 Maple Street, Austin, TX 78701\n88 Ocean Avenue, Miami Beach, FL 33139\n",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].address.city).toBe("Austin");
    expect(rows[1].address.state).toBe("FL");
  });

  it("parses a headered CSV with units and purchase price", () => {
    const rows = parseBulkProperties(
      [
        "address,city,state,zip,units,name,purchase_price",
        '"1200 Main Street",Houston,TX,77002,3,Main Street,425000',
      ].join("\n"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].address.city).toBe("Houston");
    expect(rows[0].unitCount).toBe(3);
    expect(rows[0].name).toBe("Main Street");
    expect(rows[0].purchasePriceCents).toBe(425_000_00);
  });
});

describe("rollupByGrain", () => {
  it("sums property count, units, and stored cents by state", () => {
    const buckets = rollupByGrain(facts, "state");
    const tx = buckets.find((b) => b.key === "TX");
    const fl = buckets.find((b) => b.key === "FL");
    expect(tx?.propertyCount).toBe(3);
    expect(tx?.unitCount).toBe(4);
    expect(tx?.purchasePriceCents).toBe(289_000_00 + 175_000_00 + 80_000_00);
    expect(tx?.purchasePricePropertyCount).toBe(3);
    expect(tx?.currentValueCents).toBe(310_000_00 + 80_000_00);
    expect(tx?.currentValuePropertyCount).toBe(2);
    expect(tx?.impactCents).toBe(1_200_00);
    expect(fl?.propertyCount).toBe(1);
    expect(fl?.purchasePriceCents).toBeNull();
    expect(fl?.purchasePricePropertyCount).toBe(0);
    expect(fl?.currentValueCents).toBe(900_000_00);
  });

  it("does not invent county labels — null county is Unknown county", () => {
    const buckets = rollupByGrain(facts, "county");
    const unknown = buckets.find((b) => b.county === "Unknown county");
    expect(unknown?.propertyCount).toBe(1);
    expect(unknown?.unitCount).toBe(1);
  });

  it("narrows to a state then rolls up counties", () => {
    const tx = applyGeoFilter(facts, { state: "TX" });
    const counties = rollupByGrain(tx, "county");
    expect(counties.every((b) => b.state === "TX")).toBe(true);
    expect(counties).toHaveLength(3);
  });

  it("rolls neighborhood as city-scoped keys so Downtown TX cities stay separate", () => {
    const neighborhoods = rollupByGrain(facts, "neighborhood");
    const downtowns = neighborhoods.filter((b) => b.neighborhood === "Downtown");
    expect(downtowns).toHaveLength(2);
    expect(downtowns.map((b) => b.city).sort()).toEqual(["Austin", "Houston"]);
  });

  it("parses grain query values and defaults to state", () => {
    expect(parseGrain("neighborhood")).toBe("neighborhood");
    expect(parseGrain("nope")).toBe("state");
  });
});
