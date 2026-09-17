import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";

import { EvidenceList } from "@/components/evidence-list";
import { db } from "@/lib/db";
import {
  actualLines,
  budgetLines,
  exceptions,
  monthlyReviews,
  properties,
} from "@/lib/db/schema";
import { formatCents } from "@/lib/format";
import { isIncomeCategory } from "@/reconcile";
import { getActiveWorkspace } from "@/lib/workspace";

import { GenerateReviewButton } from "./generate-button";

export const dynamic = "force-dynamic";

function monthLabel(month: string): string {
  return new Date(`${month}T00:00:00Z`).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-sky-100 text-sky-800",
};

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string; month?: string }>;
}) {
  const { property: propertyParam, month: monthParam } = await searchParams;
  const workspace = await getActiveWorkspace();

  const propertyRows = await db
    .select()
    .from(properties)
    .where(eq(properties.workspaceId, workspace.id))
    .orderBy(properties.name);

  if (propertyRows.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monthly Owner Review</h1>
        <p className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          No properties yet — run <code className="font-mono">npm run db:seed</code> for the demo
          property, then forward a statement.
        </p>
      </div>
    );
  }

  const selectedProperty =
    propertyRows.find((p) => p.id === propertyParam) ?? propertyRows[0];

  // Months with any budget or actual activity for this property.
  const [budgetMonths, actualMonths] = await Promise.all([
    db
      .select({ month: budgetLines.month })
      .from(budgetLines)
      .where(
        and(
          eq(budgetLines.workspaceId, workspace.id),
          eq(budgetLines.propertyId, selectedProperty.id),
        ),
      ),
    db
      .select({ month: actualLines.month })
      .from(actualLines)
      .where(
        and(
          eq(actualLines.workspaceId, workspace.id),
          eq(actualLines.propertyId, selectedProperty.id),
        ),
      ),
  ]);
  const months = [...new Set([...budgetMonths, ...actualMonths].map((r) => r.month))]
    .sort()
    .reverse();
  const selectedMonth =
    monthParam && months.includes(monthParam) ? monthParam : (months[0] ?? null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monthly Owner Review</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Budget vs. actual, exceptions with evidence, and a narrative that cites exception IDs
          and uses only engine-computed figures.{" "}
          <Link href={`/export?property=${selectedProperty.id}${selectedMonth ? `&month=${selectedMonth}` : ""}`} className="font-medium text-emerald-700 underline">
            Export this month for a CPA
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {propertyRows.map((p) => (
          <Link
            key={p.id}
            href={`/review?property=${p.id}`}
            className={`rounded-full px-3 py-1.5 font-medium ${
              p.id === selectedProperty.id
                ? "bg-emerald-700 text-white"
                : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
            }`}
          >
            {p.name}
          </Link>
        ))}
      </div>

      {months.length === 0 || !selectedMonth ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          No activity for {selectedProperty.name} yet. Set a budget on the{" "}
          <a href="/budget" className="font-medium text-emerald-700 underline">
            budget page
          </a>{" "}
          and forward a PM statement.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {months.map((m) => (
              <Link
                key={m}
                href={`/review?property=${selectedProperty.id}&month=${m}`}
                className={`rounded-full px-3 py-1.5 font-medium ${
                  m === selectedMonth
                    ? "bg-stone-900 text-white"
                    : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                }`}
              >
                {monthLabel(m)}
              </Link>
            ))}
          </div>

          <ReviewDetail
            workspaceId={workspace.id}
            propertyId={selectedProperty.id}
            propertyName={selectedProperty.name}
            month={selectedMonth}
          />
        </>
      )}
    </div>
  );
}

