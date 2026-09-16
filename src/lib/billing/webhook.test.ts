import { describe, expect, it } from "vitest";

import { mapSubscription } from "./webhook";

const PRICES = {
  ownerBase: "price_owner_base",
  ownerDoor: "price_owner_door",
  portfolioBase: "price_portfolio_base",
  portfolioDoor: "price_portfolio_door",
};

describe("mapSubscription", () => {
  it("maps an owner subscription with its door quantity", () => {
    const mapped = mapSubscription(
      {
        status: "active",
        items: [
          { priceId: "price_owner_base", quantity: 1 },
          { priceId: "price_owner_door", quantity: 3 },
        ],
      },
      PRICES,
    );
    expect(mapped).toEqual({ plan: "owner", status: "active", doors: 3 });
  });

  it("adds back portfolio's 6 included doors", () => {
    const mapped = mapSubscription(
      {
        status: "trialing",
        items: [
          { priceId: "price_portfolio_base", quantity: 1 },
          { priceId: "price_portfolio_door", quantity: 2 },
        ],
      },
      PRICES,
    );
    expect(mapped).toEqual({ plan: "portfolio", status: "trialing", doors: 8 });
  });

  it("handles a portfolio subscription with no door line item", () => {
    const mapped = mapSubscription(
      { status: "active", items: [{ priceId: "price_portfolio_base", quantity: 1 }] },
      PRICES,
    );
    expect(mapped).toEqual({ plan: "portfolio", status: "active", doors: 6 });
  });

  it("returns null for subscriptions without Apex prices", () => {
    expect(
      mapSubscription({ status: "active", items: [{ priceId: "price_unrelated", quantity: 1 }] }, PRICES),
    ).toBeNull();
  });

  it("maps Stripe statuses, defaulting unknown ones to none", () => {
    const items = [{ priceId: "price_owner_base", quantity: 1 }];
    expect(mapSubscription({ status: "past_due", items }, PRICES)?.status).toBe("past_due");
    expect(mapSubscription({ status: "canceled", items }, PRICES)?.status).toBe("canceled");
    expect(mapSubscription({ status: "incomplete", items }, PRICES)?.status).toBe("none");
    expect(mapSubscription({ status: undefined, items }, PRICES)?.status).toBe("none");
  });
});
