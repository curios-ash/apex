import { parseFreeformAddress, type ParsedAddress } from "@/deals/address";

import { UNKNOWN_CITY, UNKNOWN_COUNTY, UNKNOWN_NEIGHBORHOOD, UNKNOWN_STATE, type PublicGeo } from "./types";

type ZipHint = {
  zip: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
};

type CityHint = {
  city: string;
  state: string;
  county: string;
  latitude: number;
  longitude: number;
  defaultNeighborhood: string;
  zips: ZipHint[];
};

// Deterministic mock census/places gazetteer. Coordinates and county names
// are fixtures — not live Census Bureau output — so tests stay hermetic.
const CITY_HINTS: CityHint[] = [
  {
    city: "Austin",
    state: "TX",
    county: "Travis County",
    latitude: 30.2672,
    longitude: -97.7431,
    defaultNeighborhood: "Downtown",
    zips: [
      { zip: "78701", neighborhood: "Downtown", latitude: 30.2711, longitude: -97.7437 },
      { zip: "78702", neighborhood: "East Austin", latitude: 30.2602, longitude: -97.7145 },
      { zip: "78704", neighborhood: "South Congress", latitude: 30.2457, longitude: -97.761 },
    ],
  },
  {
    city: "Houston",
    state: "TX",
    county: "Harris County",
    latitude: 29.7604,
    longitude: -95.3698,
    defaultNeighborhood: "Downtown",
    zips: [{ zip: "77002", neighborhood: "Downtown", latitude: 29.757, longitude: -95.365 }],
  },
  {
    city: "Dallas",
    state: "TX",
    county: "Dallas County",
    latitude: 32.7767,
    longitude: -96.797,
    defaultNeighborhood: "Downtown",
    zips: [{ zip: "75201", neighborhood: "Downtown", latitude: 32.787, longitude: -96.798 }],
  },
  {
    city: "Fort Worth",
    state: "TX",
    county: "Tarrant County",
    latitude: 32.7555,
    longitude: -97.3308,
    defaultNeighborhood: "Downtown",
    zips: [{ zip: "76102", neighborhood: "Downtown", latitude: 32.755, longitude: -97.332 }],
  },
  {
    city: "Miami Beach",
    state: "FL",
    county: "Miami-Dade County",
    latitude: 25.7907,
    longitude: -80.13,
    defaultNeighborhood: "South Beach",
    zips: [{ zip: "33139", neighborhood: "South Beach", latitude: 25.7907, longitude: -80.13 }],
  },
  {
    city: "Miami",
    state: "FL",
    county: "Miami-Dade County",
    latitude: 25.7617,
    longitude: -80.1918,
    defaultNeighborhood: "Downtown",
    zips: [{ zip: "33130", neighborhood: "Downtown", latitude: 25.772, longitude: -80.198 }],
  },
  {
    city: "Chicago",
    state: "IL",
    county: "Cook County",
    latitude: 41.8781,
    longitude: -87.6298,
    defaultNeighborhood: "Near North Side",
    zips: [{ zip: "60642", neighborhood: "Wicker Park", latitude: 41.9033, longitude: -87.6656 }],
  },
  {
    city: "Philadelphia",
    state: "PA",
    county: "Philadelphia County",
    latitude: 39.9526,
    longitude: -75.1652,
    defaultNeighborhood: "Center City",
    zips: [{ zip: "19103", neighborhood: "Rittenhouse", latitude: 39.9536, longitude: -75.1744 }],
  },
  {
    city: "Springfield",
    state: "OR",
    county: "Lane County",
    latitude: 44.0462,
    longitude: -123.022,
    defaultNeighborhood: "Downtown",
    zips: [{ zip: "97477", neighborhood: "Downtown", latitude: 44.0462, longitude: -123.022 }],
  },
  {
    city: "Phoenix",
    state: "AZ",
    county: "Maricopa County",
    latitude: 33.4484,
    longitude: -112.074,
    defaultNeighborhood: "Midtown",
    zips: [{ zip: "85012", neighborhood: "Midtown", latitude: 33.509, longitude: -112.07 }],
  },
  {
    city: "Boulder",
    state: "CO",
    county: "Boulder County",
    latitude: 40.015,
    longitude: -105.2705,
    defaultNeighborhood: "Downtown",
    zips: [{ zip: "80302", neighborhood: "Downtown", latitude: 40.017, longitude: -105.278 }],
  },
  {
    city: "Atlanta",
    state: "GA",
    county: "Fulton County",
    latitude: 33.749,
    longitude: -84.388,
    defaultNeighborhood: "Midtown",
    zips: [{ zip: "30309", neighborhood: "Midtown", latitude: 33.782, longitude: -84.383 }],
  },
  {
    city: "Seattle",
    state: "WA",
    county: "King County",
    latitude: 47.6062,
    longitude: -122.3321,
    defaultNeighborhood: "Capitol Hill",
    zips: [{ zip: "98102", neighborhood: "Capitol Hill", latitude: 47.633, longitude: -122.322 }],
  },
];

