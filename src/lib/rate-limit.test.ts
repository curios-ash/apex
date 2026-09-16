import { beforeEach, describe, expect, it, vi } from "vitest";

import { clientIp, rateLimit, resetRateLimits } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useRealTimers();
  });

  it("allows up to the limit within the window, then blocks", () => {
    const results = Array.from({ length: 4 }, () => rateLimit("k", 3, 60_000));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[3].remaining).toBe(0);
  });

  it("resets after the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T00:00:00Z"));
    expect(rateLimit("k", 1, 60_000).ok).toBe(true);
    expect(rateLimit("k", 1, 60_000).ok).toBe(false);
    vi.setSystemTime(new Date("2026-09-16T00:02:00Z"));
    expect(rateLimit("k", 1, 60_000).ok).toBe(true);
  });

  it("tracks keys independently", () => {
    expect(rateLimit("a", 1, 60_000).ok).toBe(true);
    expect(rateLimit("b", 1, 60_000).ok).toBe(true);
    expect(rateLimit("a", 1, 60_000).ok).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for hop", () => {
    const req = new Request("https://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip then unknown", () => {
    expect(clientIp(new Request("https://x", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe(
      "9.9.9.9",
    );
    expect(clientIp(new Request("https://x"))).toBe("unknown");
  });
});
