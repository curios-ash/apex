import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal Stripe client — no SDK dependency. Checkout and portal session
// creation are plain form-encoded POSTs; webhook verification is Stripe's
// documented HMAC-SHA256 scheme (https://stripe.com/docs/webhooks/signatures).
// Everything here is gated behind STRIPE_ENABLED; when the flag is off the
// app serves the mock billing page and the webhook route 404s, so dev and
// tests never need Stripe keys.

export function isStripeEnabled(): boolean {
  const flag = process.env.STRIPE_ENABLED;
  return flag === "1" || flag === "true";
}

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string | null;
  prices: {
    ownerBase: string;
    ownerDoor: string;
    portfolioBase: string;
    portfolioDoor: string;
  };
}

// Null when incompletely configured — the billing page shows setup guidance
// instead of failing.
export function stripeConfig(): StripeConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const prices = {
    ownerBase: process.env.STRIPE_PRICE_OWNER_BASE ?? "",
    ownerDoor: process.env.STRIPE_PRICE_OWNER_DOOR ?? "",
    portfolioBase: process.env.STRIPE_PRICE_PORTFOLIO_BASE ?? "",
    portfolioDoor: process.env.STRIPE_PRICE_PORTFOLIO_DOOR ?? "",
  };
  if (!secretKey || Object.values(prices).some((p) => p === "")) return null;
  return { secretKey, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? null, prices };
}

const API_BASE = "https://api.stripe.com/v1";

async function postForm<T>(path: string, secretKey: string, params: Record<string, string>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;
  if (!response.ok) {
    throw new Error(`Stripe ${path} failed (${response.status}): ${body?.error?.message ?? "unknown"}`);
  }
  return body as T;
}

export interface StripeSession {
  id: string;
  url: string | null;
}

// Subscription checkout with two line items: the plan base (quantity 1) and
// the per-door price (quantity = billable doors). client_reference_id +
// subscription metadata carry the workspace id so the webhook can attribute
// events without a lookup table.
export async function createCheckoutSession(input: {
  config: StripeConfig;
  plan: "owner" | "portfolio";
  billableDoors: number;
  workspaceId: string;
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeSession> {
  const { config, plan } = input;
  const base = plan === "owner" ? config.prices.ownerBase : config.prices.portfolioBase;
  const door = plan === "owner" ? config.prices.ownerDoor : config.prices.portfolioDoor;
  const params: Record<string, string> = {
    mode: "subscription",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.workspaceId,
    "line_items[0][price]": base,
    "line_items[0][quantity]": "1",
    "line_items[1][price]": door,
    "line_items[1][quantity]": String(input.billableDoors),
    "metadata[workspace_id]": input.workspaceId,
    "subscription_data[metadata][workspace_id]": input.workspaceId,
  };
  if (input.customerId) params.customer = input.customerId;
  return postForm<StripeSession>("/checkout/sessions", config.secretKey, params);
}

export function stripeSecretKey(): string | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? secretKey : null;
}

export function deal1PriceId(): string | null {
  const priceId = process.env.STRIPE_PRICE_DEAL1?.trim();
  return priceId ? priceId : null;
}

// Live Deal #1 checkout needs the flag, the secret, and one $19/month price id.
// Owner/portfolio price ids are not required for this path.
export function deal1CheckoutConfig(): { secretKey: string; priceId: string } | null {
  if (!isStripeEnabled()) return null;
  const secretKey = stripeSecretKey();
  const priceId = deal1PriceId();
  if (!secretKey || !priceId) return null;
  return { secretKey, priceId };
}

// Single line item. Does not grant access by itself — the webhook does,
// after Stripe reports the subscription active.
export async function createDeal1CheckoutSession(input: {
  secretKey: string;
  priceId: string;
  workspaceId: string;
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeSession> {
  const params: Record<string, string> = {
    mode: "subscription",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.workspaceId,
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": "1",
    "metadata[workspace_id]": input.workspaceId,
    "metadata[product]": "deal1",
    "subscription_data[metadata][workspace_id]": input.workspaceId,
    "subscription_data[metadata][product]": "deal1",
  };
  if (input.customerId) params.customer = input.customerId;
  return postForm<StripeSession>("/checkout/sessions", input.secretKey, params);
}

export async function createPortalSessionWithKey(input: {
  secretKey: string;
  customerId: string;
  returnUrl: string;
}): Promise<StripeSession> {
  return postForm<StripeSession>("/billing_portal/sessions", input.secretKey, {
    customer: input.customerId,
    return_url: input.returnUrl,
  });
}

export async function createPortalSession(input: {
  config: StripeConfig;
  customerId: string;
  returnUrl: string;
}): Promise<StripeSession> {
  return createPortalSessionWithKey({
    secretKey: input.config.secretKey,
    customerId: input.customerId,
    returnUrl: input.returnUrl,
  });
}

// --- Webhook signature verification ----------------------------------------

export const WEBHOOK_TOLERANCE_SECONDS = 300;

// Verifies the Stripe-Signature header ("t=…,v1=…,v0=…") against the raw
// request body. Returns false on any mismatch, malformed header, or a
// timestamp outside the tolerance window (replay protection).
export function verifyWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  const { rawBody, signatureHeader, secret } = input;
  if (!signatureHeader) return false;
  const tolerance = input.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now - Number(timestamp)) > tolerance) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "hex");
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}
