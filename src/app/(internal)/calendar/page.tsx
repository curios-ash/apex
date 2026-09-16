import { and, asc, eq } from "drizzle-orm";

import { daysBetweenIso, obligationLabel } from "@/coordinator";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { obligations, properties } from "@/lib/db/schema";
import { getActiveWorkspace } from "@/lib/workspace";
import { syncObligations } from "@/lib/obligations/sync";

import { checkRenewalReminders } from "./actions";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 90;

const TYPE_ORDER = [
  "lease_renewal",
  "insurance_renewal",
  "pm_agreement_renewal",
  "loan_arm_reset",
  "loan_maturity",
  "tax_deadline",
  "license_renewal",
  "other",
] as const;

function daysBadge(daysUntil: number): { text: string; classes: string } {
  if (daysUntil < 0) {
    const n = Math.abs(daysUntil);
    return {
      text: `${n} day${n === 1 ? "" : "s"} overdue`,
      classes: "bg-red-100 text-red-800",
    };
  }
  if (daysUntil === 0) return { text: "due today", classes: "bg-red-100 text-red-800" };
  if (daysUntil <= 7)
    return { text: `in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`, classes: "bg-red-100 text-red-800" };
  if (daysUntil <= 30) return { text: `in ${daysUntil} days`, classes: "bg-amber-100 text-amber-800" };
  return { text: `in ${daysUntil} days`, classes: "bg-stone-100 text-stone-600" };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type ObligationRow = {
  obligation: typeof obligations.$inferSelect;
  propertyName: string | null;
};

function ObligationRow({ row, today }: { row: ObligationRow; today: string }) {
  const { obligation, propertyName } = row;
  const daysUntil = daysBetweenIso(today, obligation.dueDate);
  const badge = daysBadge(daysUntil);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm text-stone-800">{obligation.notes ?? obligationLabel(obligation.obligationType)}</p>
        <p className="mt-0.5 text-xs text-stone-400">
          {propertyName ?? "Portfolio"} · due {formatDate(obligation.dueDate)} · notice window{" "}
          {obligation.noticeDays} days
        </p>
      </div>
      <span
        className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.classes}`}
      >
        {badge.text}
      </span>
    </div>
  );
}

export default async function CalendarPage() {
  const workspace = await getActiveWorkspace();

  // The calendar derives from the property record on every view — cheap and
  // idempotent, so leases/policies/agreements always reflect here.
  await syncObligations(workspace.id);

  const rows = await db
    .select({ obligation: obligations, propertyName: properties.name })
    .from(obligations)
    .leftJoin(properties, eq(obligations.propertyId, properties.id))
    .where(and(eq(obligations.workspaceId, workspace.id), eq(obligations.status, "pending")))
    .orderBy(asc(obligations.dueDate))
    .limit(200);

  const today = new Date().toISOString().slice(0, 10);
  const overdue = rows.filter((r) => daysBetweenIso(today, r.obligation.dueDate) < 0);
  const upcoming = rows.filter((r) => {
    const d = daysBetweenIso(today, r.obligation.dueDate);
    return d >= 0 && d <= WINDOW_DAYS;
  });
  const laterCount = rows.length - overdue.length - upcoming.length;

  const byType = new Map<string, ObligationRow[]>();
  for (const row of upcoming) {
    const list = byType.get(row.obligation.obligationType) ?? [];
    list.push(row);
    byType.set(row.obligation.obligationType, list);
  }
  const groups = TYPE_ORDER.filter((t) => byType.has(t)).map((t) => [t, byType.get(t)!] as const);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Renewal calendar</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Lease ends, insurance renewals, and PM agreement deadlines, derived automatically
            from the property record. The daily cron drafts reminders into the{" "}
            <a href="/actions" className="font-medium text-emerald-700 underline">
              approval queue
            </a>{" "}
            30, 14, and 7 days before each date — nothing is sent automatically.
          </p>
        </div>
        <form action={checkRenewalReminders}>
          <Button type="submit" variant="outline">
            Check for due reminders
          </Button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          No obligations yet. They appear automatically once the workspace has leases with end
          dates, insurance policies with renewal dates, or PM agreements with end dates — run{" "}
          <code className="font-mono">npm run db:seed</code> for demo data.
        </p>
      ) : (
        <>
          {overdue.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold tracking-tight text-red-800">
                Overdue ({overdue.length})
              </h2>
              <div className="mt-3 divide-y divide-stone-100 rounded-xl border border-red-200 bg-white shadow-sm">
                {overdue.map((row) => (
                  <ObligationRow key={row.obligation.id} row={row} today={today} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="text-lg font-semibold tracking-tight">
              Next {WINDOW_DAYS} days ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
                Nothing due in the next {WINDOW_DAYS} days.
              </p>
            ) : (
              <div className="mt-3 space-y-6">
                {groups.map(([type, groupRows]) => (
                  <div key={type}>
                    <h3 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
                      {obligationLabel(type)}s
                    </h3>
                    <div className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white shadow-sm">
                      {groupRows.map((row) => (
                        <ObligationRow key={row.obligation.id} row={row} today={today} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {laterCount > 0 ? (
            <p className="text-sm text-stone-500">
              Plus {laterCount} more beyond {WINDOW_DAYS} days — they move into this view as their
              windows approach.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
