import { describe, expect, it } from "vitest";

import { billedDoorQuantity, monthlyPriceCents } from "./plans";

// Part 4 launch pricing: Free $0; Owner $19/mo + $9/door; Portfolio $79/mo
// including 6 doors, then $7/door.
describe("monthlyPriceCents", () => {
  it("free is always $0", () => {
    expect(monthlyPriceCents("free", 0)).toBe(0);
    expect(monthlyPriceCents("free", 12)).toBe(0);
  });

  it("owner charges base plus every door", () => {
    expect(monthlyPriceCents("owner", 1)).toBe(28_00); // $19 + $9
    expect(monthlyPriceCents("owner", 3)).toBe(46_00); // the plan page's "3 doors ≈ $46"
    expect(monthlyPriceCents("owner", 10)).toBe(109_00);
  });

  it("portfolio includes 6 doors, then charges per door", () => {
    expect(monthlyPriceCents("portfolio", 3)).toBe(79_00);
    expect(monthlyPriceCents("portfolio", 6)).toBe(79_00);
    expect(monthlyPriceCents("portfolio", 8)).toBe(93_00);
  });

  it("treats negative and fractional doors defensively", () => {
    expect(monthlyPriceCents("owner", -2)).toBe(19_00);
    expect(monthlyPriceCents("portfolio", 7.9)).toBe(86_00);
  });
});

describe("billedDoorQuantity", () => {
  it("is every door for owner, only the excess for portfolio", () => {
    expect(billedDoorQuantity("owner", 3)).toBe(3);
    expect(billedDoorQuantity("portfolio", 6)).toBe(0);
    expect(billedDoorQuantity("portfolio", 9)).toBe(3);
  });
});
