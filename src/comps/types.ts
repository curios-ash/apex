// Rent comps for the underwriter. Pure TypeScript — no I/O. Comps feed
// assumption rows only; they never compute NOI/DSCR/IRR. Money is integer
// cents. The live RentCast client lives in src/lib/rentcast.

export const COMPS_SCHEMA_VERSION = "comps-v1" as const;
export const MOCK_RENTCAST_PROVIDER = "mock-rentcast-v1" as const;
export const LIVE_RENTCAST_PROVIDER = "rentcast" as const;

export type CompProvider =
  | typeof MOCK_RENTCAST_PROVIDER
  | typeof LIVE_RENTCAST_PROVIDER;

export interface CompQuery {
  address: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  // Miles; default 2.
  radiusMiles: number;
}

export interface CompListing {
  id: string;
  formattedAddress: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  // Monthly asking rent, integer cents.
  rentCents: number;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  listedDate: string | null;
  distanceMiles: number | null;
}

export interface CompSummary {
  listingCount: number;
  medianRentCents: number | null;
  minRentCents: number | null;
  maxRentCents: number | null;
  meanRentCents: number | null;
}

export interface CompSet {
  schemaVersion: typeof COMPS_SCHEMA_VERSION;
  provider: CompProvider;
  // True when the live client was asked for but a mock was used (unset key).
  usedMock: boolean;
  fetchedAt: string;
  query: CompQuery;
  listings: CompListing[];
  summary: CompSummary;
  // Display-only AVM figure from RentCast when the live API returns one.
  // Never used as an engine input unless the owner applies it as an assumption.
  avmRentCents: number | null;
}

export type ApplyCompsMode = "fill_if_unverified" | "overwrite" | "display_only";
