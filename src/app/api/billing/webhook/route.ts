import { NextResponse } from "next/server";

import { applyBillingEvent, type StripeEvent } from "@/lib/billing/webhook";
import { isStripeEnabled, stripeConfig, verifyWebhookSignature } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

// Stripe webhook receiver. Exists only when STRIPE_ENABLED is on (404
// otherwise, so a disabled deployment has no billing surface at all). The
// signature is verified against the raw body before anything is parsed or
// persisted; bad signatures get a 400 so Stripe retries.
export async function POST(request: Request) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ ok: false, error: "billing_disabled" }, { status: 404 });
  }
  const config = stripeConfig();
  const webhookSecret = config?.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? null;
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "stripe_not_configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const valid = verifyWebhookSignature({
    rawBody,
    signatureHeader: request.headers.get("stripe-signature"),
    secret: webhookSecret,
  });
  if (!valid) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof event.id !== "string" || typeof event.type !== "string" || !event.data?.object) {
    return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }

  const prices = config?.prices ?? {
    ownerBase: process.env.STRIPE_PRICE_OWNER_BASE ?? "",
    ownerDoor: process.env.STRIPE_PRICE_OWNER_DOOR ?? "",
    portfolioBase: process.env.STRIPE_PRICE_PORTFOLIO_BASE ?? "",
    portfolioDoor: process.env.STRIPE_PRICE_PORTFOLIO_DOOR ?? "",
  };
  const result = await applyBillingEvent(event, prices, process.env.STRIPE_PRICE_DEAL1 ?? null);
  return NextResponse.json({ ok: true, ...result });
}
