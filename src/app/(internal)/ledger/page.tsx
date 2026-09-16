import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { impactLedgerEntries, properties } from "@/lib/db/schema";
import { formatCents } from "@/lib/format";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const ENTRY_TYPE_LABELS: Record<string, string> = {
  fee_recovered: "Fee recovered",
  duplicate_charge_refunded: "Duplicate refunded",
  unexplained_fee_reversed: "Fee reversed",
  cost_avoided: "Cost avoided",
  rent_recovered: "Rent recovered",
  deposit_recovered: "Deposit recovered",
  other: "Other",
};

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function LedgerPage() {
  const workspace = await getActiveWorkspace();

  const entries = await db
    .select({ entry: impactLedgerEntries, propertyName: properties.name })
    .from(impactLedgerEntries)
    .leftJoin(properties, eq(impactLedgerEntries.propertyId, properties.id))
    .where(eq(impactLedgerEntries.workspaceId, workspace.id))
    .orderBy(desc(impactLedgerEntries.occurredOn))
    .limit(200);

  const confirmed = entries.filter((e) => e.entry.confirmed);
  const totalCents = confirmed.reduce((sum, e) => sum + e.entry.amountCents, 0);
  const perProperty = new Map<string, { name: string; cents: number }>();
  for (const { entry, propertyName } of confirmed) {
    const key = entry.propertyId ?? "unassigned";
    const current = perProperty.get(key) ?? { name: propertyName ?? "Unassigned", cents: 0 };
    current.cents += entry.amountCents;
    perProperty.set(key, current);
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Impact ledger</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Dollars the audit has found, confirmed by you. An exception&apos;s impact lands here
          only after you confirm it on the{" "}
          <a href="/exceptions" className="font-medium text-emerald-700 underline">
            exceptions page
          </a>
          .
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-xs font-medium tracking-wide text-emerald-700 uppercase">
            Total confirmed impact
          </div>
          <div className="mt-1 text-3xl font-semibold text-emerald-900">
            {formatCents(totalCents)}
          </div>
        </div>
        {[...perProperty.entries()].map(([id, p]) => (
          <div key={id} className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="text-xs font-medium tracking-wide text-stone-500 uppercase">
              {p.name}
            </div>
            <div className="mt-1 text-2xl font-semibold text-stone-900">
              {formatCents(p.cents)}
            </div>
          </div>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          Nothing confirmed yet. When you confirm an exception, its dollar impact appears here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Finding</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ entry, propertyName }) => (
                <tr key={entry.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-stone-600">
                    {dayLabel(entry.occurredOn)}
                  </td>
                  <td className="px-4 py-3 text-stone-600">{propertyName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                      {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                    </span>
                  </td>
                  <td className="max-w-md px-4 py-3 text-stone-700">{entry.description}</td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-800">
                    {formatCents(entry.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