const STREET_HINTS: { match: string; geo: PublicGeo }[] = [
  {
    match: "421 maple street",
    geo: {
      city: "Austin",
      state: "TX",
      county: "Travis County",
      neighborhood: "Downtown",
      latitude: 30.2711,
      longitude: -97.7437,
      source: "mock-census-v1",
    },
  },
  {
    match: "88 ocean avenue",
    geo: {
      city: "Miami Beach",
      state: "FL",
      county: "Miami-Dade County",
      neighborhood: "South Beach",
      latitude: 25.7907,
      longitude: -80.13,
      source: "mock-census-v1",
    },
  },
  {
    match: "1500 w division",
    geo: {
      city: "Chicago",
      state: "IL",
      county: "Cook County",
      neighborhood: "Wicker Park",
      latitude: 41.9033,
      longitude: -87.6656,
      source: "mock-census-v1",
    },
  },
  {
    match: "2101 market street",
    geo: {
      city: "Philadelphia",
      state: "PA",
      county: "Philadelphia County",
      neighborhood: "Rittenhouse",
      latitude: 39.9536,
      longitude: -75.1744,
      source: "mock-census-v1",
    },
  },
  {
    match: "742 evergreen terrace",
    geo: {
      city: "Springfield",
      state: "OR",
      county: "Lane County",
      neighborhood: "Downtown",
      latitude: 44.0462,
      longitude: -123.022,
      source: "mock-census-v1",
    },
  },
];

function norm(value: string): string {
  return value.toLowerCase().replace(/[.,#]/g, "").replace(/\s+/g, " ").trim();
}

function findCity(city: string, state: string): CityHint | undefined {
  const c = norm(city);
  const s = state.toUpperCase();
  return CITY_HINTS.find((hint) => norm(hint.city) === c && hint.state === s);
}

export function parsePublicGeoFromAddress(address: ParsedAddress): PublicGeo {
  const line = norm(address.line1);
  const street = STREET_HINTS.find((hint) => line.includes(hint.match));
  if (street) return street.geo;

  const cityHint = findCity(address.city, address.state);
  if (cityHint) {
    const zip5 = address.zip.slice(0, 5);
    const zipHint = cityHint.zips.find((z) => z.zip === zip5);
    return {
      city: cityHint.city,
      state: cityHint.state,
      county: cityHint.county,
      neighborhood: zipHint?.neighborhood ?? cityHint.defaultNeighborhood,
      latitude: zipHint?.latitude ?? cityHint.latitude,
      longitude: zipHint?.longitude ?? cityHint.longitude,
      source: "mock-census-v1",
    };
  }

  return {
    city: address.city || UNKNOWN_CITY,
    state: address.state || UNKNOWN_STATE,
    county: null,
    neighborhood: null,
    latitude: null,
    longitude: null,
    source: "mock-census-v1",
  };
}

export function parsePublicGeoFromFreeform(raw: string): PublicGeo {
  return parsePublicGeoFromAddress(parseFreeformAddress(raw));
}

export function mergePublicGeo(
  address: ParsedAddress,
  existing: Partial<PublicGeo> & { latitude?: number | null; longitude?: number | null },
): PublicGeo {
  const parsed = parsePublicGeoFromAddress(address);
  const source = existing.source ?? parsed.source;
  return {
    city: address.city || parsed.city,
    state: address.state || parsed.state,
    county: existing.county ?? parsed.county,
    neighborhood: existing.neighborhood ?? parsed.neighborhood,
    latitude: existing.latitude ?? parsed.latitude,
    longitude: existing.longitude ?? parsed.longitude,
    source,
  };
}

export function displayCounty(county: string | null | undefined): string {
  return county && county.trim() ? county : UNKNOWN_COUNTY;
}

export function displayNeighborhood(neighborhood: string | null | undefined): string {
  return neighborhood && neighborhood.trim() ? neighborhood : UNKNOWN_NEIGHBORHOOD;
}

export function displayCity(city: string | null | undefined): string {
  return city && city.trim() ? city : UNKNOWN_CITY;
}
