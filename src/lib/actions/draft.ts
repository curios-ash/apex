import { and, eq, inArray } from "drizzle-orm";

import {
  RULE_ACTION_TYPE,
  actionTitle,
  buildTemplateDraft,
  daysBetweenIso,
  remindersDue,
  type ActionDraftPayload,
  type DraftContext,
} from "@/coordinator";
import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  actions,
  exceptions,
  obligations,
  pmAgreements,
  properties,
} from "@/lib/db/schema";
import { collectAllowedValues, findUngroundedTokens } from "@/lib/llm";
import { DRAFT_PROMPT_VERSION, getDrafterLlm } from "@/lib/llm/drafter";
import { logLlmCall } from "@/lib/llm/log";

// Coordinator DB binding: turns confirmed exceptions and due obligations into
// drafted actions (status pending_approval). The LLM drafts the text; every
// draft is grounded-checked against its context and falls back to the
// deterministic template. Nothing is ever sent — approval only unlocks the
// mailto link / copy button.

// Statuses that count as "a live action already exists for this exception" —
// rejected is excluded so a rejected draft can be re-drafted.
const LIVE_ACTION_STATUSES = ["pending_approval", "approved", "sent", "completed"] as const;

async function runDrafter(
  workspaceId: string,
  ctx: DraftContext,
): Promise<{ draft: ActionDraftPayload; usedFallback: boolean; generator: string }> {
  const llm = getDrafterLlm();
  const startedAt = Date.now();
  let draft;
  let meta;
  try {
    const result = await llm.draft(ctx);
    draft = result.draft;
    meta = result.meta;
  } catch (error) {
    await logLlmCall({
      workspaceId,
      purpose: "draft",
      meta: {
        provider: "unknown",
        model: "unknown",
        promptVersion: DRAFT_PROMPT_VERSION,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - startedAt,
      },
      error: String(error),
    });
    throw error;
  }
  await logLlmCall({ workspaceId, purpose: "draft", meta, output: draft });

  // The LLM never computes numbers: any $/% it emitted that is not in the
  // context swaps the whole draft for the deterministic template.
  const offenders = findUngroundedTokens(
    `${draft.subject ?? ""}\n${draft.body}`,
    collectAllowedValues(ctx),
  );
  const usedFallback = offenders.length > 0;
  if (usedFallback) {
    console.warn("coordinator draft failed groundedness check", {
      kind: ctx.kind,
      offenders,
    });
    draft = buildTemplateDraft(ctx);
  }

  return {
    draft: { to: draft.to, subject: draft.subject, body: draft.body, citedExceptionIds: [] },
    usedFallback,
    generator: `${meta.model}/${meta.promptVersion}`,
  };
}

