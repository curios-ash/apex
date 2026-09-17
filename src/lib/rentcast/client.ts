import { mockCompSet, summarizeListings, type CompQuery, type CompSet } from "@/comps";

// RentCast client. Unset RENTCAST_API_KEY → deterministic mock (same pattern
// as the LLM mock). Live calls never compute finance outputs — they return
// listings; median rent is applied as an assumption elsewhere.

const DEFAULT_BASE = "https://api.rentcast.io/v1";

export interface RentCastEnv {
  RENTCAST_API_KEY?: string;
  RENTCAST_BASE_URL?: string;
  [key: string]: string | undefined;
}

type FetchLike = typeof fetch;

function dollarsToCents(price: unknown): number | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  return Math.round(price * 100);
}

interface RentCastListingJson {
  id?: unknown;
  formattedAddress?: unknown;
  city?: unknown;
  state?: unknown;
  zipCode?: unknown;
  price?: unknown;
  bedrooms?: unknown;
  bathrooms?: unknown;
  squareFootage?: unknown;
  listedDate?: unknown;
  distance?: unknown;
}

interface RentCastAvmJson {
  rent?: unknown;
  rentRangeLow?: unknown;
  rentRangeHigh?: unknown;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapListing(raw: RentCastListingJson, index: number): CompSet["listings"][number] | null {
  const rentCents = dollarsToCents(raw.price);
  if (rentCents === null) return null;
  return {
    id: asString(raw.id) ?? `rentcast-${index}`,
    formattedAddress: asString(raw.formattedAddress) ?? "Unknown address",
    city: asString(raw.city),
    state: asString(raw.state),
    zip: asString(raw.zipCode),
    rentCents,
    bedrooms: asNumber(raw.bedrooms),
    bathrooms: asNumber(raw.bathrooms),
    sqft: asNumber(raw.squareFootage) !== null ? Math.round(asNumber(raw.squareFootage)!) : null,
    listedDate: asString(raw.listedDate),
    distanceMiles: asNumber(raw.distance),
  };
}

async function liveCompSet(
  query: CompQuery,
  now: Date,
  env: RentCastEnv,
  fetchImpl: FetchLike,
): Promise<CompSet> {
  const key = env.RENTCAST_API_KEY;
  if (!key) throw new Error("RENTCAST_API_KEY is not set");
  const base = (env.RENTCAST_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
  const params = new URLSearchParams({
    address: query.address,
    radius: String(query.radiusMiles),
    limit: "25",
  });
  if (query.bedrooms && query.bedrooms > 0) params.set("bedrooms", String(query.bedrooms));

  const headers = { "X-Api-Key": key, Accept: "application/json" };
  const listingsUrl = `${base}/listings/rental/long-term?${params.toString()}`;
  const listingsRes = await fetchImpl(listingsUrl, { headers });
  if (!listingsRes.ok) {
    throw new Error(`RentCast listings ${listingsRes.status}`);
  }
  const listingsJson = (await listingsRes.json()) as unknown;
  const rawList = Array.isArray(listingsJson) ? listingsJson : [];
  const listings = rawList
    .map((row, i) => mapListing(row as RentCastListingJson, i))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  let avmRentCents: number | null = null;
  try {
    const avmParams = new URLSearchParams({ address: query.address });
    const avmRes = await fetchImpl(`${base}/avm/rent/long-term?${avmParams.toString()}`, {
      headers,
    });
    if (avmRes.ok) {
      const avm = (await avmRes.json()) as RentCastAvmJson;
      avmRentCents = dollarsToCents(avm.rent);
    }
  } catch {
    avmRentCents = null;
  }

  return {
    schemaVersion: "comps-v1",
    provider: "rentcast",
    usedMock: false,
    fetchedAt: now.toISOString(),
    query,
    listings,
    summary: summarizeListings(listings),
    avmRentCents,
  };
}

export function isRentCastConfigured(env: RentCastEnv = process.env): boolean {
  return Boolean(env.RENTCAST_API_KEY && env.RENTCAST_API_KEY.trim());
}

export async function fetchCompSet(params: {
  query: CompQuery;
  now?: Date;
  env?: RentCastEnv;
  fetchImpl?: FetchLike;
}): Promise<CompSet> {
  const env = params.env ?? process.env;
  const now = params.now ?? new Date();
  if (!isRentCastConfigured(env)) {
    return mockCompSet(params.query, now);
  }
  return liveCompSet(params.query, now, env, params.fetchImpl ?? fetch);
}
