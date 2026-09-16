// The plan catalog — master plan Part 4 pricing, as data. Pure module: no
// I/O, no Stripe imports. Price math is deterministic and unit-tested; the
// LLM never touches any of this.

export type PlanId = "free" | "owner" | "portfolio";

export interface Plan {
  id: PlanId;
  name: string;
  // Monthly base price in cents.
  baseCents: number;
  // Doors covered by the base price (Portfolio includes 6).
  includedDoors: number;
  // Monthly cents per door beyond the included count (Owner: every door).
  perDoorCents: number;
  tagline: string;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    baseCents: 0,
    includedDoors: 0,
    perDoorCents: 0,
    tagline: "Try the audit on your own statements.",
    features: [
      "2 deal dossiers per month",
      "1 PM statement audit per month",
      "Read-only property record",
    ],
  },
  owner: {
    id: "owner",
    name: "Owner",
    baseCents: 1900,
    includedDoors: 0,
    perDoorCents: 900,
    tagline: "The monthly owner review for your rentals.",
    features: [
      "Monthly owner review per property",
      "PM statement audit with evidence",
      "Approval queue for drafted follow-ups",
      "Renewal calendar + impact ledger",
    ],
  },
  portfolio: {
    id: "portfolio",
    name: "Portfolio",
    baseCents: 7900,
    includedDoors: 6,
    perDoorCents: 700,
    tagline: "Multi-entity oversight with a CPA seat.",
    features: [
      "Everything in Owner",
      "6 doors included, then $7/door",
      "Multi-entity support",
      "CPA seat + policy thresholds",
    ],
  },
};

export const PLAN_IDS: PlanId[] = ["free", "owner", "portfolio"];

// Monthly price in cents for a plan at a door count. Doors below zero are
// treated as zero; fractional doors do not exist.
export function monthlyPriceCents(planId: PlanId, doors: number): number {
  const plan = PLANS[planId];
  const d = Math.max(0, Math.floor(doors));
  const billableDoors = Math.max(0, d - plan.includedDoors);
  return plan.baseCents + billableDoors * plan.perDoorCents;
}

// Doors the per-door line item is billed for (what Checkout's quantity
// carries). Inverse of monthlyPriceCents' door term.
export function billedDoorQuantity(planId: PlanId, totalDoors: number): number {
  const plan = PLANS[planId];
  return Math.max(0, Math.floor(totalDoors) - plan.includedDoors);
}
