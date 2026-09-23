import { describe, expect, it } from "vitest";

import { DEAL1_MONTHLY_CENTS, isDeal1Subscribed, scoreAttempt } from "./paywall";

describe("Deal #1 paywall", () => {
  it("is one price, $19 a month", () => {
    expect(DEAL1_MONTHLY_CENTS).toBe(1900);
  });

  it("lets the first address through and blocks the second until the plan is active", () => {
    expect(
      scoreAttempt({
        savedChecks: 0,
        addressAlreadySaved: false,
        stripeEnabled: false,
        deal1Status: "none",
      }),
    ).toEqual({ allowed: true, reason: "first_check_free" });

    expect(
      scoreAttempt({
        savedChecks: 1,
        addressAlreadySaved: false,
        stripeEnabled: false,
        deal1Status: "none",
      }),
    ).toEqual({
      allowed: false,
      reason: "second_check_requires_plan",
      priceCents: 1900,
    });
  });

  it("treats a repeat of the saved address as an update, not a second check", () => {
    expect(
      scoreAttempt({
        savedChecks: 1,
        addressAlreadySaved: true,
        stripeEnabled: false,
        deal1Status: "none",
      }),
    ).toEqual({ allowed: true, reason: "update_saved_address" });
  });

  it("does not treat Stripe-off or a non-active status as subscribed", () => {
    expect(isDeal1Subscribed({ stripeEnabled: false, status: "active" })).toBe(false);
    expect(isDeal1Subscribed({ stripeEnabled: true, status: "none" })).toBe(false);
    expect(isDeal1Subscribed({ stripeEnabled: true, status: "past_due" })).toBe(false);
    expect(isDeal1Subscribed({ stripeEnabled: true, status: "canceled" })).toBe(false);
    expect(isDeal1Subscribed({ stripeEnabled: true, status: "unpaid" })).toBe(false);
    expect(isDeal1Subscribed({ stripeEnabled: true, status: "active" })).toBe(true);
    expect(isDeal1Subscribed({ stripeEnabled: true, status: "trialing" })).toBe(true);

    expect(
      scoreAttempt({
        savedChecks: 4,
        addressAlreadySaved: false,
        stripeEnabled: false,
        deal1Status: "active",
      }).allowed,
    ).toBe(false);

    expect(
      scoreAttempt({
        savedChecks: 4,
        addressAlreadySaved: false,
        stripeEnabled: true,
        deal1Status: "active",
      }),
    ).toEqual({ allowed: true, reason: "subscribed" });
  });
});
