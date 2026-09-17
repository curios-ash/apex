import { afterEach, describe, expect, it } from "vitest";

import { isClerkConfigured } from "./configured";

afterEach(() => {
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
});

describe("isClerkConfigured", () => {
  it("is false when either key is missing", () => {
    expect(isClerkConfigured()).toBe(false);
    process.env.CLERK_SECRET_KEY = "sk_test";
    expect(isClerkConfigured()).toBe(false);
    delete process.env.CLERK_SECRET_KEY;
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
    expect(isClerkConfigured()).toBe(false);
  });

  it("is true when both keys are present", () => {
    process.env.CLERK_SECRET_KEY = "sk_test";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
    expect(isClerkConfigured()).toBe(true);
  });

  it("treats whitespace-only keys as missing", () => {
    process.env.CLERK_SECRET_KEY = "   ";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
    expect(isClerkConfigured()).toBe(false);
  });
});
