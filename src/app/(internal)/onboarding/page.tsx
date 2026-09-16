import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { getSession, isDevAuthEnabled } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import {
  actualLines,
  assumptions,
  dossiers,
  loans,
  pmAgreements,
  properties,
  units,
} from "@/lib/db/schema";
import { transactionCategories } from "@/lib/llm/schemas";
import { getActiveWorkspace } from "@/lib/workspace";
import { priorMonths, suggestBudgetFromHistory, suggestBudgetFromPurchaseModel } from "@/onboarding";
import { INCOME_CATEGORIES } from "@/reconcile";

import { savePmAgreement, saveProperty, saveWorkspace } from "./actions";
import { BudgetWizard } from "./budget-wizard";

export const dynamic = "force-dynamic";

const STEPS = [
  { id: "workspace", label: "Workspace" },
  { id: "property", label: "Property" },
  { id: "pm", label: "PM agreement" },
  { id: "budget", label: "Budget" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const inputClass =
  "mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm";
const labelClass = "text-sm font-medium text-stone-700";

// Self-serve setup: workspace -> first property -> PM agreement -> budget,
// landing on the property's review page. Every step is skippable, and every
// step edits existing rows when they exist, so /onboarding doubles as the
// "edit later" surface until dedicated settings pages exist.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; property?: string; error?: string }>;
}) {
  const { step: stepParam, property: propertyParam, error } = await searchParams;
  const session = await getSession();
  // Workspace creation needs a provider that can establish a session.
  if (!session && !isDevAuthEnabled()) notFound();

  const workspace = await getActiveWorkspace();
  const step: StepId = STEPS.some((s) => s.id === stepParam) ? (stepParam as StepId) : "workspace";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Set up your workspace</h1>
        <p className="mt-1 text-sm text-stone-600">
          Four steps, all skippable, all editable later — Apex only needs a property and a budget
          to start reconciling.
        </p>
      </div>

      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                s.id === step
                  ? "bg-emerald-700 text-white"
                  : "bg-white text-stone-500 ring-1 ring-stone-300"
              }`}
            >
              {i + 1}
            </span>
            <span className={s.id === step ? "font-medium text-stone-900" : "text-stone-500"}>
              {s.label}
            </span>
            {i < STEPS.length - 1 ? <span className="text-stone-300">→</span> : null}
          </li>
        ))}
      </ol>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {step === "workspace" ? <WorkspaceStep signedIn={session !== null} /> : null}
      {step === "property" ? (
        <PropertyStep workspaceId={workspace.id} propertyId={propertyParam ?? null} />
      ) : null}
      {step === "pm" ? (
        <PmStep workspaceId={workspace.id} propertyId={propertyParam ?? null} />
      ) : null}
      {step === "budget" ? (
        <BudgetStep workspaceId={workspace.id} propertyId={propertyParam ?? null} />
      ) : null}
    </div>
  );
}

function StepFooter(props: { skipHref: string; submitLabel: string }) {
  return (
    <div className="mt-6 flex items-center gap-4">
      <Button type="submit" className="bg-emerald-700 text-white hover:bg-emerald-600">
        {props.submitLabel}
      </Button>
      <Link href={props.skipHref} className="text-sm font-medium text-stone-500 hover:underline">
        Skip for now
      </Link>
    </div>
  );
}

// --- Step 1: workspace -------------------------------------------------------

async function WorkspaceStep(props: { signedIn: boolean }) {
  const workspace = await getActiveWorkspace();
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">
        {props.signedIn ? "Your workspace" : "Create your workspace"}
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        {props.signedIn
          ? "This is the name on your reviews and your inbound email alias. One login per workspace for now — to run a second workspace, sign out and use a different email."
          : "The workspace holds your properties, statements, and reviews. Your email becomes the owner login (dev provider — no password)."}
      </p>
      <form action={saveWorkspace} className="mt-5 space-y-4">
        <div>
          <label htmlFor="name" className={labelClass}>
            Workspace name
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={props.signedIn ? workspace.name : ""}
            placeholder="Maple Street Rentals"
            className={inputClass}
          />
        </div>
        {props.signedIn ? null : (
          <div>
            <label htmlFor="email" className={labelClass}>
              Your email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>
        )}
        <StepFooter skipHref="/onboarding?step=property" submitLabel={props.signedIn ? "Save and continue" : "Create workspace"} />
      </form>
    </section>
  );
}

// --- Step 2: property --------------------------------------------------------

async function PropertyStep(props: { workspaceId: string; propertyId: string | null }) {
  const propertyRows = await db
    .select()
    .from(properties)
    .where(eq(properties.workspaceId, props.workspaceId))
    .orderBy(properties.name);

  const editing = propertyRows.find((p) => p.id === props.propertyId) ?? null;
  const [unitRows, loanRows] = editing
    ? await Promise.all([
        db
          .select({ id: units.id })
          .from(units)
          .where(and(eq(units.workspaceId, props.workspaceId), eq(units.propertyId, editing.id))),
        db
          .select()
          .from(loans)
          .where(and(eq(loans.workspaceId, props.workspaceId), eq(loans.propertyId, editing.id)))
          .limit(1),
      ])
    : [[], []];
  const loan = loanRows[0] ?? null;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">
        {editing ? `Edit ${editing.name}` : "Add your first property"}
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        Address and units drive reconciliation; purchase price and the loan feed the finance
        engine. The monthly mortgage payment is computed from the loan terms, not entered.
      </p>

      {propertyRows.length > 0 && !editing ? (
        <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm">
          <span className="font-medium text-stone-700">Already on file:</span>{" "}
          {propertyRows.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? " · " : ""}
              <Link
                href={`/onboarding?step=property&property=${p.id}`}
                className="font-medium text-emerald-700 hover:underline"
              >
                {p.name}
              </Link>
            </span>
          ))}
        </div>
      ) : null}

      <form action={saveProperty} className="mt-5 space-y-4">
        {editing ? <input type="hidden" name="propertyId" value={editing.id} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="addressLine1" className={labelClass}>
              Street address
            </label>
            <input
              id="addressLine1"
              name="addressLine1"
              required
              defaultValue={editing?.addressLine1 ?? ""}
              placeholder="421 Maple Street"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="city" className={labelClass}>
              City
            </label>
            <input id="city" name="city" required defaultValue={editing?.city ?? ""} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="state" className={labelClass}>
                State
              </label>
              <input id="state" name="state" required defaultValue={editing?.state ?? ""} placeholder="TX" className={inputClass} />
            </div>
            <div>
              <label htmlFor="zip" className={labelClass}>
                ZIP
              </label>
              <input id="zip" name="zip" required defaultValue={editing?.zip ?? ""} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="propertyType" className={labelClass}>
              Type
            </label>
            <select id="propertyType" name="propertyType" defaultValue={editing?.propertyType ?? "sfr"} className={inputClass}>
              <option value="sfr">Single-family</option>
              <option value="condo">Condo</option>
              <option value="townhome">Townhome</option>
              <option value="duplex">Duplex</option>
              <option value="triplex">Triplex</option>
              <option value="fourplex">Fourplex</option>
              <option value="multi_5plus">Multi (5+ units)</option>
            </select>
          </div>
          <div>
            <label htmlFor="name" className={labelClass}>
              Nickname <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input id="name" name="name" defaultValue={editing?.name ?? ""} placeholder="Defaults to the street address" className={inputClass} />
          </div>
          <div>
            <label htmlFor="unitCount" className={labelClass}>
              Units
            </label>
            <input
              id="unitCount"
              name="unitCount"
              type="number"
              min={editing ? unitRows.length : 1}
              max={50}
              defaultValue={editing ? unitRows.length : 1}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="unitRent" className={labelClass}>
              Rent per unit / mo <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input id="unitRent" name="unitRent" inputMode="decimal" placeholder="1,450.00" className={inputClass} />
          </div>
          <div>
            <label htmlFor="purchasePrice" className={labelClass}>
              Purchase price <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input
              id="purchasePrice"
              name="purchasePrice"
              inputMode="decimal"
              defaultValue={editing?.purchasePriceCents != null ? (editing.purchasePriceCents / 100).toFixed(2) : ""}
              placeholder="320,000.00"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="purchaseDate" className={labelClass}>
              Purchase date <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input id="purchaseDate" name="purchaseDate" type="date" defaultValue={editing?.purchaseDate ?? ""} className={inputClass} />
          </div>
        </div>

        <fieldset className="rounded-lg border border-stone-200 p-4">
          <legend className="px-1 text-sm font-medium text-stone-700">
            Loan basics <span className="font-normal text-stone-400">(optional)</span>
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="loanPrincipal" className={labelClass}>
                Original loan amount
              </label>
              <input
                id="loanPrincipal"
                name="loanPrincipal"
                inputMode="decimal"
                defaultValue={loan ? (loan.originalPrincipalCents / 100).toFixed(2) : ""}
                placeholder="240,000.00"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="loanRatePct" className={labelClass}>
                Interest rate %
              </label>
              <input
                id="loanRatePct"
                name="loanRatePct"
                inputMode="decimal"
                defaultValue={loan ? (loan.interestRateBps / 100).toFixed(2) : ""}
                placeholder="6.50"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="loanTermMonths" className={labelClass}>
                Term (months)
              </label>
              <input
                id="loanTermMonths"
                name="loanTermMonths"
                type="number"
                min={1}
                defaultValue={loan?.termMonths ?? 360}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="loanStartDate" className={labelClass}>
                Start date
              </label>
              <input id="loanStartDate" name="loanStartDate" type="date" defaultValue={loan?.startDate ?? ""} className={inputClass} />
            </div>
          </div>
          {loan?.monthlyPaymentCents != null ? (
            <p className="mt-3 text-xs text-stone-500">
              Computed payment on file: ${(loan.monthlyPaymentCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} /mo
              (finance-v1 amortization).
            </p>
          ) : null}
        </fieldset>

        <StepFooter
          skipHref={editing ? `/onboarding?step=pm&property=${editing.id}` : "/review"}
          submitLabel={editing ? "Save and continue" : "Add property and continue"}
        />
      </form>
    </section>
  );
}

// --- Step 3: PM agreement ----------------------------------------------------

async function PmStep(props: { workspaceId: string; propertyId: string | null }) {
  const propertyRows = await db
    .select()
    .from(properties)
    .where(eq(properties.workspaceId, props.workspaceId))
    .orderBy(properties.name);
  const property = propertyRows.find((p) => p.id === props.propertyId) ?? propertyRows[0] ?? null;

  if (!property) {
    return (
      <section className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
        No property yet —{" "}
        <Link href="/onboarding?step=property" className="font-medium text-emerald-700 underline">
          add one first
        </Link>
        .
      </section>
    );
  }

  const [agreement] = await db
    .select()
    .from(pmAgreements)
    .where(and(eq(pmAgreements.workspaceId, props.workspaceId), eq(pmAgreements.propertyId, property.id)))
    .limit(1);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">Management agreement — {property.name}</h2>
      <p className="mt-1 text-sm text-stone-500">
        The fee % is what the fee-drift rule checks every statement against. Self-managed? Skip
        this step — the audit rules simply stay off.
      </p>
      <form action={savePmAgreement} className="mt-5 space-y-4">
        <input type="hidden" name="propertyId" value={property.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pmCompanyName" className={labelClass}>
              Property manager
            </label>
            <input
              id="pmCompanyName"
              name="pmCompanyName"
              defaultValue={agreement?.pmCompanyName ?? ""}
              placeholder="Sunset Property Management"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="feePercent" className={labelClass}>
              Management fee % of collected rent
            </label>
            <input
              id="feePercent"
              name="feePercent"
              inputMode="decimal"
              defaultValue={agreement ? (agreement.feeBps / 100).toFixed(2) : ""}
              placeholder="8.00"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="renewalDate" className={labelClass}>
              Agreement renewal date <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input id="renewalDate" name="renewalDate" type="date" defaultValue={agreement?.endDate ?? ""} className={inputClass} />
          </div>
          <div>
            <label htmlFor="leasingFee" className={labelClass}>
              Leasing fee <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input
              id="leasingFee"
              name="leasingFee"
              inputMode="decimal"
              defaultValue={agreement?.leasingFeeCents != null ? (agreement.leasingFeeCents / 100).toFixed(2) : ""}
              placeholder="500.00"
              className={inputClass}
            />
          </div>
        </div>
        <StepFooter
          skipHref={`/onboarding?step=budget&property=${property.id}`}
          submitLabel="Save and continue"
        />
      </form>
    </section>
  );
}

// --- Step 4: budget ----------------------------------------------------------

async function BudgetStep(props: { workspaceId: string; propertyId: string | null }) {
  const propertyRows = await db
    .select()
    .from(properties)
    .where(eq(properties.workspaceId, props.workspaceId))
    .orderBy(properties.name);
  const property = propertyRows.find((p) => p.id === props.propertyId) ?? propertyRows[0] ?? null;

  if (!property) {
    return (
      <section className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
        No property yet —{" "}
        <Link href="/onboarding?step=property" className="font-medium text-emerald-700 underline">
          add one first
        </Link>
        .
      </section>
    );
  }

  // Path A prefill: the property's newest dossier (the purchase model) when
  // one exists, else the property record (unit rents + PM fee %).
  const [unitRows, agreementRows, dossierRows] = await Promise.all([
    db
      .select({ marketRentCents: units.marketRentCents })
      .from(units)
      .where(and(eq(units.workspaceId, props.workspaceId), eq(units.propertyId, property.id))),
    db
      .select({ feeBps: pmAgreements.feeBps })
      .from(pmAgreements)
      .where(and(eq(pmAgreements.workspaceId, props.workspaceId), eq(pmAgreements.propertyId, property.id)))
      .limit(1),
    db
      .select({ id: dossiers.id })
      .from(dossiers)
      .where(and(eq(dossiers.workspaceId, props.workspaceId), eq(dossiers.propertyId, property.id)))
      .orderBy(desc(dossiers.createdAt))
      .limit(1),
  ]);

  let dossierInput: Parameters<typeof suggestBudgetFromPurchaseModel>[0]["dossier"] = null;
  const dossier = dossierRows[0] ?? null;
  if (dossier) {
    const rows = await db
      .select()
      .from(assumptions)
      .where(and(eq(assumptions.workspaceId, props.workspaceId), eq(assumptions.dossierId, dossier.id)));
    // Latest version per key wins.
    const latest = new Map<string, { version: number; value: number }>();
    for (const row of rows) {
      if (row.valueNum === null) continue;
      const current = latest.get(row.key);
      if (!current || row.version > current.version) {
        latest.set(row.key, { version: row.version, value: row.valueNum });
      }
    }
    const get = (key: string) => latest.get(key)?.value ?? null;
    dossierInput = {
      monthlyRentCents: get("monthly_rent"),
      propertyTaxAnnualCents: get("property_tax_annual"),
      insuranceAnnualCents: get("insurance_annual"),
      hoaAnnualCents: get("hoa_annual"),
      utilitiesAnnualCents: get("utilities_annual"),
      maintenanceAnnualCents: get("maintenance_annual"),
      managementFeeAnnualCents: get("management_fee_annual"),
      otherExpensesAnnualCents: get("other_expenses_annual"),
    };
  }

  const rentFromUnits = unitRows.reduce((sum, u) => sum + (u.marketRentCents ?? 0), 0);
  const purchase = suggestBudgetFromPurchaseModel({
    monthlyRentCents: rentFromUnits > 0 ? rentFromUnits : null,
    pmFeeBps: agreementRows[0]?.feeBps ?? null,
    dossier: dossierInput,
  });

  // Path B prefill: average the last three full months of actual_lines.
  const currentMonth = `${new Date().toISOString().slice(0, 7)}-01`;
  const historyMonths = priorMonths(currentMonth, 3);
  const historyLines = await db
    .select({
      category: actualLines.category,
      month: actualLines.month,
      amountCents: actualLines.amountCents,
    })
    .from(actualLines)
    .where(and(eq(actualLines.workspaceId, props.workspaceId), eq(actualLines.propertyId, property.id)));
  const history = suggestBudgetFromHistory({ lines: historyLines, months: historyMonths });

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">Budget — {property.name}</h2>
      <p className="mt-1 text-sm text-stone-500">
        The monthly plan reconciliation measures against. Pick a starting point, adjust any line,
        and we apply it to the next 12 months — every month stays editable on the budget page.
      </p>
      <BudgetWizard
        propertyId={property.id}
        categories={[...transactionCategories]}
        incomeCategories={[...INCOME_CATEGORIES]}
        purchase={{ amounts: purchase.amounts, notes: purchase.notes }}
        history={{ amounts: history.amounts, notes: history.notes, months: historyMonths }}
      />
      <div className="mt-4">
        <Link href={`/review?property=${property.id}`} className="text-sm font-medium text-stone-500 hover:underline">
          Skip for now — go to the review
        </Link>
      </div>
    </section>
  );
}
