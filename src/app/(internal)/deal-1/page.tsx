import { buyBoxNotes, dollarsInput, isDeal1Subscribed, percentInput, type InputSource } from "@/deal1";
import { deal1CheckoutConfig, isStripeEnabled, stripeSecretKey } from "@/lib/billing/stripe";
import { loadDeal1Workspace, type SavedCheck } from "@/lib/deal1/store";
import { formatCents, formatMultiple, formatPercent } from "@/lib/format";
import { getActiveWorkspace } from "@/lib/workspace";

import { openDeal1Portal, saveGates, scoreAddress, setDecision, startDeal1Checkout } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  address: "Type the street address you want scored.",
  price: "Price has to be a dollar amount, or leave it blank to use the estimate.",
  rent: "Monthly rent has to be a dollar amount, or leave it blank to use the estimate.",
  expenses: "Operating expenses have to be a yearly dollar amount, or left blank.",
  vacancy: "Vacancy has to be a percent from 0 to 100, or left blank.",
  rate: "Interest rate has to be a percent, or left blank to use the fixed rate on the gates.",
  units: "Units has to be a whole number from 1 to 20, or left blank.",
  leased: "Say whether it is fully leased, or leave that blank.",
  rehab: "Say whether it needs heavy rehab, or leave that blank.",
  place: "Name the place these gates are for.",
  ceiling: "Wide ceiling needs a dollar amount.",
  line: "The Deal #1 pass line needs a dollar amount.",
  "unit-range": "Unit count needs a whole-number range, low then high.",
  down: "Down payment needs a percent between 1 and 99.",
  "gate-rate": "Fixed rate needs a percent, like 6.5.",
  dscr: "DSCR gate needs a number, like 1.20.",
  checkout_unavailable:
    "Checkout cannot start. Set STRIPE_ENABLED=true, STRIPE_SECRET_KEY, and STRIPE_PRICE_DEAL1 (one $19/month price). Nothing here was marked paid.",
  checkout_failed: "Stripe did not open a session. Nothing was marked paid.",
  no_customer: "There is no Stripe customer on this workspace yet. Start checkout first.",
};

function SourceTag({ source }: { source: InputSource }) {
  const estimate = source === "estimate";
  return (
    <span
      className={
        estimate
          ? "rounded-full bg-[#f3e2c4] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[#9a3f12] uppercase"
          : "rounded-full bg-[#e7efe4] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[#1d4a32] uppercase"
      }
    >
      {estimate ? "Estimate" : "Entered"}
    </span>
  );
}

function Verdict({ pass }: { pass: boolean }) {
  return (
    <span
      className={
        pass
          ? "inline-flex min-h-8 items-center rounded-full bg-[#e7efe4] px-3 text-sm font-semibold text-[#1d4a32]"
          : "inline-flex min-h-8 items-center rounded-full bg-[#fde8e4] px-3 text-sm font-semibold text-[#9a3f12]"
      }
    >
      {pass ? "Pass" : "Fail"}
    </span>
  );
}

function fieldClass() {
  return "h-12 w-full rounded-xl border border-[#d7cbb8] bg-white px-3 text-base text-[#1c1914]";
}

