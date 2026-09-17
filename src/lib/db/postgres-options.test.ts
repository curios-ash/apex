import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_DATABASE_URL,
  assertDatabaseUrlForRuntime,
  isLocalDatabaseUrl,
  isNeonDatabaseUrl,
  postgresClientOptions,
  resolveDatabaseUrl,
} from "./postgres-options";

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL;
});

describe("resolveDatabaseUrl", () => {
  it("falls back to local docker compose", () => {
    expect(resolveDatabaseUrl({})).toBe(DEFAULT_DATABASE_URL);
  });

  it("uses DATABASE_URL when set", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "postgres://n@host/db" })).toBe("postgres://n@host/db");
  });
});

describe("isNeonDatabaseUrl", () => {
  it("detects neon hosts and poolers", () => {
    expect(isNeonDatabaseUrl("postgres://u:p@ep-foo.us-east-1.aws.neon.tech/neondb")).toBe(true);
    expect(isNeonDatabaseUrl("postgres://u:p@ep-foo-pooler.us-east-1.aws.neon.tech/neondb")).toBe(true);
    expect(isNeonDatabaseUrl(DEFAULT_DATABASE_URL)).toBe(false);
  });
});

describe("postgresClientOptions", () => {
  it("keeps a small pool for local docker", () => {
    expect(postgresClientOptions(DEFAULT_DATABASE_URL, {})).toMatchObject({
      max: 10,
      prepare: true,
    });
  });

  it("disables prepared statements on Neon / Vercel", () => {
    const neon = postgresClientOptions("postgres://u:p@ep-foo.us-east-1.aws.neon.tech/neondb", {});
    expect(neon.max).toBe(1);
    expect(neon.prepare).toBe(false);

    const vercel = postgresClientOptions("postgres://u:p@db.example.com/apex", { VERCEL: "1" });
    expect(vercel.max).toBe(1);
    expect(vercel.prepare).toBe(false);
  });
});

describe("assertDatabaseUrlForRuntime", () => {
  it("is a no-op off Vercel", () => {
    expect(() => assertDatabaseUrlForRuntime(DEFAULT_DATABASE_URL, {})).not.toThrow();
  });

  it("rejects a missing or localhost URL on Vercel", () => {
    expect(() => assertDatabaseUrlForRuntime(DEFAULT_DATABASE_URL, { VERCEL: "1" })).toThrow(/DATABASE_URL is not set/);
    expect(() =>
      assertDatabaseUrlForRuntime(DEFAULT_DATABASE_URL, {
        VERCEL: "1",
        DATABASE_URL: DEFAULT_DATABASE_URL,
      }),
    ).toThrow(/localhost/);
    expect(isLocalDatabaseUrl(DEFAULT_DATABASE_URL)).toBe(true);
  });
});
