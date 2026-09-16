import { and, desc, eq, inArray } from "drizzle-orm";

import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { exceptions, properties, type ExceptionEvidence } from "@/lib/db/schema";
import { formatCents, formatDateTime } from "@/lib/format";
import { getActiveWorkspace } from "@/lib/workspace";

import { confirmException, dismissException, runReconcileNow } from "./actions";

export const dynamic = "force-dynamic";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-sky-100 text-sky-800",
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800",
  dismissed: "bg-stone-100 text-stone-600",
  resolved: "bg-stone-100 text-stone-600",
};

function monthLabel(month: string | null): string {
  if (!month) return "—";
  return new Date(`${month}T00:00:00Z`).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function EvidenceList({ evidence }: { evidence: ExceptionEvidence[] }) {
  return (
    <ul className="space-y-1 text-xs text-stone-500">
      {evidence.map((item, i) => (
        <li key={i} className="flex flex-wrap items-center gap-2">
          {item.documentId ? (
            <a
              href={`/api/documents/${item.documentId}/file`}
              target="_blank"
              className="font-medium text-emerald-800 hover:underline"
            >
              source document
            </a>
          ) : null}
          {item.transactionId ? (
            <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-500">
              tx {item.transactionId.slice(0, 8)}
            </span>
          ) : null}
          {item.note ? <span>{item.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export default async function ExceptionsPage() {
  const workspace = await getActiveWorkspace();

  const open = await db
    .select({ exception: exceptions, propertyName: properties.name })
    .from(exceptions)
    .leftJoin(properties, eq(exceptions.propertyId, properties.id))
    .where(and(eq(exceptions.workspaceId, workspace.id), eq(exceptions.status, "open")))
    .orderBy(desc(exceptions.dollarImpactCents))
    .limit(100);

  const decided = await db
    .select({ exception: exceptions, propertyName: properties.name })
    .from(exceptions)
    .leftJoin(properties, eq(exceptions.propertyId, properties.id))
    .where(
      and(
        eq(exceptions.workspaceId, workspace.id),
        inArray(exceptions.status, ["confirmed", "dismissed", "resolved"]),
      ),
    )
    .orderBy(desc(exceptions.updatedAt))
    .limit(15);

  const openTotalCents = open.reduce((sum, r) => sum + r.exception.dollarImpactCents, 0);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exceptions</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Deterministic findings from the reconciliation engine — fee drift, duplicate
            charges, repeat repairs, insurance/tax jumps, vacancy vs. plan, and aging work
            orders. Nothing reaches the impact ledger until you confirm it.
          </p>
        </div>
        <form action={runReconcileNow}>
          <Button type="submit" variant="outline">
            Re-run reconciliation
          </Button>
        </form>
      </div>

      {open.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          No open exceptions. Reconciliation runs automatically when a statement clears the
          verify queue — or use the button above after editing budgets.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            {open.length} open —{" "}
            <span className="font-semibold text-stone-900">{formatCents(openTotalCents)}</span>{" "}
            under review
          </p>
          {open.map(({ exception, propertyName }) => (
            <div
              key={exception.id}
              className="rounded-xl border border-stone-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[exception.severity]}`}
                  >
                    {exception.severity}
                  </span>
                  <span className="font-mono text-xs text-stone-500">{exception.ruleId}</span>
                  <span className="text-xs text-stone-400">
                    {propertyName ?? "Unassigned"} · {monthLabel(exception.month)}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-stone-500">dollar impact</div>
                  <div className="text-lg font-semibold text-stone-900">
                    {formatCents(exception.dollarImpactCents)}
                  </div>
                </div>
              </div>
              <div className="space-y-3 px-5 py-4">
                <p className="text-sm font-medium text-stone-800">{exception.summary}</p>
                <EvidenceList evidence={exception.evidence} />
                {exception.recommendedAction ? (
                  <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
                    <span className="font-medium text-stone-700">Recommended: </span>
                    {exception.recommendedAction}
                  </p>
                ) : null}
                <form className="flex items-center gap-2 pt-1">
                  <input type="hidden" name="exceptionId" value={exception.id} />
                  <Button
                    type="submit"
                    formAction={confirmException}
                    className="bg-emerald-700 text-white hover:bg-emerald-600"
                  >
                    Confirm — add {formatCents(exception.dollarImpactCents)} to ledger
                  </Button>
                  <Button type="submit" formAction={dismissException} variant="outline">
                    Dismiss
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Recently decided</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                  <th className="px-4 py-3 font-medium">Finding</th>
                  <th className="px-4 py-3 font-medium">Property</th>
                  <th className="px-4 py-3 font-medium">Impact</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Decided</th>
                </tr>
              </thead>
              <tbody>
                {decided.map(({ exception, propertyName }) => (
                  <tr key={exception.id} className="border-b border-stone-100 last:border-0">
                    <td className="max-w-md px-4 py-3">
                      <span className="font-mono text-xs text-stone-400">{exception.ruleId}</span>
                      <span className="ml-2 text-stone-700">{exception.summary}</span>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{propertyName ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-stone-800">
                      {formatCents(exception.dollarImpactCents)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[exception.status] ?? ""}`}
                      >
                        {exception.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {formatDateTime(exception.confirmedAt ?? exception.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
