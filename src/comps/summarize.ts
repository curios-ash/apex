import type { CompListing, CompSummary } from "./types";

// Integer median of a non-empty sorted list. Even length: average of the two
// middle values, rounded to nearest cent (half away from zero via Math.round).
export function medianCents(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function summarizeListings(listings: readonly CompListing[]): CompSummary {
  const rents = listings
    .map((l) => l.rentCents)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (rents.length === 0) {
    return {
      listingCount: listings.length,
      medianRentCents: null,
      minRentCents: null,
      maxRentCents: null,
      meanRentCents: null,
    };
  }
  const sum = rents.reduce((s, n) => s + n, 0);
  return {
    listingCount: listings.length,
    medianRentCents: medianCents(rents),
    minRentCents: rents[0],
    maxRentCents: rents[rents.length - 1],
    meanRentCents: Math.round(sum / rents.length),
  };
}
