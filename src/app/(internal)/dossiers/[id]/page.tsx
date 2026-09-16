import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AlertTriangle, ExternalLink, FileText, Link2, Link2Off } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AssumptionValue, ChecklistItem } from "@/dossier";
import { loadDossier } from "@/lib/dossier/run";
import { formatCents, formatDateTime, formatMultiple, formatPercent } from "@/lib/format";
import { getActiveWorkspace } from "@/lib/workspace";

import { revise, share, unshare } from "../actions";
import { AssumptionFields } from "../assumption-fields";

export const dynamic = "force-dynamic";

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-red-100 text-red-700",
};

const SEVERITY_STYLES: Record<ChecklistItem["severity"], string> = {
  critical: "border-red-200 bg-red-50 text-red-900",
  important: "border-amber-200 bg-amber-50 text-amber-900",
  standard: "border-stone-200 bg-white text-stone-800",
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

function AssumptionSourceView({ source }: { source: string }) {
  if (source.startsWith("listing:document:")) {
    const documentId = source.slice("listing:document:".length);
    return (
      <a
        href={`/api/documents/${documentId}/file`}
        target="_blank"
        className="inline-flex items-center gap-1 text-emerald-800 hover:underline"
      >
        <FileText className="size-3.5" aria-hidden />
        Listing capture
      </a>
    );
  }
  if (source.startsWith("default:")) {
    return <span className="text-stone-500">Default · {source.slice("default:".length)}</span>;
  }
  if (source === "default") return <span className="text-stone-500">Default</span>;
  if (source === "listing") return <span className="text-emerald-800">Listing</span>;
  return <span className="text-stone-700">Manual entry</span>;
}

function MetricCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "bad";
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "bad" ? "text-red-600" : "text-stone-900"}`}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-stone-500">{sub}</p> : null}
    </div>
  );
}

export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getActiveWorkspace();
  const loaded = await loadDossier(workspace.id, id);
  if (!loaded) notFound();

  const { dossier, payload, assumptionVersion, assumptions } = loaded;
  const valueMap = new Map(assumptions.map((a) => [a.key, a]));
  const base = payload.base;
  const downside = payload.downside;

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const shareUrl = dossier.shareToken && host ? `${proto}://${host}/share/dossiers/${dossier.shareToken}` : null;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-stone-500">
            <Link href="/dossiers" className="hover:text-stone-900">
              Dossiers
            </Link>{" "}
            / v{assumptionVersion}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{dossier.title}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {payload.address ?? "No address"} · created {formatDateTime(dossier.createdAt)} ·
            finance engine <span className="font-medium">{dossier.financeVersion}</span>
            {dossier.listingUrl ? (
              <>
                {" "}
                ·{" "}
                <a
                  href={dossier.listingUrl}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-emerald-800 hover:underline"
                >
                  Listing <ExternalLink className="size-3" aria-hidden />
                </a>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dossier.shareToken ? (
            <form action={unshare}>
              <input type="hidden" name="dossierId" value={dossier.id} />
              <Button type="submit" variant="outline" size="sm">
                <Link2Off aria-hidden />
                Revoke public link
              </Button>
            </form>
          ) : (
            <form action={share}>
              <input type="hidden" name="dossierId" value={dossier.id} />
              <Button type="submit" variant="outline" size="sm">
                <Link2 aria-hidden />
                Share read-only link
              </Button>
            </form>
          )}
        </div>
      </div>

      {shareUrl ? (
        <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
          <Link2 className="size-4 shrink-0 text-sky-700" aria-hidden />
          <span className="text-sky-900">Public read-only link:</span>
          <input
            readOnly
            value={shareUrl}
            className="w-full min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-2 py-1 font-mono text-xs text-sky-900"
          />
          <a href={shareUrl} target="_blank" className="shrink-0 font-medium text-sky-800 hover:underline">
            Open
          </a>
        </div>
      ) : null}

      {!payload.computable ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">This pro forma can&apos;t be computed yet.</p>
            <p className="mt-1">
              Missing: {payload.missingInputs.map(humanize).join(", ")}. Fill them in under
              &quot;Revise assumptions&quot; below — the checklist has the rest of the gaps.
            </p>
          </div>
        </div>
      ) : null}

      {base ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Year 1 — base case</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Cash-on-cash" value={formatPercent(base.year1.cashOnCashReturn, 1)} />
            <MetricCard label="Cap rate" value={formatPercent(base.year1.capRate, 2)} />
            <MetricCard label="DSCR" value={formatMultiple(base.year1.dscr)} />
            <MetricCard label="IRR (10 yr)" value={formatPercent(base.irr, 1)} />
            <MetricCard
              label="Cash flow / yr"
              value={formatCents(base.year1.cashFlowBeforeTaxCents)}
              tone={base.year1.cashFlowBeforeTaxCents < 0 ? "bad" : "default"}
            />
            <MetricCard label="Cash invested" value={formatCents(base.year1.totalCashInvestedCents)} />
          </div>
        </section>
      ) : null}

      {downside ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="text-lg font-semibold tracking-tight">Downside case</h2>
          <p className="mt-1 text-sm text-stone-600">
            Rent {formatPercent(downside.params.rentShockRate, 0)}, vacancy{" "}
            +{formatPercent(downside.params.vacancyDelta, 0)} pp, expenses{" "}
            +{formatPercent(downside.params.expenseShockRate, 0)} — financing unchanged. Edit the
            parameters under &quot;Revise assumptions&quot;.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Downside CoC"
              value={formatPercent(downside.analysis.year1.cashOnCashReturn, 1)}
              sub={`base ${formatPercent(base?.year1.cashOnCashReturn ?? null, 1)}`}
            />
            <MetricCard
              label="Downside DSCR"
              value={formatMultiple(downside.analysis.year1.dscr)}
              tone={(downside.analysis.year1.dscr ?? 99) < 1.2 ? "bad" : "default"}
              sub={`base ${formatMultiple(base?.year1.dscr ?? null)}`}
            />
            <MetricCard
              label="Downside cash flow / yr"
              value={formatCents(downside.analysis.year1.cashFlowBeforeTaxCents)}
              tone={downside.analysis.year1.cashFlowBeforeTaxCents < 0 ? "bad" : "default"}
              sub={`base ${formatCents(base?.year1.cashFlowBeforeTaxCents ?? null)}`}
            />
            <MetricCard
              label="Downside NOI"
              value={formatCents(downside.analysis.year1.noiCents)}
              sub={`base ${formatCents(base?.year1.noiCents ?? null)}`}
            />
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
                  <th className="px-4 py-3 font-medium">Gross rent</th>
                  <th className="px-4 py-3 font-medium">Vacancy</th>
                  <th className="px-4 py-3 font-medium">EGI</th>
                  <th className="px-4 py-3 font-medium">OpEx</th>
                  <th className="px-4 py-3 font-medium">NOI</th>
                  <th className="px-4 py-3 font-medium">Debt service</th>
                  <th className="px-4 py-3 font-medium">Reserves</th>
                  <th className="px-4 py-3 font-medium">Cash flow</th>
                </tr>
              </thead>
              <tbody>
                {base.projection.map((year) => (
                  <tr key={year.year} className="border-b border-stone-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium">{year.year}</td>
                    <td className="px-4 py-2.5">{formatCents(year.grossScheduledRentCents)}</td>
                    <td className="px-4 py-2.5 text-stone-600">
                      −{formatCents(year.vacancyLossCents)}
                    </td>
                    <td className="px-4 py-2.5">{formatCents(year.effectiveGrossIncomeCents)}</td>
                    <td className="px-4 py-2.5 text-stone-600">
                      −{formatCents(year.operatingExpensesCents)}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{formatCents(year.noiCents)}</td>
                    <td className="px-4 py-2.5 text-stone-600">
                      −{formatCents(year.debtServiceCents)}
                    </td>
                    <td className="px-4 py-2.5 text-stone-600">−{formatCents(year.reservesCents)}</td>
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
          <p className="mt-2 text-xs text-stone-500">
            Exit at {formatCents(base.exit.salePriceCents)} less {formatCents(base.exit.sellingCostsCents)}{" "}
            selling costs and {formatCents(base.exit.loanPayoffCents)} loan payoff →{" "}
            {formatCents(base.exit.netSaleProceedsCents)} net proceeds.
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Diligence checklist</h2>
        <p className="mt-1 text-sm text-stone-600">
          Generated from this deal&apos;s gaps — defaulted and unverified assumptions first.
        </p>
        <ul className="mt-3 space-y-2">
          {payload.checklist.map((item) => (
            <li key={item.id} className={`rounded-xl border p-4 ${SEVERITY_STYLES[item.severity]}`}>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold">{item.label}</p>
                <span className="shrink-0 text-xs font-medium tracking-wide uppercase opacity-70">
                  {item.severity}
                </span>
              </div>
              <p className="mt-1 text-sm opacity-80">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">
          Assumptions <span className="text-stone-400">· v{assumptionVersion}</span>
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Every number the engine used, with its source and confidence. Editing any value creates
          a new version and recomputes the pro forma.
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
                    <td className="px-4 py-2.5 font-medium text-stone-800">{humanize(v.key)}</td>
                    <td className="px-4 py-2.5">{formatAssumptionValue(v)}</td>
                    <td className="px-4 py-2.5 text-sm">
                      <AssumptionSourceView source={v.source} />
                    </td>
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

        <details className="mt-4 rounded-xl border border-stone-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-stone-700 hover:text-stone-900">
            Revise assumptions (creates v{assumptionVersion + 1})
          </summary>
          <form action={revise} className="space-y-6 border-t border-stone-200 p-4">
            <input type="hidden" name="dossierId" value={dossier.id} />
            <AssumptionFields values={valueMap} />
            <Button type="submit" className="bg-stone-900 text-white hover:bg-stone-700">
              Save as v{assumptionVersion + 1} and recompute
            </Button>
          </form>
        </details>
      </section>
    </div>
  );
}
