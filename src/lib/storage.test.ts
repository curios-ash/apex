import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { canonicalJson, sha256Hex } from "./hash";
import { buildStorageKey, readStoredFile, sanitizeFilename } from "./storage";

const tmp = mkdtempSync(path.join(tmpdir(), "apex-storage-test-"));
process.env.APEX_STORAGE_DIR = tmp;

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("disk storage fallback", () => {
  it("round-trips a file through put/get", async () => {
    // Imported lazily so APEX_STORAGE_DIR is set before module evaluation.
    const { getStorage } = await import("./storage");
    const storage = getStorage();
    expect(storage.backend).toBe("disk");

    const data = new TextEncoder().encode("statement contents");
    const key = buildStorageKey("ws-1", "doc-1", "March Statement.txt");
    const storageKey = await storage.put(key, data, "text/plain");
    expect(storageKey.startsWith("disk:")).toBe(true);

    const back = await readStoredFile(storageKey);
    expect(back).not.toBeNull();
    expect(Buffer.from(back!).toString("utf8")).toBe("statement contents");
  });

  it("returns null for missing files", async () => {
    const { getStorage } = await import("./storage");
    expect(await getStorage().get("disk:" + path.join(tmp, "nope.txt"))).toBeNull();
  });
});

describe("sanitizeFilename", () => {
  it.each([
    ["March Statement (final).txt", "March-Statement-final-.txt"],
    ["../../etc/passwd", "passwd"],
    ["a".repeat(200) + ".pdf", "a".repeat(116) + ".pdf"], // extension preserved
    ["a".repeat(200), "a".repeat(120)],
    ["///", "file"],
  ])("sanitizes %j", (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });
});

describe("hash helpers", () => {
  it("sha256Hex is stable", () => {
    expect(sha256Hex("apex")).toBe(sha256Hex("apex"));
    expect(sha256Hex("apex")).toHaveLength(64);
  });

  it("canonicalJson ignores key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });
});
