#!/usr/bin/env node
// End-to-end check for slice 6 (dev sign-in, onboarding, billing) against
// running servers. Two servers are involved:
//
//   BASE_URL  (default :4319) — APEX_DEV_AUTH_ENABLED=true, no Stripe vars.
//     Covers: /sign-in renders, /onboarding renders, mock billing page with
//     plan catalog + current plan from the DB, webhook 404s with the flag off.
//   STRIPE_BASE_URL (default :4320) — STRIPE_ENABLED=true with test price ids
//     and webhook secret (see below), dev auth OFF. Covers: /sign-in 404s,
//     the webhook's signature verification (bad -> 400, good -> 200) and the
//     plan/door-count DB updates from handcrafted signed events.
//
// The interactive flow (sign-in -> onboarding -> review) is exercised in the
// browser pass; server actions are not fetchable from a script.
//
// Usage:
//   npm run build && APEX_DEV_AUTH_ENABLED=true npm start -- -p 4319
//   STRIPE_ENABLED=true STRIPE_SECRET_KEY=sk_test_e2e \
//     STRIPE_WEBHOOK_SECRET=whsec_e2e STRIPE_PRICE_OWNER_BASE=price_owner_base \
//     STRIPE_PRICE_OWNER_DOOR=price_owner_door STRIPE_PRICE_PORTFOLIO_BASE=price_portfolio_base \
//     STRIPE_PRICE_PORTFOLIO_DOOR=price_portfolio_door npm start -- -p 4320
//   node scripts/e2e-onboarding.mjs
import { createHmac } from "node:crypto";

import postgres from "postgres";

const baseUrl = process.env.BASE_URL ?? "http://localhost:4319";
const stripeBaseUrl = process.env.STRIPE_BASE_URL ?? "http://localhost:4320";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e";
const prices = {
  ownerBase: process.env.STRIPE_PRICE_OWNER_BASE ?? "price_owner_base",
  ownerDoor: process.env.STRIPE_PRICE_OWNER_DOOR ?? "price_owner_door",
  portfolioBase: process.env.STRIPE_PRICE_PORTFOLIO_BASE ?? "price_portfolio_base",
  portfolioDoor: process.env.STRIPE_PRICE_PORTFOLIO_DOOR ?? "price_portfolio_door",
};
const sql = postgres(
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/apex",
);

let failures = 0;
function check(label, condition, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function signedRequest(event) {
  const rawBody = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", webhookSecret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  return {
    rawBody,
    headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${v1}` },
  };
}

// 1. Servers respond.
const healthA = await fetch(`${baseUrl}/`).catch(() => null);
check("server A (dev auth, no Stripe) responds", healthA?.ok === true);
const healthB = await fetch(`${stripeBaseUrl}/audit`).catch(() => null);
check("server B (Stripe on, dev auth off) responds", healthB?.ok === true);
if (!healthA?.ok || !healthB?.ok) {
  console.error("Start both servers first — see the header comment.");
  process.exit(1);
}

// 2. Dev sign-in gating.
const signInA = await fetch(`${baseUrl}/sign-in`);
const signInAHtml = await signInA.text();
check("/sign-in renders with the flag on", signInA.status === 200);
check(
  "/sign-in is clearly marked DEV",
  signInAHtml.includes("Dev only") && signInAHtml.includes("Sign in (dev)"),
);
check("/sign-in lists the demo workspace", signInAHtml.includes("demo"));
const signInB = await fetch(`${stripeBaseUrl}/sign-in`);
check("/sign-in 404s with the flag off", signInB.status === 404, `${signInB.status}`);

// 3. Onboarding renders (workspace step first).
const onboardingHtml = await (await fetch(`${baseUrl}/onboarding`)).text();
check("/onboarding renders the wizard", onboardingHtml.includes("Set up your workspace"));
check(
  "/onboarding shows all four steps",
  ["Workspace", "Property", "PM agreement", "Budget"].every((s) => onboardingHtml.includes(s)),
);
const onboardingBudget = await (
  await fetch(`${baseUrl}/onboarding?step=budget`)
).text();
check(
  "onboarding budget step offers both paths",
  onboardingBudget.includes("From the purchase model") &&
    onboardingBudget.includes("From 3 months of history"),
);

// 4. Mock billing page (flag off): plans + current-plan state from the DB.
const billingHtml = await (await fetch(`${baseUrl}/billing`)).text();
check("/billing shows the mock banner when Stripe is off", billingHtml.includes("Mock billing"));
check(
  "/billing lists the Part 4 plans",
  ["Free", "Owner", "Portfolio"].every((p) => billingHtml.includes(p)),
);
check("/billing marks the current plan (free)", billingHtml.includes("Current plan"));
// Demo workspace has 2 doors: Owner = $19 + 2x$9 = $37; Portfolio = $79 (6 included).
check("/billing computes per-door prices at 2 doors", billingHtml.includes("$37.00") && billingHtml.includes("$79.00"));
check(
  "/billing mock switcher is dev-labeled",
  billingHtml.includes("Switch to Owner (mock)"),
);

// 5. Webhook with the flag off -> 404.
const offWebhook = await fetch(`${baseUrl}/api/billing/webhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
check("webhook 404s when STRIPE_ENABLED is off", offWebhook.status === 404, `${offWebhook.status}`);

// 6. Webhook on server B: signature verification.
const badSig = await fetch(`${stripeBaseUrl}/api/billing/webhook`, {
  method: "POST",
  headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=bad" },
  body: "{}",
});
check("webhook rejects a bad signature", badSig.status === 400, `${badSig.status}`);

// 7. Signed events against a throwaway workspace (keeps the demo one pristine).
const [billingWs] = await sql`
  insert into workspaces (name, slug) values ('Billing E2E', 'billing-e2e')
  on conflict (slug) do update set name = excluded.name
  returning id
`;
await sql`delete from users where workspace_id = ${billingWs.id}`;

const sessionEvent = {
  id: "evt_e2e_checkout",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_e2e",
      object: "checkout.session",
      client_reference_id: billingWs.id,
      customer: "cus_e2e_123",
      subscription: "sub_e2e_123",
      metadata: { workspace_id: billingWs.id },
    },
  },
};
const checkoutReq = signedRequest(sessionEvent);
const checkoutRes = await fetch(`${stripeBaseUrl}/api/billing/webhook`, {
  method: "POST",
  headers: checkoutReq.headers,
  body: checkoutReq.rawBody,
});
const checkoutBody = await checkoutRes.json();
check(
  "checkout.session.completed handled",
  checkoutRes.status === 200 && checkoutBody.handled === true,
  JSON.stringify(checkoutBody),
);
const [afterCheckout] = await sql`
  select stripe_customer_id, stripe_subscription_id from workspaces where id = ${billingWs.id}
`;
check(
  "checkout links the Stripe customer + subscription ids",
  afterCheckout?.stripe_customer_id === "cus_e2e_123" &&
    afterCheckout?.stripe_subscription_id === "sub_e2e_123",
);

