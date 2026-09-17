import { summarizeListings } from "./summarize";
import {
  COMPS_SCHEMA_VERSION,
  MOCK_RENTCAST_PROVIDER,
  type CompListing,
  type CompQuery,
  type CompSet,
} from "./types";

// Deterministic mock RentCast response. Same address + beds always yields
// the same five listings so tests and local underwriting need no API key.

function fnv1a(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREETS = [
  "Oak",
  "Maple",
  "Pine",
  "Cedar",
  "Walnut",
  "Elm",
  "Birch",
  "Willow",
] as const;

export function mockCompSet(query: CompQuery, now: Date): CompSet {
  const key = `${query.address.trim().toLowerCase()}|${query.bedrooms ?? ""}|${query.radiusMiles}`;
  const seed = fnv1a(key);
  const rand = mulberry32(seed);
  const bedrooms = query.bedrooms && query.bedrooms > 0 ? query.bedrooms : 3;
  // Base monthly rent $1,450–$2,650, then five comps within ±12%.
  const baseDollars = 1450 + Math.floor(rand() * 1201);
  const listings: CompListing[] = [];
  for (let i = 0; i < 5; i++) {
    const delta = 0.88 + rand() * 0.24;
    const streetNum = 100 + Math.floor(rand() * 8900);
    const street = STREETS[Math.floor(rand() * STREETS.length)];
    const rentCents = Math.round(baseDollars * 100 * delta);
    listings.push({
      id: `mock-${seed.toString(16)}-${i}`,
      formattedAddress: `${streetNum} ${street} St`,
      city: null,
      state: null,
      zip: null,
      rentCents,
      bedrooms,
      bathrooms: query.bathrooms,
      sqft: query.sqft ? Math.round(query.sqft * (0.9 + rand() * 0.2)) : null,
      listedDate: null,
      distanceMiles: Math.round((0.2 + rand() * 1.6) * 10) / 10,
    });
  }
  listings.sort((a, b) => a.rentCents - b.rentCents);
  return {
    schemaVersion: COMPS_SCHEMA_VERSION,
    provider: MOCK_RENTCAST_PROVIDER,
    usedMock: true,
    fetchedAt: now.toISOString(),
    query,
    listings,
    summary: summarizeListings(listings),
    avmRentCents: null,
  };
}
