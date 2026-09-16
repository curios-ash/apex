import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyWebhookSignature } from "./stripe";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated", data: { object: {} } });

function sign(body: string, secret: string, t: number): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

const NOW = 1_800_000_000;

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed payload", () => {
    expect(
      verifyWebhookSignature({
        rawBody: BODY,
        signatureHeader: sign(BODY, SECRET, NOW),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = sign(BODY, SECRET, NOW);
    expect(
      verifyWebhookSignature({
        rawBody: BODY.replace("evt_1", "evt_2"),
        signatureHeader: header,
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(
      verifyWebhookSignature({
        rawBody: BODY,
        signatureHeader: sign(BODY, "whsec_other", NOW),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toBe(false);
  });

  it("rejects timestamps outside the tolerance window", () => {
    const stale = NOW - 301;
    expect(
      verifyWebhookSignature({
        rawBody: BODY,
        signatureHeader: sign(BODY, SECRET, stale),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toBe(false);
    const fresh = NOW - 299;
    expect(
      verifyWebhookSignature({
        rawBody: BODY,
        signatureHeader: sign(BODY, SECRET, fresh),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toBe(true);
  });

  it("rejects malformed headers", () => {
    for (const header of [null, "", "v1=abc", "t=notanumber,v1=abc", "garbage"]) {
      expect(
        verifyWebhookSignature({
          rawBody: BODY,
          signatureHeader: header,
          secret: SECRET,
          nowSeconds: NOW,
        }),
      ).toBe(false);
    }
  });

  it("accepts when any v1 signature matches (key rotation)", () => {
    const t = NOW;
    const good = createHmac("sha256", SECRET).update(`${t}.${BODY}`, "utf8").digest("hex");
    expect(
      verifyWebhookSignature({
        rawBody: BODY,
        signatureHeader: `t=${t},v1=${"0".repeat(64)},v1=${good}`,
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toBe(true);
  });
});