// Drafts a PM follow-up email or quote request from a confirmed exception.
// Idempotent per exception while a live action exists. Returns null when the
// exception is missing or not confirmed.
export async function draftFollowUpForException(
  workspaceId: string,
  exceptionId: string,
  opts: { userId?: string | null } = {},
): Promise<{ actionId: string; created: boolean } | null> {
  const [exception] = await db
    .select()
    .from(exceptions)
    .where(and(eq(exceptions.id, exceptionId), eq(exceptions.workspaceId, workspaceId)))
    .limit(1);
  if (!exception || exception.status !== "confirmed") return null;

  const existing = await db
    .select({ id: actions.id })
    .from(actions)
    .where(
      and(
        eq(actions.workspaceId, workspaceId),
        eq(actions.exceptionId, exceptionId),
        inArray(actions.status, [...LIVE_ACTION_STATUSES]),
      ),
    )
    .limit(1);
  if (existing.length > 0) return { actionId: existing[0].id, created: false };

  const [property, agreement] = await Promise.all([
    exception.propertyId
      ? db
          .select()
          .from(properties)
          .where(
            and(eq(properties.id, exception.propertyId), eq(properties.workspaceId, workspaceId)),
          )
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    exception.propertyId
      ? db
          .select()
          .from(pmAgreements)
          .where(
            and(
              eq(pmAgreements.workspaceId, workspaceId),
              eq(pmAgreements.propertyId, exception.propertyId),
            ),
          )
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);

  const kind = RULE_ACTION_TYPE[exception.ruleId] ?? "email_pm";
  const ctx: DraftContext = {
    kind,
    propertyName: property?.name ?? null,
    pmCompanyName: agreement?.pmCompanyName ?? null,
    exceptions: [
      {
        id: exception.id,
        shortId: exception.id.slice(0, 8),
        ruleId: exception.ruleId,
        severity: exception.severity,
        month: exception.month,
        dollarImpactCents: exception.dollarImpactCents,
        summary: exception.summary,
        recommendedAction: exception.recommendedAction,
      },
    ],
    obligation: null,
  };

  const { draft, usedFallback, generator } = await runDrafter(workspaceId, ctx);
  const payload: ActionDraftPayload = {
    ...draft,
    citedExceptionIds: [exception.id],
    generator,
    usedFallback,
  };

  const [action] = await db
    .insert(actions)
    .values({
      workspaceId,
      exceptionId: exception.id,
      actionType: kind,
      title: actionTitle(kind, ctx),
      draftPayload: payload,
      status: "pending_approval",
      dollarAmountCents: exception.dollarImpactCents,
      createdBy: "agent",
    })
    .returning({ id: actions.id });

  await writeAuditLog({
    workspaceId,
    actorUserId: opts.userId ?? null,
    actorType: "agent",
    action: "action.drafted",
    targetType: "action",
    targetId: action.id,
    metadata: {
      actionType: kind,
      exceptionId: exception.id,
      ruleId: exception.ruleId,
      generator,
      usedFallback,
    },
  });

  return { actionId: action.id, created: true };
}

// Drafts renewal reminders for every pending obligation in a 30/14/7-day
// bucket that does not already have one. Called by the daily cron (and
// idempotent across re-runs).
export async function draftRenewalReminders(
  workspaceId: string,
  opts: { today?: string; trigger?: "cron" | "manual" } = {},
): Promise<{ created: number; actionIds: string[] }> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  const pending = await db
    .select({ obligation: obligations, propertyName: properties.name })
    .from(obligations)
    .leftJoin(properties, eq(obligations.propertyId, properties.id))
    .where(and(eq(obligations.workspaceId, workspaceId), eq(obligations.status, "pending")));

  const existingReminderRows = await db
    .select({ draftPayload: actions.draftPayload })
    .from(actions)
    .where(and(eq(actions.workspaceId, workspaceId), eq(actions.actionType, "reminder")));
  const existing = existingReminderRows
    .map((r) => r.draftPayload as Partial<ActionDraftPayload>)
    .filter((p): p is { obligationId: string; thresholdDays: number } =>
      Boolean(p.obligationId) && typeof p.thresholdDays === "number",
    )
    .map((p) => ({ obligationId: p.obligationId, thresholdDays: p.thresholdDays }));

  const due = remindersDue(
    pending.map((r) => ({ id: r.obligation.id, dueDate: r.obligation.dueDate })),
    existing,
    today,
  );
  if (due.length === 0) return { created: 0, actionIds: [] };

  const byId = new Map(pending.map((r) => [r.obligation.id, r]));
  const actionIds: string[] = [];

  for (const { obligationId, thresholdDays } of due) {
    const row = byId.get(obligationId);
    if (!row) continue;
    const { obligation, propertyName } = row;

    const ctx: DraftContext = {
      kind: "reminder",
      propertyName,
      pmCompanyName: null,
      exceptions: [],
      obligation: {
        id: obligation.id,
        obligationType: obligation.obligationType,
        propertyName,
        dueDate: obligation.dueDate,
        daysUntil: daysBetweenIso(today, obligation.dueDate),
        thresholdDays,
        noticeDays: obligation.noticeDays,
        notes: obligation.notes,
      },
    };

    const { draft, usedFallback, generator } = await runDrafter(workspaceId, ctx);
    const payload: ActionDraftPayload = {
      ...draft,
      citedExceptionIds: [],
      obligationId: obligation.id,
      thresholdDays,
      dueDate: obligation.dueDate,
      generator,
      usedFallback,
    };

    const [action] = await db
      .insert(actions)
      .values({
        workspaceId,
        actionType: "reminder",
        title: actionTitle("reminder", ctx),
        draftPayload: payload,
        status: "pending_approval",
        createdBy: "agent",
      })
      .returning({ id: actions.id });
    actionIds.push(action.id);

    await writeAuditLog({
      workspaceId,
      actorType: "agent",
      action: "action.drafted",
      targetType: "action",
      targetId: action.id,
      metadata: {
        actionType: "reminder",
        obligationId: obligation.id,
        obligationType: obligation.obligationType,
        dueDate: obligation.dueDate,
        thresholdDays,
        trigger: opts.trigger ?? "cron",
        generator,
        usedFallback,
      },
    });
  }

  return { created: actionIds.length, actionIds };
}
