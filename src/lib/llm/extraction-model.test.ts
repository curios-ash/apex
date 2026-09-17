import { describe, expect, it } from "vitest";

import { DEFAULT_EXTRACTION_MODEL } from "./ai-sdk";
import { computeCostMicrodollars } from "./index";

describe("extraction model pin", () => {
  it("defaults to Gemini 3.1 Flash Lite via the AI Gateway slug", () => {
    expect(DEFAULT_EXTRACTION_MODEL).toBe("google/gemini-3.1-flash-lite");
  });

  it("prices the default model for llm_calls logging", () => {
    expect(computeCostMicrodollars("google/gemini-3.1-flash-lite", 1_000_000, 1_000_000)).toBe(
      0.1 * 1_000_000 + 0.4 * 1_000_000,
    );
  });
});
