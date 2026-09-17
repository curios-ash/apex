import Link from "next/link";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { actualLines, budgetLines, properties } from "@/lib/db/schema";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function monthLabel(month: string): string {
  return new Date(`${month}T00:00:00Z`).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string; month?: string; empty?: string }>;
}) {
  const { property: propertyParam, month: monthParam, empty } = await searchParams;
  const workspace = await getActiveWorkspace();

  const propertyRows = await db
    .select()
    .from(properties)
    .where(eq(properties.workspaceId, workspace.id))
    .orderBy(properties.name);

  const selectedProperty =
    propertyRows.find((p) => p.id === propertyParam) ?? null;

  const monthSources = selectedProperty
    ? await Promise.all([
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
      ])
    : [[], []];
  const months = [...new Set([...monthSources[0], ...monthSources[1]].map((r) => r.month))]
    .sort()
    .reverse();
  const selectedMonth = monthParam && months.includes(monthParam) ? monthParam : null;

  const qs = new URLSearchParams();
  if (selectedProperty) qs.set("propertyId", selectedProperty.id);
  if (selectedMonth) qs.set("month", selectedMonth);
  const downloadHref = `/api/export/cpa${qs.size ? `?${qs.toString()}` : ""}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CPA export</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          A zip of CSV files: impact ledger, exceptions, and monthly actuals. Figures are integer
          cents from the database — the LLM never computes them. Optional filters narrow the
          package; leaving both unset exports the whole workspace.
        </p>
      </div>

      {empty === "1" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The last export had no rows for that filter. Widen the property or month and try again.
        </p>
      ) : null}

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-stone-800">Scope</h2>
        <p className="mt-1 text-sm text-stone-500">Property (optional)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/export"
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              !selectedProperty
                ? "bg-stone-900 text-white"
                : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
            }`}
          >
            Whole workspace
          </Link>
          {propertyRows.map((p) => (
            <Link
              key={p.id}
              href={`/export?property=${p.id}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                selectedProperty?.id === p.id
                  ? "bg-emerald-700 text-white"
                  : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>

        {selectedProperty ? (
          <>
            <p className="mt-4 text-sm text-stone-500">Month (optional)</p>
            {months.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">
                No budget or actual months for this property yet.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={`/export?property=${selectedProperty.id}`}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    !selectedMonth
                      ? "bg-stone-900 text-white"
                      : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                  }`}
                >
                  All months
                </Link>
                {months.map((m) => (
                  <Link
                    key={m}
                    href={`/export?property=${selectedProperty.id}&month=${m}`}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      m === selectedMonth
                        ? "bg-stone-900 text-white"
                        : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    {monthLabel(m)}
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : null}

        <div className="mt-6">
          <a
            href={downloadHref}
            className="inline-flex h-8 items-center rounded-lg bg-stone-900 px-3 text-sm font-medium text-white hover:bg-stone-700"
          >
            Download zip
          </a>
          <p className="mt-2 text-xs text-stone-500">
            Files: README.txt, manifest.json, ledger.csv, exceptions.csv, actuals.csv
          </p>
        </div>
      </section>

      {propertyRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          No properties yet — seed the demo workspace or finish onboarding, then export.
        </p>
      ) : null}
    </div>
  );
}
