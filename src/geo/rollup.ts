import { displayCity, displayCounty, displayNeighborhood } from "./public-geo";
import {
  GEO_GRAINS,
  type GeoBucket,
  type GeoFilter,
  type GeoGrain,
  type GeoPropertyFact,
} from "./types";

export function nextGrain(grain: GeoGrain): GeoGrain | null {
  const idx = GEO_GRAINS.indexOf(grain);
  return idx >= 0 && idx < GEO_GRAINS.length - 1 ? GEO_GRAINS[idx + 1] : null;
}

export function previousGrain(grain: GeoGrain): GeoGrain | null {
  const idx = GEO_GRAINS.indexOf(grain);
  return idx > 0 ? GEO_GRAINS[idx - 1] : null;
}

export function applyGeoFilter(facts: GeoPropertyFact[], filter: GeoFilter): GeoPropertyFact[] {
  return facts.filter((fact) => {
    if (filter.state && fact.state !== filter.state) return false;
    if (filter.county && displayCounty(fact.county) !== filter.county) return false;
    if (filter.city && displayCity(fact.city) !== filter.city) return false;
    if (filter.neighborhood && displayNeighborhood(fact.neighborhood) !== filter.neighborhood) {
      return false;
    }
    return true;
  });
}

function bucketIdentity(fact: GeoPropertyFact, grain: GeoGrain) {
  const state = fact.state || "NA";
  const county = displayCounty(fact.county);
  const city = displayCity(fact.city);
  const neighborhood = displayNeighborhood(fact.neighborhood);
  if (grain === "state") {
    return { key: state, label: state, state, county: null, city: null, neighborhood: null };
  }
  if (grain === "county") {
    return {
      key: `${state}|${county}`,
      label: `${county}, ${state}`,
      state,
      county,
      city: null,
      neighborhood: null,
    };
  }
  if (grain === "city") {
    return {
      key: `${state}|${county}|${city}`,
      label: `${city}, ${state}`,
      state,
      county,
      city,
      neighborhood: null,
    };
  }
  return {
    key: `${state}|${county}|${city}|${neighborhood}`,
    label: `${neighborhood} · ${city}, ${state}`,
    state,
    county,
    city,
    neighborhood,
  };
}

function addCents(
  current: number | null,
  add: number | null,
): { total: number | null; counted: boolean } {
  if (add === null || add === undefined) return { total: current, counted: false };
  return { total: (current ?? 0) + add, counted: true };
}

export function rollupByGrain(facts: GeoPropertyFact[], grain: GeoGrain): GeoBucket[] {
  const buckets = new Map<string, GeoBucket>();
  for (const fact of facts) {
    const id = bucketIdentity(fact, grain);
    const existing = buckets.get(id.key) ?? {
      key: id.key,
      grain,
      state: id.state,
      county: id.county,
      city: id.city,
      neighborhood: id.neighborhood,
      label: id.label,
      propertyCount: 0,
      unitCount: 0,
      purchasePriceCents: null,
      purchasePricePropertyCount: 0,
      currentValueCents: null,
      currentValuePropertyCount: 0,
      impactCents: 0,
    };
    existing.propertyCount += 1;
    existing.unitCount += fact.unitCount;
    const purchase = addCents(existing.purchasePriceCents, fact.purchasePriceCents);
    existing.purchasePriceCents = purchase.total;
    if (purchase.counted) existing.purchasePricePropertyCount += 1;
    const value = addCents(existing.currentValueCents, fact.currentValueCents);
    existing.currentValueCents = value.total;
    if (value.counted) existing.currentValuePropertyCount += 1;
    existing.impactCents += fact.impactCents;
    buckets.set(id.key, existing);
  }
  return [...buckets.values()].sort((a, b) => b.propertyCount - a.propertyCount || a.label.localeCompare(b.label));
}

export function parseGrain(value: string | null | undefined): GeoGrain {
  if (value === "county" || value === "city" || value === "neighborhood" || value === "state") {
    return value;
  }
  return "state";
}
