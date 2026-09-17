import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Landmark } from "lucide-react";

import type { AssumptionValue } from "@/dossier";
import { loadSharedDossier } from "@/lib/dossier/run";
import { formatCents, formatDateTime, formatMultiple, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared deal dossier — Apex",
  robots: { index: false, follow: false },
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-red-100 text-red-700",
};

function humanize(key: string): string {
  return key.replace(/_/g, " ");
}

function formatAssumptionValue(v: AssumptionValue): string {
  if (v.unit === "text") return v.valueText ?? "—";
  if (v.valueNum === null) return "—";
  if (v.unit === "usd_cents") return formatCents(v.valueNum);
  if (v.unit === "ratio") return formatPercent(v.valueNum);
  return v.valueNum.toLocaleString("en-US");
}

function sourceLabel(source: string): string {
  if (source.startsWith("listing")) return "Listing";
  if (source.startsWith("comp")) return "RentCast comps";
  if (source.startsWith("default:")) return `Default · ${source.slice("default:".length)}`;
  if (source === "default") return "Default";
  return "Manual entry";
}

export default async function SharedDossierPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const loaded = await loadSharedDossier(token);
  if (!loaded) notFound();

  const { dossier, payload, assumptionVersion, assumptions } = loaded;
  const base = payload.base;
  const downside = payload.downside;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200/80 bg-stone-50/90">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <Landmark className="size-3.5" aria-hidden />
            </span>
            Apex
            <span className="rounded-full border border-stone-300 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-stone-500 uppercase">
              Shared dossier · read-only
            </span>
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <div className="space-y-10">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{dossier.title}</h1>
            <p className="mt-1 text-sm text-stone-600">
              {payload.address ?? "No address"} · assumptions v{assumptionVersion} · computed by{" "}
              {dossier.financeVersion} · shared {formatDateTime(dossier.sharedAt)}
            </p>
          </div>

          {!payload.computable ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              This dossier is missing required inputs (
              {payload.missingInputs.map(humanize).join(", ")}) — the pro forma has not been
              computed yet.
            </p>
          ) : null}

          {base ? (
            <section>
              <h2 className="text-lg font-semibold tracking-tight">Year 1 — base case</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: "Cash-on-cash", value: formatPercent(base.year1.cashOnCashReturn, 1) },
                  { label: "Cap rate", value: formatPercent(base.year1.capRate, 2) },
                  { label: "DSCR", value: formatMultiple(base.year1.dscr) },
                  { label: `IRR (${payload.inputs?.holdingYears ?? 10} yr)`, value: formatPercent(base.irr, 1) },
                  { label: "Cash flow / yr", value: formatCents(base.year1.cashFlowBeforeTaxCents) },
                  { label: "Cash invested", value: formatCents(base.year1.totalCashInvestedCents) },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-stone-200 bg-white p-4">
                    <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
                      {m.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold">{m.value}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {downside ? (
            <section className="rounded-2xl border border-stone-200 bg-white p-6">
              <h2 className="text-lg font-semibold tracking-tight">Downside case</h2>
              <p className="mt-1 text-sm text-stone-600">
                Rent {formatPercent(downside.params.rentShockRate, 0)}, vacancy +
                {formatPercent(downside.params.vacancyDelta, 0)} pp, expenses +
                {formatPercent(downside.params.expenseShockRate, 0)} — financing unchanged.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Downside CoC",
                    value: formatPercent(downside.analysis.year1.cashOnCashReturn, 1),
                  },
                  { label: "Downside DSCR", value: formatMultiple(downside.analysis.year1.dscr) },
                  {
                    label: "Downside cash flow / yr",
                    value: formatCents(downside.analysis.year1.cashFlowBeforeTaxCents),
                  },
                  { label: "Downside NOI", value: formatCents(downside.analysis.year1.noiCents) },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-stone-100 bg-stone-50 p-4">
                    <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
                      {m.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold">{m.value}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {base ? (
            <section>
              <h2 className="text-lg font-semibold tracking-tight">
                {payload.inputs?.holdingYears ?? 10}-year projection
              </h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                      <th className="px-4 py-3 font-medium">Year</th>
                      <th className="px-4 py-3 font-medium">EGI</th>
                      <th className="px-4 py-3 font-medium">OpEx</th>
                      <th className="px-4 py-3 font-medium">NOI</th>
                      <th className="px-4 py-3 font-medium">Debt service</th>
                      <th className="px-4 py-3 font-medium">Cash flow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {base.projection.map((year) => (
                      <tr key={year.year} className="border-b border-stone-100 last:border-0">
                        <td className="px-4 py-2.5 font-medium">{year.year}</td>
                        <td className="px-4 py-2.5">{formatCents(year.effectiveGrossIncomeCents)}</td>
                        <td className="px-4 py-2.5 text-stone-600">
                          −{formatCents(year.operatingExpensesCents)}
                        </td>
                        <td className="px-4 py-2.5 font-medium">{formatCents(year.noiCents)}</td>
                        <td className="px-4 py-2.5 text-stone-600">
                          −{formatCents(year.debtServiceCents)}
                        </td>
                        <td
                          className={`px-4 py-2.5 font-medium ${year.cashFlowBeforeTaxCents < 0 ? "text-red-600" : "text-emerald-700"}`}
                        >
                          {formatCents(year.cashFlowBeforeTaxCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="text-lg font-semibold tracking-tight">Diligence checklist</h2>
            <ul className="mt-3 space-y-2">
              {payload.checklist.map((item) => (
                <li key={item.id} className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <span className="shrink-0 text-xs font-medium tracking-wide text-stone-500 uppercase">
                      {item.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">{item.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">
              Assumptions <span className="text-stone-400">· v{assumptionVersion}</span>
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Every number above, with its source and confidence. Computed by a deterministic
              finance engine — never estimated by a model.
            </p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                    <th className="px-4 py-3 font-medium">Assumption</th>
                    <th className="px-4 py-3 font-medium">Value</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {assumptions
                    .slice()
                    .sort((a, b) => a.key.localeCompare(b.key))
                    .map((v) => (
                      <tr key={v.key} className="border-b border-stone-100 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-stone-800">
                          {humanize(v.key)}
                        </td>
                        <td className="px-4 py-2.5">{formatAssumptionValue(v)}</td>
                        <td className="px-4 py-2.5 text-stone-600">{sourceLabel(v.sourceRef ?? v.source)}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_STYLES[v.confidence]}`}
                          >
                            {v.confidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl bg-stone-900 px-6 py-8 text-center text-stone-50">
            <h2 className="text-xl font-semibold tracking-tight">
              Underwritten with Apex — every number sourced.
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-stone-300">
              Apex audits your rentals monthly and underwrites your next purchase with a
              deterministic engine. Join the waitlist for the founding-member beta.
            </p>
            <Link
              href="/#waitlist"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Join the waitlist
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
