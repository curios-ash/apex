import { eq } from "drizzle-orm";

import { Button } from "@/components/ui/button";
import { PLAN_IDS, PLANS, monthlyPriceCents } from "@/lib/billing/plans";
import { isStripeEnabled, stripeConfig } from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import { units, workspaces } from "@/lib/db/schema";
import { formatCents } from "@/lib/format";
import { getActiveWorkspace } from "@/lib/workspace";

import { openPortal, startCheckout } from "./actions";
import { MockSwitcher } from "./mock-switcher";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  none: "no subscription",
  trialing: "trialing",
  active: "active",
  past_due: "past due",
  canceled: "canceled",
  unpaid: "unpaid",
};

// Billing. STRIPE_ENABLED off → mock mode: the real plan catalog and current
// plan state from the DB, with a dev-only switcher that writes the same
// columns the webhook would. Flag on → real Checkout + customer portal.
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkout?: string }>;
}) {
  const { error, checkout } = await searchParams;
  const workspace = await getActiveWorkspace();
  const stripeOn = isStripeEnabled();
  const configured = stripeConfig() !== null;

  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspace.id))
    .limit(1);
  const doorRows = await db
    .select({ id: units.id })
    .from(units)
    .where(eq(units.workspaceId, workspace.id));
  const doors = doorRows.length;
  const plan = row?.plan ?? "free";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Plans from the launch pricing (master plan Part 4): per-door on top of a base, because
          the audit&apos;s value scales with doors, not seats.
        </p>
      </div>

      {!stripeOn ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Mock billing</span> — STRIPE_ENABLED is off, so no
          charges exist and the plan switcher below writes the database directly. Set the Stripe
          env vars (see README) to turn this page into real Checkout.
        </p>
      ) : !configured ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          STRIPE_ENABLED is on but keys or price ids are missing. See the README Stripe setup
          section.
        </p>
      ) : null}

      {checkout === "success" ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Checkout complete — the plan updates when Stripe&apos;s webhook lands (usually seconds).
        </p>
      ) : null}
      {checkout === "canceled" ? (
        <p className="rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-600">
          Checkout canceled — nothing changed.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {error === "stripe_not_configured"
            ? "Stripe is not fully configured (missing keys or price ids)."
            : error === "no_customer"
              ? "No Stripe customer yet — start a subscription first."
              : "Stripe call failed — check the server log."}
        </p>
      ) : null}

      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Current plan</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between sm:block">
            <dt className="text-stone-500">Plan</dt>
            <dd className="font-medium text-stone-900">{PLANS[plan].name}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-stone-500">Subscription</dt>
            <dd className="font-medium text-stone-900">
              {STATUS_LABELS[row?.subscriptionStatus ?? "none"]}
            </dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-stone-500">Doors in workspace</dt>
            <dd className="font-medium text-stone-900">{doors}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-stone-500">Monthly price at {doors} door{doors === 1 ? "" : "s"}</dt>
            <dd className="font-medium text-stone-900">{formatCents(monthlyPriceCents(plan, doors))}</dd>
          </div>
          {row?.stripeCustomerId ? (
            <div className="flex justify-between sm:block">
              <dt className="text-stone-500">Stripe customer</dt>
              <dd className="font-mono text-xs text-stone-700">{row.stripeCustomerId}</dd>
            </div>
          ) : null}
          {row?.billableDoors != null ? (
            <div className="flex justify-between sm:block">
              <dt className="text-stone-500">Doors on the subscription</dt>
              <dd className="font-medium text-stone-900">{row.billableDoors}</dd>
            </div>
          ) : null}
        </dl>
        {stripeOn && configured && row?.stripeCustomerId ? (
          <form action={openPortal} className="mt-4">
            <Button type="submit" variant="outline">
              Manage billing (Stripe portal)
            </Button>
          </form>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Plans</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {PLAN_IDS.map((planId) => {
            const p = PLANS[planId];
            const isCurrent = planId === plan;
            return (
              <div
                key={planId}
                className={`flex flex-col rounded-xl border bg-white p-5 shadow-sm ${
                  isCurrent ? "border-emerald-600 ring-1 ring-emerald-600" : "border-stone-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold tracking-tight">{p.name}</h3>
                  {isCurrent ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Current plan
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-stone-500">{p.tagline}</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight">
                  {formatCents(monthlyPriceCents(planId, doors))}
                  <span className="text-sm font-normal text-stone-500">/mo</span>
                </p>
                <p className="mt-0.5 text-xs text-stone-400">
                  {p.baseCents > 0 ? `${formatCents(p.baseCents)} base` : "No base"}
                  {p.includedDoors > 0 ? `, ${p.includedDoors} doors included` : ""}
                  {p.perDoorCents > 0
                    ? `, ${formatCents(p.perDoorCents)}/door${p.includedDoors > 0 ? " beyond that" : ""}`
                    : ""}
                  {` — at your ${doors} door${doors === 1 ? "" : "s"}`}
                </p>
                <ul className="mt-3 flex-1 space-y-1 text-sm text-stone-600">
                  {p.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
                <div className="mt-4">
                  {stripeOn ? (
                    planId === "free" ? (
                      <span className="text-xs text-stone-400">
                        Downgrade by canceling in the portal.
                      </span>
                    ) : isCurrent ? (
                      <span className="text-xs text-stone-400">Your current plan.</span>
                    ) : (
                      <form action={startCheckout}>
                        <input type="hidden" name="plan" value={planId} />
                        <Button
                          type="submit"
                          disabled={!configured}
                          className="w-full bg-emerald-700 text-white hover:bg-emerald-600"
                        >
                          {plan === "free" ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                        </Button>
                      </form>
                    )
                  ) : (
                    <MockSwitcher planId={planId} planName={p.name} isCurrent={isCurrent} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
