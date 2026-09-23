import { describe, expect, it } from "vitest";

import { DEFAULT_DEAL1_GATES } from "./gates";
import { normalizeAddress, underwritingFromForm } from "./parse";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("score field labels", () => {
  it("labels a blank price and rent as estimates and a typed price as entered", () => {
    const parsed = underwritingFromForm(
      form({ address: "1204 Governor Dr, Huntsville AL" }),
      DEFAULT_DEAL1_GATES,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.input.purchasePriceCents).toEqual({
      value: 275_000_00,
      source: "estimate",
    });
    expect(parsed.input.monthlyRentCents.source).toBe("estimate");
    expect(parsed.input.annualRate).toEqual({ value: 0.065, source: "estimate" });

    const typed = underwritingFromForm(
      form({
        address: "1204 Governor Dr, Huntsville AL",
        purchasePrice: "260000",
        monthlyRent: "2800",
      }),
      DEFAULT_DEAL1_GATES,
    );
    expect(typed.ok).toBe(true);
    if (!typed.ok) return;
    expect(typed.input.purchasePriceCents).toEqual({ value: 260_000_00, source: "entered" });
    expect(typed.input.monthlyRentCents).toEqual({ value: 2_800_00, source: "entered" });
    expect(normalizeAddress(typed.address)).toBe("1204 governor dr, huntsville al");
  });
});
