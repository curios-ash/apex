import { and, desc, eq, isNotNull } from "drizzle-orm";

import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

const ACTOR_STYLES: Record<string, string> = {
  user: "bg-emerald-100 text-emerald-800",
  agent: "bg-violet-100 text-violet-800",
  system: "bg-stone-100 text-stone-600",
};

// The audit log viewer. Lives at /activity because /audit is the public PM
// Statement Audit tool on the marketing site.
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; target?: string }>;
}) {
  const { action: actionFilter, target: targetFilter } = await searchParams;
  const workspace = await getActiveWorkspace();

  const [actionOptions, targetOptions] = await Promise.all([
    db
      .selectDistinct({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.workspaceId, workspace.id))
      .orderBy(auditLog.action),
    db
      .selectDistinct({ targetType: auditLog.targetType })
      .from(auditLog)
      .where(and(eq(auditLog.workspaceId, workspace.id), isNotNull(auditLog.targetType)))
      .orderBy(auditLog.targetType),
  ]);

  const filters = [eq(auditLog.workspaceId, workspace.id)];
  if (actionFilter) filters.push(eq(auditLog.action, actionFilter));
  if (targetFilter) filters.push(eq(auditLog.targetType, targetFilter));

  const rows = await db
    .select({ entry: auditLog, actorEmail: users.email })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorUserId, users.id))
    .where(and(...filters))
    .orderBy(desc(auditLog.createdAt))
    .limit(PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Every state change in the workspace — ingestion, verification, reconciliation,
          exception decisions, Coordinator drafts, approvals — newest first.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-stone-500">
          Action
          <select
            name="action"
            defaultValue={actionFilter ?? ""}
            className="mt-1 block h-8 rounded-lg border border-stone-300 bg-white px-2 text-sm text-stone-900 outline-none focus-visible:border-emerald-600"
          >
            <option value="">All actions</option>
            {actionOptions.map((o) => (
              <option key={o.action} value={o.action}>
                {o.action}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-stone-500">
          Entity type
          <select
            name="target"
            defaultValue={targetFilter ?? ""}
            className="mt-1 block h-8 rounded-lg border border-stone-300 bg-white px-2 text-sm text-stone-900 outline-none focus-visible:border-emerald-600"
          >
            <option value="">All types</option>
            {targetOptions.map((o) => (
              <option key={o.targetType} value={o.targetType ?? ""}>
                {o.targetType}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {actionFilter || targetFilter ? (
          <a href="/activity" className="text-sm text-stone-500 underline hover:text-stone-700">
            Clear
          </a>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          No audit rows match. Activity appears here as you upload statements, decide on
          exceptions, and approve drafts.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, actorEmail }) => (
                <tr key={entry.id} className="border-b border-stone-100 align-top last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-stone-600">
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACTOR_STYLES[entry.actorType] ?? ""}`}
                    >
                      {entry.actorType}
                    </span>
                    {actorEmail ? (
                      <span className="ml-1.5 text-xs text-stone-500">{actorEmail}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-800">{entry.action}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {entry.targetType ? (
                      <>
                        {entry.targetType}{" "}
                        {entry.targetId ? (
                          <span className="font-mono text-xs text-stone-400">
                            {entry.targetId.slice(0, 8)}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-md px-4 py-3">
                    {Object.keys(entry.metadata as Record<string, unknown>).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-stone-500 hover:text-stone-700">
                          metadata
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-stone-50 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-stone-600">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-xs text-stone-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === PAGE_SIZE ? (
        <p className="text-xs text-stone-400">Showing the latest {PAGE_SIZE} rows.</p>
      ) : null}
    </div>
  );
}
