import { and, desc, eq, inArray } from "drizzle-orm";

import { mailtoFor, type ActionDraftPayload } from "@/coordinator";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { actions, exceptions, properties } from "@/lib/db/schema";
import { formatCents, formatDateTime } from "@/lib/format";
import { getActiveWorkspace } from "@/lib/workspace";

import { approveAction, draftFollowUp, rejectAction, saveActionDraft } from "./actions";
import { CopyButton } from "./copy-button";

export const dynamic = "force-dynamic";

const TYPE_STYLES: Record<string, { label: string; classes: string }> = {
  email_pm: { label: "PM email", classes: "bg-sky-100 text-sky-800" },
  request_quote: { label: "Quote request", classes: "bg-violet-100 text-violet-800" },
  reminder: { label: "Reminder", classes: "bg-amber-100 text-amber-800" },
  ledger_adjustment: { label: "Ledger adjustment", classes: "bg-stone-100 text-stone-600" },
  call_pm: { label: "Call PM", classes: "bg-stone-100 text-stone-600" },
  other: { label: "Other", classes: "bg-stone-100 text-stone-600" },
};

// Statuses that mean an exception already has a live follow-up draft.
const LIVE_STATUSES = ["pending_approval", "approved", "sent", "completed"] as const;

function TypeBadge({ actionType }: { actionType: string }) {
  const style = TYPE_STYLES[actionType] ?? TYPE_STYLES.other;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style.classes}`}>
      {style.label}
    </span>
  );
}

function CitedExceptions({ payload, summaries }: { payload: ActionDraftPayload; summaries: Map<string, string> }) {
  const ids = payload.citedExceptionIds ?? [];
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-stone-500">Cited findings:</span>
      {ids.map((id) => (
        <a
          key={id}
          href="/exceptions"
          title={summaries.get(id) ?? id}
          className="rounded bg-stone-900 px-1.5 py-0.5 font-mono text-[10px] text-white hover:bg-stone-700"
        >
          {id.slice(0, 8)}
        </a>
      ))}
    </div>
  );
}

export default async function ActionsPage() {
  const workspace = await getActiveWorkspace();

  const [pendingRows, approvedRows, rejectedRows, confirmedRows, liveActionRows] =
    await Promise.all([
      db
        .select()
        .from(actions)
        .where(and(eq(actions.workspaceId, workspace.id), eq(actions.status, "pending_approval")))
        .orderBy(desc(actions.createdAt))
        .limit(50),
      db
        .select()
        .from(actions)
        .where(and(eq(actions.workspaceId, workspace.id), eq(actions.status, "approved")))
        .orderBy(desc(actions.approvedAt))
        .limit(20),
      db
        .select()
        .from(actions)
        .where(and(eq(actions.workspaceId, workspace.id), eq(actions.status, "rejected")))
        .orderBy(desc(actions.updatedAt))
        .limit(10),
      db
        .select({ exception: exceptions, propertyName: properties.name })
        .from(exceptions)
        .leftJoin(properties, eq(exceptions.propertyId, properties.id))
        .where(and(eq(exceptions.workspaceId, workspace.id), eq(exceptions.status, "confirmed")))
        .orderBy(desc(exceptions.dollarImpactCents))
        .limit(50),
      db
        .select({ exceptionId: actions.exceptionId })
        .from(actions)
        .where(
          and(eq(actions.workspaceId, workspace.id), inArray(actions.status, [...LIVE_STATUSES])),
        ),
    ]);

  const liveExceptionIds = new Set(liveActionRows.map((r) => r.exceptionId).filter(Boolean));
  const draftable = confirmedRows.filter((r) => !liveExceptionIds.has(r.exception.id));

  // Exception summaries for the cited-finding tooltips.
  const citedIds = [
    ...new Set(
      [...pendingRows, ...approvedRows, ...rejectedRows].flatMap(
        (a) => (a.draftPayload as ActionDraftPayload).citedExceptionIds ?? [],
      ),
    ),
  ];
  const citedRows = citedIds.length
    ? await db
        .select({ id: exceptions.id, summary: exceptions.summary })
        .from(exceptions)
        .where(and(eq(exceptions.workspaceId, workspace.id), inArray(exceptions.id, citedIds)))
    : [];
  const citedSummaries = new Map(citedRows.map((r) => [r.id, r.summary]));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approval queue</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          The Coordinator drafts PM follow-ups, quote requests, and renewal reminders from your
          confirmed findings and the renewal calendar. Review, edit, then approve or reject.
        </p>
        <p className="mt-3 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Nothing is ever sent automatically.</span> Approving a
          draft only unlocks a mailto link and a copy button — you send it from your own mail
          client. Direct sending (SMTP) arrives in v1.1.
        </p>
      </div>

      {draftable.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Confirmed findings awaiting a draft ({draftable.length})
          </h2>
          <div className="mt-3 space-y-2">
            {draftable.map(({ exception, propertyName }) => (
              <div
                key={exception.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-5 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <span className="rounded bg-stone-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                    {exception.id.slice(0, 8)}
                  </span>
                  <span className="ml-2 text-sm text-stone-800">{exception.summary}</span>
                  <span className="ml-2 text-xs text-stone-400">
                    {propertyName ?? "Unassigned"} · {formatCents(exception.dollarImpactCents)}
                  </span>
                </div>
                <form action={draftFollowUp}>
                  <input type="hidden" name="exceptionId" value={exception.id} />
                  <Button type="submit" variant="outline">
                    Draft follow-up
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold tracking-tight">
          Pending approval ({pendingRows.length})
        </h2>
        {pendingRows.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
            Nothing waiting on you. Confirm an exception on the{" "}
            <a href="/exceptions" className="font-medium text-emerald-700 underline">
              exceptions page
            </a>{" "}
            to have the Coordinator draft a follow-up, or check the{" "}
            <a href="/calendar" className="font-medium text-emerald-700 underline">
              renewal calendar
            </a>
            .
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {pendingRows.map((action) => {
              const payload = action.draftPayload as ActionDraftPayload;
              return (
                <div
                  key={action.id}
                  className="rounded-xl border border-stone-200 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeBadge actionType={action.actionType} />
                      <span className="text-sm font-medium text-stone-800">{action.title}</span>
                    </div>
                    <div className="text-right text-xs text-stone-400">
                      {action.dollarAmountCents !== null ? (
                        <div className="text-sm font-semibold text-stone-900">
                          {formatCents(action.dollarAmountCents)}
                        </div>
                      ) : null}
                      drafted {formatDateTime(action.createdAt)}
                      {payload.generator ? ` · ${payload.generator}` : ""}
                      {payload.usedFallback ? " · template fallback" : ""}
                    </div>
                  </div>
                  <form className="space-y-3 px-5 py-4">
                    <input type="hidden" name="actionId" value={action.id} />
                    <CitedExceptions payload={payload} summaries={citedSummaries} />
                    {payload.subject !== null ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-medium text-stone-500">
                          To
                          <input
                            name="to"
                            defaultValue={payload.to ?? ""}
                            placeholder="pm@example.com — fill in before sending"
                            className="mt-1 h-8 w-full rounded-lg border border-stone-300 bg-transparent px-2.5 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus-visible:border-emerald-600"
                          />
                        </label>
                        <label className="block text-xs font-medium text-stone-500">
                          Subject
                          <input
                            name="subject"
                            defaultValue={payload.subject}
                            className="mt-1 h-8 w-full rounded-lg border border-stone-300 bg-transparent px-2.5 text-sm text-stone-900 outline-none focus-visible:border-emerald-600"
                          />
                        </label>
                      </div>
                    ) : null}
                    <label className="block text-xs font-medium text-stone-500">
                      {payload.subject !== null ? "Body" : "Note"}
                      <textarea
                        name="body"
                        rows={12}
                        defaultValue={payload.body}
                        className="mt-1 w-full rounded-lg border border-stone-300 bg-transparent px-2.5 py-2 font-mono text-xs leading-relaxed text-stone-900 outline-none focus-visible:border-emerald-600"
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button type="submit" formAction={saveActionDraft} variant="outline">
                        Save edits
                      </Button>
                      <Button
                        type="submit"
                        formAction={approveAction}
                        className="bg-emerald-700 text-white hover:bg-emerald-600"
                      >
                        Approve
                      </Button>
                      <Button type="submit" formAction={rejectAction} variant="outline">
                        Reject
                      </Button>
                    </div>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {approvedRows.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Approved — ready to send ({approvedRows.length})
          </h2>
          <div className="mt-3 space-y-4">
            {approvedRows.map((action) => {
              const payload = action.draftPayload as ActionDraftPayload;
              const href = mailtoFor(payload);
              return (
                <div
                  key={action.id}
                  className="rounded-xl border border-emerald-200 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeBadge actionType={action.actionType} />
                      <span className="text-sm font-medium text-stone-800">{action.title}</span>
                    </div>
                    <div className="text-xs text-stone-400">
                      approved {formatDateTime(action.approvedAt)}
                    </div>
                  </div>
                  <div className="space-y-3 px-5 py-4">
                    <CitedExceptions payload={payload} summaries={citedSummaries} />
                    {payload.subject !== null ? (
                      <p className="text-sm text-stone-600">
                        <span className="font-medium text-stone-700">Subject:</span>{" "}
                        {payload.subject}
                      </p>
                    ) : null}
                    <pre className="max-h-64 overflow-y-auto rounded-lg bg-stone-50 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-stone-700">
                      {payload.body}
                    </pre>
                    <div className="flex flex-wrap items-center gap-2">
                      {href ? (
                        <a
                          href={href}
                          className="inline-flex h-8 items-center justify-center rounded-lg bg-emerald-700 px-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
                        >
                          Open in mail client
                        </a>
                      ) : (
                        <span className="text-xs text-stone-500">
                          Owner-facing reminder — nothing to mail.
                        </span>
                      )}
                      <CopyButton
                        text={
                          payload.subject !== null
                            ? `To: ${payload.to ?? ""}\nSubject: ${payload.subject}\n\n${payload.body}`
                            : payload.body
                        }
                      />
                      <span className="text-xs text-stone-400">
                        Not sent by Apex — send it yourself from your mail client.
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {rejectedRows.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Rejected</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                  <th className="px-4 py-3 font-medium">Draft</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {rejectedRows.map((action) => (
                  <tr key={action.id} className="border-b border-stone-100 last:border-0">
                    <td className="max-w-md px-4 py-3 text-stone-700">{action.title}</td>
                    <td className="px-4 py-3">
                      <TypeBadge actionType={action.actionType} />
                    </td>
                    <td className="px-4 py-3 text-stone-600">{formatDateTime(action.updatedAt)}</td>
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