const subscriptionEvent = {
  id: "evt_e2e_sub_updated",
  type: "customer.subscription.updated",
  data: {
    object: {
      id: "sub_e2e_123",
      object: "subscription",
      customer: "cus_e2e_123",
      status: "active",
      metadata: { workspace_id: billingWs.id },
      items: {
        data: [
          { price: { id: prices.ownerBase }, quantity: 1 },
          { price: { id: prices.ownerDoor }, quantity: 3 },
        ],
      },
    },
  },
};
const subReq = signedRequest(subscriptionEvent);
const subRes = await fetch(`${stripeBaseUrl}/api/billing/webhook`, {
  method: "POST",
  headers: subReq.headers,
  body: subReq.rawBody,
});
check("customer.subscription.updated handled", subRes.status === 200);
const [afterSub] = await sql`
  select plan, subscription_status, billable_doors from workspaces where id = ${billingWs.id}
`;
check(
  "subscription event updates plan + status + doors",
  afterSub?.plan === "owner" &&
    afterSub?.subscription_status === "active" &&
    afterSub?.billable_doors === 3,
  JSON.stringify(afterSub),
);

const deletedEvent = {
  id: "evt_e2e_sub_deleted",
  type: "customer.subscription.deleted",
  data: {
    object: {
      id: "sub_e2e_123",
      object: "subscription",
      customer: "cus_e2e_123",
      status: "canceled",
      metadata: { workspace_id: billingWs.id },
      items: { data: [{ price: { id: prices.ownerBase }, quantity: 1 }] },
    },
  },
};
const delReq = signedRequest(deletedEvent);
const delRes = await fetch(`${stripeBaseUrl}/api/billing/webhook`, {
  method: "POST",
  headers: delReq.headers,
  body: delReq.rawBody,
});
check("customer.subscription.deleted handled", delRes.status === 200);
const [afterDelete] = await sql`
  select plan, subscription_status from workspaces where id = ${billingWs.id}
`;
check(
  "cancellation returns the workspace to free",
  afterDelete?.plan === "free" && afterDelete?.subscription_status === "canceled",
  JSON.stringify(afterDelete),
);

const auditRows = await sql`
  select action from audit_log
  where workspace_id = ${billingWs.id} and action like 'billing.%' order by created_at
`;
const auditActions = auditRows.map((r) => r.action);
check(
  "billing events are audit-logged",
  auditActions.includes("billing.checkout.completed") &&
    auditActions.includes("billing.subscription.synced") &&
    auditActions.includes("billing.subscription.canceled"),
  auditActions.join(","),
);

// 8. Server B's billing page is in live mode (no mock banner).
const billingBHtml = await (await fetch(`${stripeBaseUrl}/billing`)).text();
check(
  "/billing on server B is live mode (no mock banner)",
  !billingBHtml.includes("Mock billing"),
);

// 9. Cleanup the throwaway workspace.
await sql`delete from workspaces where id = ${billingWs.id}`;
check("throwaway billing workspace cleaned up", true);

await sql.end();
console.log(failures === 0 ? "\ne2e OK" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