export default async function Deal1Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorCode = typeof params.error === "string" ? params.error : null;
  const paywall = params.paywall === "second";
  const checkout = typeof params.checkout === "string" ? params.checkout : null;
  const saved = params.saved === "gates";
  const focusId = typeof params.check === "string" ? params.check : null;

  const workspace = await getActiveWorkspace();
  const { gates, checks, deal1Status, stripeCustomerId } = await loadDeal1Workspace(workspace.id);
  const stripeOn = isStripeEnabled();
  const checkoutReady = deal1CheckoutConfig() !== null;
  const subscribed = isDeal1Subscribed({ stripeEnabled: stripeOn, status: deal1Status });
  const portalReady = subscribed && Boolean(stripeCustomerId) && Boolean(stripeSecretKey());
  const blocked = !subscribed && checks.length >= 1;

  return (
    <div className="space-y-10">
      <header>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9a3f12] uppercase">Deal #1</p>
        <h1 className="mt-2 font-[family-name:var(--font-heading)] text-3xl tracking-tight sm:text-4xl">
          Score an address against the line you would actually buy.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-[#5c5549]">
          Bring the address. Apex runs NOI, DSCR, and cash flow through finance-v1 and marks pass or
          fail on price and DSCR. Listings stay on Redfin.
        </p>
      </header>

      <section id="paywall" className="rounded-2xl border border-[#e2d5be] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9a3f12] uppercase">Price</p>
            <p className="mt-1 font-[family-name:var(--font-heading)] text-3xl tracking-tight">
              $19<span className="text-lg text-[#5c5549]">/month</span>
            </p>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-[#5c5549]">
            One price. Cancel any time. The first address is free. A second address stays locked
            until this plan is active.
          </p>
        </div>

        {paywall ? (
          <p role="alert" className="mt-4 rounded-xl border border-[#e7c7b4] bg-[#fff4ec] px-4 py-3 text-sm leading-relaxed text-[#9a3f12]">
            That address was not scored and was not saved. The free check is one address. The next
            one needs the $19 plan.
          </p>
        ) : null}
        {checkout === "returned" ? (
          <p role="status" className="mt-4 rounded-xl border border-[#e2d5be] bg-[#fffaf1] px-4 py-3 text-sm leading-relaxed text-[#1c1914]">
            Checkout sent you back. This page does not mark the plan active. A second address stays
            locked until Stripe’s webhook records an active Deal #1 subscription.
          </p>
        ) : null}
        {checkout === "canceled" ? (
          <p role="status" className="mt-4 rounded-xl bg-[#f3ead8] px-4 py-3 text-sm text-[#5c5549]">
            Checkout canceled. Nothing changed.
          </p>
        ) : null}
        {errorCode && ERRORS[errorCode] ? (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {ERRORS[errorCode]}
          </p>
        ) : null}

        <div className="mt-4 space-y-2 text-sm leading-relaxed text-[#1c1914]">
          {subscribed ? (
            <p>
              The $19 plan is active on this workspace
              {deal1Status === "trialing" ? " (trialing)" : ""}. Another address can be scored.
              Cancel any time
              {portalReady ? " in the billing portal." : "."}
            </p>
          ) : blocked ? (
            <p>
              You already have a scored address. What you get for $19 a month: scoring and saving
              another address, with keep or pass stored on each. What is blocked right now: a second
              address. The gates and the first address stay open.
            </p>
          ) : (
            <p>Score the first address with the fields below. You will not be charged for it.</p>
          )}
          {!subscribed && !stripeOn ? (
            <p className="text-[#5c5549]">
              Card checkout is off because STRIPE_ENABLED is not true. The price is still $19 a
              month. This screen will not mark you subscribed.
            </p>
          ) : null}
          {!subscribed && stripeOn && !checkoutReady ? (
            <p className="text-[#5c5549]">
              STRIPE_ENABLED is on, but STRIPE_SECRET_KEY or STRIPE_PRICE_DEAL1 is missing, so
              Checkout cannot start. STRIPE_PRICE_DEAL1 is one monthly price for $19. The second
              address stays locked.
            </p>
          ) : null}
        </div>

        {subscribed && portalReady ? (
          <form action={openDeal1Portal} className="mt-4">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-xl border border-[#1c1914] px-4 text-sm font-semibold"
            >
              Manage or cancel the $19 plan
            </button>
          </form>
        ) : null}
        {!subscribed && blocked && checkoutReady ? (
          <form action={startDeal1Checkout} className="mt-4">
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[#c45c26] px-5 text-base font-semibold text-white hover:bg-[#9a3f12]"
            >
              Continue to checkout — $19/month
            </button>
          </form>
        ) : null}
      </section>

      <section id="gates" className="rounded-2xl border border-[#e2d5be] bg-[#fffaf1] p-5 sm:p-6">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl tracking-tight">Gates</h2>
        <p className="mt-1 text-sm leading-relaxed text-[#5c5549]">
          Starting point: Huntsville, wide ceiling $350,000, Deal #1 line $275,000, 2–4 units, fully
          leased, no heavy rehab, 25% down, fixed rate, DSCR 1.20. Change the numbers. This
          workspace keeps them.
        </p>
        {saved ? (
          <p role="status" className="mt-3 text-sm font-medium text-[#1d4a32]">
            Gates saved.
          </p>
        ) : null}
        <form action={saveGates} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold sm:col-span-2">
            Place
            <input name="place" required defaultValue={gates.place} className={`${fieldClass()} mt-1`} />
          </label>
          <label className="block text-sm font-semibold">
            Wide ceiling ($)
            <input
              name="wideCeiling"
              inputMode="decimal"
              required
              defaultValue={dollarsInput(gates.wideCeilingCents)}
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Deal #1 pass line ($)
            <input
              name="passLine"
              inputMode="decimal"
              required
              defaultValue={dollarsInput(gates.passLineCents)}
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Units, at least
            <input
              name="minUnits"
              inputMode="numeric"
              required
              defaultValue={gates.minUnits}
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Units, at most
            <input
              name="maxUnits"
              inputMode="numeric"
              required
              defaultValue={gates.maxUnits}
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Down payment (%)
            <input
              name="downPaymentPercent"
              inputMode="decimal"
              required
              defaultValue={percentInput(gates.downPaymentRate)}
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Fixed rate (%)
            <input
              name="annualRatePercent"
              inputMode="decimal"
              required
              defaultValue={percentInput(gates.annualRate)}
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold sm:col-span-2">
            DSCR gate
            <input
              name="dscrGate"
              inputMode="decimal"
              required
              defaultValue={gates.dscrGate}
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              name="fullyLeasedRequired"
              defaultChecked={gates.fullyLeasedRequired}
              className="size-4"
            />
            Fully leased
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              name="noHeavyRehabRequired"
              defaultChecked={gates.noHeavyRehabRequired}
              className="size-4"
            />
            No heavy rehab
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[#1c1914] px-5 text-base font-semibold text-[#f4e6c8]"
            >
              Save gates
            </button>
          </div>
        </form>
      </section>

      <section id="score" className="rounded-2xl border border-[#e2d5be] bg-white p-5 sm:p-6">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl tracking-tight">Score an address</h2>
        <p className="mt-1 text-sm leading-relaxed text-[#5c5549]">
          The score uses the gates last saved for this workspace. Leave a number blank to use the
          estimate. A number you type is marked entered. Type the same address again to replace its
          score. Keep or pass stays put.
        </p>
        <form action={scoreAddress} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold sm:col-span-2">
            Address
            <input
              name="address"
              required
              autoComplete="street-address"
              placeholder="1204 Governors Dr, Huntsville, AL"
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Price ($)
            <input
              name="purchasePrice"
              inputMode="decimal"
              placeholder={`Estimate · ${dollarsInput(gates.passLineCents)}`}
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Monthly rent ($)
            <input
              name="monthlyRent"
              inputMode="decimal"
              placeholder="Estimate · 2400"
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Yearly operating expenses ($)
            <input
              name="operatingExpenses"
              inputMode="decimal"
              placeholder="Estimate · 8700"
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Vacancy (%)
            <input name="vacancyPercent" inputMode="decimal" placeholder="Estimate · 5" className={`${fieldClass()} mt-1`} />
          </label>
          <label className="block text-sm font-semibold">
            Fixed interest rate (%)
            <input
              name="interestPercent"
              inputMode="decimal"
              placeholder={`Estimate · ${percentInput(gates.annualRate)}`}
              className={`${fieldClass()} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Units
            <input name="units" inputMode="numeric" placeholder="Estimate · 2" className={`${fieldClass()} mt-1`} />
          </label>
          <label className="block text-sm font-semibold">
            Fully leased
            <select name="fullyLeased" defaultValue="" className={`${fieldClass()} mt-1`}>
              <option value="">Estimate · yes</option>
              <option value="yes">Yes, entered</option>
              <option value="no">No, entered</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Heavy rehab
            <select name="heavyRehab" defaultValue="" className={`${fieldClass()} mt-1`}>
              <option value="">Estimate · no</option>
              <option value="yes">Yes, entered</option>
              <option value="no">No, entered</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#c45c26] text-base font-semibold text-white hover:bg-[#9a3f12] sm:w-auto sm:px-6"
            >
              Score this address
            </button>
          </div>
        </form>
      </section>

      <section id="checks" aria-labelledby="checks-heading">
        <h2 id="checks-heading" className="font-[family-name:var(--font-heading)] text-2xl tracking-tight">
          Scored addresses
        </h2>
        {checks.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-[#d7cbb8] bg-white/70 p-5 text-sm leading-relaxed text-[#5c5549]">
            Nothing scored yet. The first address is free, and the pass or fail stays when you come
            back.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {checks.map((check) => (
              <li key={check.id}>
                <CheckCard check={check} gates={gates} focused={check.id === focusId} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CheckCard({
  check,
  gates,
  focused,
}: {
  check: SavedCheck;
  gates: Awaited<ReturnType<typeof loadDeal1Workspace>>["gates"];
  focused: boolean;
}) {
  const notes = buyBoxNotes(gates, {
    units: check.input.units.value,
    fullyLeased: check.input.fullyLeased.value,
    heavyRehab: check.input.heavyRehab.value,
    purchasePriceCents: check.input.purchasePriceCents.value,
  });
  const decisionLabel =
    check.decision === "keep"
      ? "Marked keep"
      : check.decision === "pass"
        ? "Marked pass"
        : "No keep or pass yet";

  return (
    <article
      className={`rounded-2xl border bg-white p-5 ${focused ? "border-[#c45c26]" : "border-[#e2d5be]"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{check.address}</h3>
          <p className="mt-1 text-sm text-[#5c5549]">
            Deal #1 line {check.linePass ? "pass" : "fail"} · scored against {formatCents(check.passLineCents)} and{" "}
            {formatMultiple(check.dscrGate)} DSCR
          </p>
        </div>
        <Verdict pass={check.linePass} />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-[#fffaf1] p-3">
          <dt className="text-[11px] font-semibold tracking-wide text-[#8a8172] uppercase">NOI</dt>
          <dd className="mt-1 text-lg font-semibold">{formatCents(check.noiCents)}</dd>
        </div>
        <div className="rounded-xl bg-[#fffaf1] p-3">
          <dt className="text-[11px] font-semibold tracking-wide text-[#8a8172] uppercase">DSCR</dt>
          <dd className="mt-1 text-lg font-semibold">{formatMultiple(check.dscr)}</dd>
        </div>
        <div className="rounded-xl bg-[#fffaf1] p-3">
          <dt className="text-[11px] font-semibold tracking-wide text-[#8a8172] uppercase">Cash flow</dt>
          <dd className="mt-1 text-lg font-semibold">{formatCents(check.cashFlowCents)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-[#6b6358]">
        NOI, DSCR, and cash flow are year-1 figures from finance-v1. Cash flow is before tax, with
        no reserve set-aside. Debt service is {formatCents(check.annualDebtServiceCents)} a year:
        the finance-v1 payment on this price, the down payment saved on the gates at scoring time,
        and the fixed rate below, 30 years.
      </p>

      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Price {formatCents(check.input.purchasePriceCents.value)} vs {formatCents(check.passLineCents)}
          </span>
          <span className="flex items-center gap-2">
            <SourceTag source={check.input.purchasePriceCents.source} />
            <Verdict pass={check.pricePass} />
          </span>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2">
          <span>
            DSCR {formatMultiple(check.dscr)} vs {formatMultiple(check.dscrGate)}
          </span>
          <Verdict pass={check.dscrPass} />
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span>Rent {formatCents(check.input.monthlyRentCents.value)} / month</span>
          <SourceTag source={check.input.monthlyRentCents.source} />
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span>Operating expenses {formatCents(check.input.annualOperatingExpensesCents.value)} / year</span>
          <SourceTag source={check.input.annualOperatingExpensesCents.source} />
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span>Vacancy {formatPercent(check.input.vacancyRate.value, 1)}</span>
          <SourceTag source={check.input.vacancyRate.source} />
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span>Fixed rate {formatPercent(check.input.annualRate.value, 2)}</span>
          <SourceTag source={check.input.annualRate.source} />
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span>{check.input.units.value} units</span>
          <SourceTag source={check.input.units.source} />
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span>{check.input.fullyLeased.value ? "Fully leased" : "Not fully leased"}</span>
          <SourceTag source={check.input.fullyLeased.source} />
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span>{check.input.heavyRehab.value ? "Heavy rehab" : "No heavy rehab"}</span>
          <SourceTag source={check.input.heavyRehab.source} />
        </li>
      </ul>

      {notes.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-[#5c5549]">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="mr-2 text-sm font-semibold">{decisionLabel}</p>
        <form action={setDecision}>
          <input type="hidden" name="checkId" value={check.id} />
          <input type="hidden" name="decision" value="keep" />
          <button
            type="submit"
            className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold ${
              check.decision === "keep"
                ? "bg-[#1c1914] text-[#f4e6c8]"
                : "border border-[#d7cbb8] bg-white"
            }`}
          >
            Keep
          </button>
        </form>
        <form action={setDecision}>
          <input type="hidden" name="checkId" value={check.id} />
          <input type="hidden" name="decision" value="pass" />
          <button
            type="submit"
            className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold ${
              check.decision === "pass"
                ? "bg-[#1c1914] text-[#f4e6c8]"
                : "border border-[#d7cbb8] bg-white"
            }`}
          >
            Pass
          </button>
        </form>
      </div>
    </article>
  );
}
