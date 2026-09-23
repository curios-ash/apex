// One price. The first saved address is free. A second address requires this plan.
export const DEAL1_MONTHLY_CENTS = 1900;
export const FREE_SCORED_ADDRESSES = 1;

export const DEAL1_SUBSCRIPTION_STATUSES = [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
] as const;

export type Deal1SubscriptionStatus = (typeof DEAL1_SUBSCRIPTION_STATUSES)[number];

export type PaywallDecision =
  | { allowed: true; reason: "first_check_free" | "subscribed" | "update_saved_address" }
  | { allowed: false; reason: "second_check_requires_plan"; priceCents: typeof DEAL1_MONTHLY_CENTS };

/**
 * Subscribed only when Stripe is turned on and the Deal #1 subscription is
 * active or trialing. A checkout return, a mock plan, and STRIPE_ENABLED off
 * are not a subscription.
 */
export function isDeal1Subscribed(input: {
  stripeEnabled: boolean;
  status: Deal1SubscriptionStatus;
}): boolean {
  if (!input.stripeEnabled) return false;
  return input.status === "active" || input.status === "trialing";
}

/**
 * Paywall rule a user hits:
 * - The first distinct address can be scored and saved with no plan.
 * - Scoring or saving a different address requires the $19/month plan.
 * - Typing the same address again updates that check and does not count as a second address.
 */
export function scoreAttempt(input: {
  savedChecks: number;
  addressAlreadySaved: boolean;
  stripeEnabled: boolean;
  deal1Status: Deal1SubscriptionStatus;
}): PaywallDecision {
  if (input.addressAlreadySaved) return { allowed: true, reason: "update_saved_address" };
  const subscribed = isDeal1Subscribed({
    stripeEnabled: input.stripeEnabled,
    status: input.deal1Status,
  });
  if (subscribed) return { allowed: true, reason: "subscribed" };
  if (input.savedChecks < FREE_SCORED_ADDRESSES) {
    return { allowed: true, reason: "first_check_free" };
  }
  return {
    allowed: false,
    reason: "second_check_requires_plan",
    priceCents: DEAL1_MONTHLY_CENTS,
  };
}
