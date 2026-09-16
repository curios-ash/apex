import { afterEach, describe, expect, it } from "vitest";

import { decodeDevSession, encodeDevSession, isDevAuthEnabled } from "./dev";

const SESSION = { userId: "user-1", workspaceId: "ws-1", email: "owner@example.com" };

afterEach(() => {
  delete process.env.APEX_DEV_AUTH_ENABLED;
  delete process.env.APEX_DEV_AUTH_SECRET;
});

describe("dev session cookie", () => {
  it("round-trips a signed payload", () => {
    const cookie = encodeDevSession(SESSION);
    expect(decodeDevSession(cookie)).toMatchObject({
      userId: "user-1",
      workspaceId: "ws-1",
      email: "owner@example.com",
    });
  });

  it("rejects a tampered payload", () => {
    const cookie = encodeDevSession(SESSION);
    const [body, sig] = cookie.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ ...SESSION, workspaceId: "ws-other", exp: Date.now() + 1000 }),
    ).toString("base64url");
    expect(decodeDevSession(`${tampered}.${sig}`)).toBeNull();
    expect(decodeDevSession(`${body}.${sig.slice(0, -2)}xx`)).toBeNull();
  });

  it("rejects an expired session", () => {
    const cookie = encodeDevSession({ ...SESSION, now: Date.now() - 31 * 24 * 60 * 60 * 1000 });
    expect(decodeDevSession(cookie)).toBeNull();
  });

  it("rejects cookies signed with a different secret", () => {
    const cookie = encodeDevSession(SESSION);
    process.env.APEX_DEV_AUTH_SECRET = "another-secret";
    expect(decodeDevSession(cookie)).toBeNull();
  });

  it("rejects malformed cookies", () => {
    expect(decodeDevSession("")).toBeNull();
    expect(decodeDevSession("no-signature")).toBeNull();
    expect(decodeDevSession("!!!.!!!")).toBeNull();
  });
});

describe("isDevAuthEnabled", () => {
  it("is on for 1/true and off otherwise", () => {
    expect(isDevAuthEnabled()).toBe(false);
    process.env.APEX_DEV_AUTH_ENABLED = "1";
    expect(isDevAuthEnabled()).toBe(true);
    process.env.APEX_DEV_AUTH_ENABLED = "true";
    expect(isDevAuthEnabled()).toBe(true);
    process.env.APEX_DEV_AUTH_ENABLED = "yes";
    expect(isDevAuthEnabled()).toBe(false);
  });
});
