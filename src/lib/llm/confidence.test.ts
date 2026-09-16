import { describe, expect, it } from "vitest";

import {
  extractionStatusFor,
  lowConfidenceFields,
  overallConfidence,
} from "./confidence";

describe("overallConfidence", () => {
  it("is the mean of field confidences, rounded to 3 decimals", () => {
    expect(overallConfidence({ a: 0.9, b: 0.8, c: 1 })).toBe(0.9);
  });

  it("is 0 for empty input", () => {
    expect(overallConfidence({})).toBe(0);
  });
});

describe("lowConfidenceFields", () => {
  it("returns fields below the threshold, sorted", () => {
    expect(lowConfidenceFields({ b: 0.5, a: 0.95, c: 0.84 })).toEqual(["b", "c"]);
  });
});

describe("extractionStatusFor", () => {
  it("needs_review when any field is below threshold", () => {
    expect(extractionStatusFor({ a: 0.99, b: 0.5 })).toBe("needs_review");
  });

  it("pending when all fields clear the threshold", () => {
    expect(extractionStatusFor({ a: 0.99, b: 0.9 })).toBe("pending");
  });
});
