export const GEO_GRAINS = ["state", "county", "city", "neighborhood"] as const;
export type GeoGrain = (typeof GEO_GRAINS)[number];

export type GeoSource = "mock-census-v1" | "google" | "census";

export type PublicGeo = {
  city: string;
  state: string;
  county: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  source: GeoSource;
};

export type GeoPropertyFact = {
  id: string;
  state: string;
  county: string | null;
  city: string;
  neighborhood: string | null;
  unitCount: number;
  purchasePriceCents: number | null;
  currentValueCents: number | null;
  impactCents: number;
};

export type GeoFilter = {
  state?: string;
  county?: string;
  city?: string;
  neighborhood?: string;
};

export type GeoBucket = {
  key: string;
  grain: GeoGrain;
  state: string;
  county: string | null;
  city: string | null;
  neighborhood: string | null;
  label: string;
  propertyCount: number;
  unitCount: number;
  purchasePriceCents: number | null;
  purchasePricePropertyCount: number;
  currentValueCents: number | null;
  currentValuePropertyCount: number;
  impactCents: number;
};

export const UNKNOWN_COUNTY = "Unknown county";
export const UNKNOWN_NEIGHBORHOOD = "Unknown neighborhood";
export const UNKNOWN_CITY = "Unknown city";
export const UNKNOWN_STATE = "NA";
