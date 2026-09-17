import { ASSUMPTION_UNITS, type AssumptionKey, type AssumptionValue } from "@/dossier";

import type { ApplyCompsMode, CompSet } from "./types";

// Whether the current monthly_rent may be replaced when the owner pulls
// comps with the default "fill if unverified" mode. Manual numbers stay
// put until they explicitly overwrite.
export function rentIsUnverified(
  assumptions: ReadonlyMap<AssumptionKey, AssumptionValue>,
): boolean {
  const current = assumptions.get("monthly_rent");
  if (!current || current.valueNum === null || current.valueNum <= 0) return true;
  return current.source === "listing" || current.source === "default";
}

export function rentAssumptionFromComps(set: CompSet): AssumptionValue | null {
  const median = set.summary.medianRentCents;
  if (median === null || median <= 0) return null;
  const confidence = set.summary.listingCount >= 3 ? "medium" : "low";
  return {
    key: "monthly_rent",
    valueNum: median,
    valueText: null,
    unit: ASSUMPTION_UNITS.monthly_rent,
    source: "comp",
    confidence,
    sourceRef: `comp:${set.provider}:median`,
  };
}

export function shouldApplyRent(mode: ApplyCompsMode, unverified: boolean): boolean {
  if (mode === "display_only") return false;
  if (mode === "overwrite") return true;
  return unverified;
}