async function ReviewDetail(props: {
  workspaceId: string;
  propertyId: string;
  propertyName: string;
  month: string;
}) {
  const { workspaceId, propertyId, propertyName, month } = props;

  const [budgetRows, actualRows, exceptionRows, reviewRows] = await Promise.all([
    db
      .select()
      .from(budgetLines)
      .where(
        and(
          eq(budgetLines.workspaceId, workspaceId),
          eq(budgetLines.propertyId, propertyId),
          eq(budgetLines.month, month),
        ),
      ),
    db
      .select()
      .from(actualLines)
      .where(
        and(
          eq(actualLines.workspaceId, workspaceId),
          eq(actualLines.propertyId, propertyId),
          eq(actualLines.month, month),
        ),
      ),
    db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.workspaceId, workspaceId),
          eq(exceptions.propertyId, propertyId),
          eq(exceptions.month, month),
        ),
      )
      .orderBy(desc(exceptions.dollarImpactCents)),
    db
      .select()
      .from(monthlyReviews)
      .where(
        and(
          eq(monthlyReviews.workspaceId, workspaceId),
          eq(monthlyReviews.propertyId, propertyId),
          eq(monthlyReviews.month, month),
        ),
      )
      .limit(1),
  ]);

  const categories = [
    ...new Set([...budgetRows.map((b) => b.category), ...actualRows.map((a) => a.category)]),
  ].sort();
  const rows = categories.map((category) => {
    const budgetCents = budgetRows
      .filter((b) => b.category === category)
      .reduce((sum, b) => sum + b.amountCents, 0);
    const actualCents = actualRows
      .filter((a) => a.category === category)
      .reduce((sum, a) => sum + a.amountCents, 0);
    const income = isIncomeCategory(category);
    const varianceCents = income ? actualCents - budgetCents : Math.abs(actualCents) - budgetCents;
    return { category, income, budgetCents, actualCents, varianceCents };
  });
  const incomeActual = rows.filter((r) => r.income).reduce((s, r) => s + r.actualCents, 0);
  const expenseActual = rows.filter((r) => !r.income).reduce((s, r) => s + Math.abs(r.actualCents), 0);

  const review = reviewRows[0] ?? null;

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {propertyName} — {monthLabel(month)}
            </h2>
            {review ? (
              <p className="mt-0.5 text-xs text-stone-400">
                generated by {review.generator}
                {review.usedFallback ? " · deterministic template (groundedness fallback)" : ""}
              </p>
            ) : null}
          </div>
          <GenerateReviewButton
            propertyId={propertyId}
            month={month}
            hasReview={review !== null}
          />
        </div>
        {review ? (
          <div className="space-y-3 px-5 py-4">
            {review.narrative.split("\n\n").map((paragraph, i) => (
              <p key={i} className="text-sm leading-relaxed text-stone-700">
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-stone-500">
            No narrative generated for this month yet.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Budget vs. actual</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">Budget</th>
                <th className="px-4 py-3 text-right font-medium">Actual</th>
                <th className="px-4 py-3 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-stone-700">
                    {r.category.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-2.5 text-right text-stone-600">
                    {formatCents(r.budgetCents)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-stone-800">
                    {formatCents(r.income ? r.actualCents : Math.abs(r.actualCents))}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium ${
                      r.varianceCents > 0
                        ? r.income
                          ? "text-emerald-700"
                          : "text-red-700"
                        : r.varianceCents < 0
                          ? r.income
                            ? "text-red-700"
                            : "text-emerald-700"
                          : "text-stone-500"
                    }`}
                  >
                    {r.varianceCents === 0 ? "—" : formatCents(r.varianceCents)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-stone-200 bg-stone-50 font-medium">
                <td className="px-4 py-2.5 text-stone-700">Net cash flow</td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right text-stone-900">
                  {formatCents(incomeActual - expenseActual)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">
          Exceptions ({exceptionRows.length})
        </h2>
        {exceptionRows.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
            None — the month reconciled cleanly.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {exceptionRows.map((ex) => (
              <div
                key={ex.id}
                className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-stone-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                      {ex.id.slice(0, 8)}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[ex.severity]}`}
                    >
                      {ex.severity}
                    </span>
                    <span className="font-mono text-xs text-stone-500">{ex.ruleId}</span>
                    <span className="text-xs text-stone-400">{ex.status}</span>
                  </div>
                  <div className="text-sm font-semibold text-stone-900">
                    {formatCents(ex.dollarImpactCents)}
                  </div>
                </div>
                <p className="mt-2 text-sm text-stone-800">{ex.summary}</p>
                <div className="mt-2">
                  <EvidenceList evidence={ex.evidence} exceptionId={ex.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
