import type { ParsedAddress } from "@/deals/address";

import type { PublicGeo } from "./types";

// Live Census Bureau geocoder is optional and off by default. No API key;
// enable with CENSUS_GEOCODER_ENABLED=true. Failures fall back to the mock parser.
export function censusGeocoderEnabled(): boolean {
  return process.env.CENSUS_GEOCODER_ENABLED === "true";
}

type CensusResponse = {
  result?: {
    addressMatches?: {
      coordinates?: { x?: number; y?: number };
      addressComponents?: { city?: string; state?: string; zip?: string };
      geographies?: {
        Counties?: { NAME?: string }[];
        "Census Tracts"?: { NAME?: string }[];
      };
    }[];
  };
};

export async function lookupCensusGeo(address: ParsedAddress): Promise<PublicGeo | null> {
  if (!censusGeocoderEnabled()) return null;
  const line = [address.line1, address.city, address.state, address.zip].filter(Boolean).join(", ");
  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress");
  url.searchParams.set("address", line);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const json = (await res.json()) as CensusResponse;
    const match = json.result?.addressMatches?.[0];
    if (!match) return null;
    const county = match.geographies?.Counties?.[0]?.NAME ?? null;
    const tract = match.geographies?.["Census Tracts"]?.[0]?.NAME ?? null;
    return {
      city: match.addressComponents?.city || address.city,
      state: match.addressComponents?.state || address.state,
      county,
      neighborhood: tract,
      latitude: match.coordinates?.y ?? null,
      longitude: match.coordinates?.x ?? null,
      source: "census",
    };
  } catch {
    return null;
  }
}
