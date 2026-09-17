import { formatAddress, parseFreeformAddress, type ParsedAddress } from "./address";

export type PlaceSuggestion = {
  placeId: string;
  label: string;
  address: ParsedAddress;
  latitude: number | null;
  longitude: number | null;
  geocoder: "mock" | "google" | "manual";
  matched: boolean;
};

export const MOCK_GEOCODER_ID = "mock-places-v1";

export const MOCK_PLACES: PlaceSuggestion[] = [
  {
    placeId: "mock-421-maple-austin",
    label: "421 Maple Street, Austin, TX 78701",
    address: {
      line1: "421 Maple Street",
      line2: null,
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    latitude: 30.2711,
    longitude: -97.7437,
    geocoder: "mock",
    matched: true,
  },
  {
    placeId: "mock-88-ocean-miami",
    label: "88 Ocean Avenue, Miami Beach, FL 33139",
    address: {
      line1: "88 Ocean Avenue",
      line2: null,
      city: "Miami Beach",
      state: "FL",
      zip: "33139",
    },
    latitude: 25.7907,
    longitude: -80.13,
    geocoder: "mock",
    matched: true,
  },
  {
    placeId: "mock-1500-division-chicago",
    label: "1500 W Division Street, Chicago, IL 60642",
    address: {
      line1: "1500 W Division Street",
      line2: null,
      city: "Chicago",
      state: "IL",
      zip: "60642",
    },
    latitude: 41.9033,
    longitude: -87.6656,
    geocoder: "mock",
    matched: true,
  },
  {
    placeId: "mock-2101-market-philly",
    label: "2101 Market Street, Philadelphia, PA 19103",
    address: {
      line1: "2101 Market Street",
      line2: null,
      city: "Philadelphia",
      state: "PA",
      zip: "19103",
    },
    latitude: 39.9536,
    longitude: -75.1744,
    geocoder: "mock",
    matched: true,
  },
  {
    placeId: "mock-742-evergreen-springfield",
    label: "742 Evergreen Terrace, Springfield, OR 97477",
    address: {
      line1: "742 Evergreen Terrace",
      line2: null,
      city: "Springfield",
      state: "OR",
      zip: "97477",
    },
    latitude: 44.0462,
    longitude: -123.022,
    geocoder: "mock",
    matched: true,
  },
];

function scorePlace(query: string, place: PlaceSuggestion): number {
  const q = query.toLowerCase();
  const hay = `${place.label} ${place.address.line1} ${place.address.city} ${place.address.zip}`.toLowerCase();
  if (hay.includes(q)) return 100;
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return (hits / tokens.length) * 80;
}

export function searchMockPlaces(query: string, limit = 5): PlaceSuggestion[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return MOCK_PLACES.map((place) => ({ place, score: scorePlace(q, place) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.place);
}

export function mockPlaceById(placeId: string): PlaceSuggestion | null {
  return MOCK_PLACES.find((p) => p.placeId === placeId) ?? null;
}

export function freeTextSuggestion(query: string): PlaceSuggestion {
  const address = parseFreeformAddress(query);
  return {
    placeId: `manual:${encodeURIComponent(query.trim().slice(0, 80))}`,
    label: formatAddress(address),
    address,
    latitude: null,
    longitude: null,
    geocoder: "manual",
    matched: false,
  };
}

export function googleMapsKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

type GooglePrediction = { place_id?: string; description?: string };
type GoogleDetails = {
  result?: {
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    address_components?: { long_name: string; short_name: string; types: string[] }[];
  };
};

function component(
  components: { long_name: string; short_name: string; types: string[] }[] | undefined,
  type: string,
  short = false,
): string | null {
  const hit = components?.find((c) => c.types.includes(type));
  if (!hit) return null;
  return short ? hit.short_name : hit.long_name;
}

function suggestionFromGoogleDetails(
  placeId: string,
  details: GoogleDetails,
  fallbackLabel: string,
): PlaceSuggestion {
  const result = details.result ?? {};
  const comps = result.address_components;
  const streetNumber = component(comps, "street_number");
  const route = component(comps, "route");
  const line1 = [streetNumber, route].filter(Boolean).join(" ") || fallbackLabel.split(",")[0];
  const address: ParsedAddress = {
    line1,
    line2: component(comps, "subpremise"),
    city:
      component(comps, "locality") ??
      component(comps, "sublocality") ??
      component(comps, "administrative_area_level_2") ??
      "Unknown",
    state: component(comps, "administrative_area_level_1", true) ?? "NA",
    zip: component(comps, "postal_code") ?? "00000",
  };
  return {
    placeId,
    label: result.formatted_address ?? formatAddress(address),
    address,
    latitude: result.geometry?.location?.lat ?? null,
    longitude: result.geometry?.location?.lng ?? null,
    geocoder: "google",
    matched: true,
  };
}

export async function lookupPlaces(query: string): Promise<{
  provider: "google" | "mock";
  suggestions: PlaceSuggestion[];
}> {
  const q = query.trim();
  if (q.length < 2) return { provider: googleMapsKey() ? "google" : "mock", suggestions: [] };

  const key = googleMapsKey();
  if (!key) {
    const matches = searchMockPlaces(q);
    return { provider: "mock", suggestions: [...matches, freeTextSuggestion(q)] };
  }

  const autoUrl = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  autoUrl.searchParams.set("input", q);
  autoUrl.searchParams.set("types", "address");
  autoUrl.searchParams.set("key", key);
  const autoRes = await fetch(autoUrl);
  if (!autoRes.ok) {
    const matches = searchMockPlaces(q);
    return { provider: "mock", suggestions: [...matches, freeTextSuggestion(q)] };
  }
  const autoJson = (await autoRes.json()) as { predictions?: GooglePrediction[] };
  const predictions = (autoJson.predictions ?? []).slice(0, 5);
  const suggestions: PlaceSuggestion[] = [];
  for (const prediction of predictions) {
    if (!prediction.place_id) continue;
    const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    detailsUrl.searchParams.set("place_id", prediction.place_id);
    detailsUrl.searchParams.set("fields", "formatted_address,geometry,address_components");
    detailsUrl.searchParams.set("key", key);
    const detailsRes = await fetch(detailsUrl);
    if (!detailsRes.ok) continue;
    const details = (await detailsRes.json()) as GoogleDetails;
    suggestions.push(
      suggestionFromGoogleDetails(prediction.place_id, details, prediction.description ?? q),
    );
  }
  if (suggestions.length === 0) {
    return { provider: "google", suggestions: [freeTextSuggestion(q)] };
  }
  return { provider: "google", suggestions };
}

export function resolvePlace(placeId: string, query: string): PlaceSuggestion {
  const mock = mockPlaceById(placeId);
  if (mock) return mock;
  return freeTextSuggestion(query);
}
