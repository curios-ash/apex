import { describe, expect, it } from "vitest";

import { isValidEmail, normalizeEmail } from "./waitlist";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ashwin@Example.COM ")).toBe("ashwin@example.com");
  });

  it("returns an empty string for non-strings", () => {
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(42)).toBe("");
    expect(normalizeEmail({})).toBe("");
  });
});

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("owner@example.com")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.domain.co")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@tld")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("two@@example.com")).toBe(false);
    expect(isValidEmail("spaces in@example.com")).toBe(false);
  });

  it("rejects over-length input", () => {
    expect(isValidEmail(`${"a".repeat(65)}@example.com`)).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});
