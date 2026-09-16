import { formatCents } from "@/lib/format";

import type {
  CoordinatorDraft,
  CoordinatorDraftKind,
  DraftContext,
  DraftExceptionFigure,
} from "./types";

// Which queue item each reconciliation rule drafts. repeat_repair asks for a
// root-cause quote; everything else is a PM follow-up email. The reminder
// kind never comes from rules — it comes from the renewal calendar cron.
export const RULE_ACTION_TYPE: Record<string, "email_pm" | "request_quote"> = {
  fee_drift_v1: "email_pm",
  duplicate_charge_v1: "email_pm",
  repeat_repair_v1: "request_quote",
  insurance_tax_jump_v1: "email_pm",
  vacancy_vs_plan_v1: "email_pm",
  work_order_aging_v1: "email_pm",
};

// Short email topic per rule, used in subjects and queue titles.
export const RULE_TOPICS: Record<string, string> = {
  fee_drift_v1: "management fee reconciliation",
  duplicate_charge_v1: "possible duplicate charge",
  repeat_repair_v1: "repeat repair charges",
  insurance_tax_jump_v1: "insurance/tax increase",
  vacancy_vs_plan_v1: "rent collection vs. plan",
  work_order_aging_v1: "work order status",
};

export function topicFor(ruleId: string): string {
  return RULE_TOPICS[ruleId] ?? "statement finding";
}

// Queue card title, e.g. "Email Sunset Property Management — management fee
// reconciliation ($58.00)".
export function actionTitle(
  kind: CoordinatorDraftKind,
  ctx: DraftContext,
): string {
  if (kind === "reminder") {
    const o = ctx.obligation;
    if (!o) return "Reminder";
    const when =
      o.daysUntil < 0
        ? `overdue by ${Math.abs(o.daysUntil)} days`
        : o.daysUntil === 0
          ? "due today"
          : `due in ${o.daysUntil} days`;
    return `${obligationLabel(o.obligationType)} ${when} — ${o.propertyName ?? "portfolio"}`;
  }
  const impact = ctx.exceptions.reduce((sum, e) => sum + e.dollarImpactCents, 0);
  const topic = topicFor(ctx.exceptions[0]?.ruleId ?? "");
  const target = ctx.pmCompanyName ?? "property manager";
  const prefix = kind === "request_quote" ? `Quote request via ${target}` : `Email ${target}`;
  return `${prefix} — ${topic} (${formatCents(impact)})`;
}

export function obligationLabel(obligationType: string): string {
  switch (obligationType) {
    case "lease_renewal":
      return "Lease renewal";
    case "insurance_renewal":
      return "Insurance renewal";
    case "pm_agreement_renewal":
      return "PM agreement renewal";
    case "loan_arm_reset":
      return "Loan ARM reset";
    case "loan_maturity":
      return "Loan maturity";
    case "tax_deadline":
      return "Tax deadline";
    case "license_renewal":
      return "License renewal";
    default:
      return "Obligation";
  }
}

// ---------------------------------------------------------------------------
// Deterministic template. This is the mock provider's output and the fallback
// when a real model emits an ungrounded number — so it is grounded by
// construction: every $/% it writes comes verbatim from the context.
// ---------------------------------------------------------------------------

function exceptionBlock(e: DraftExceptionFigure): string {
  const lines = [`[${e.shortId}] ${e.summary}`];
  if (e.recommendedAction) lines.push(`Requested resolution: ${e.recommendedAction}`);
  return lines.join("\n");
}

function referencesLine(exceptions: DraftExceptionFigure[]): string {
  const ids = exceptions.map((e) => e.shortId).join(", ");
  return (
    `—\nDrafted by Apex from confirmed finding${exceptions.length === 1 ? "" : "s"} ` +
    `${ids}. Review before sending — Apex never sends email on its own.`
  );
}

function buildEmailPmDraft(ctx: DraftContext): CoordinatorDraft {
  const property = ctx.propertyName ?? "the property";
  const greeting = ctx.pmCompanyName ? `Hello ${ctx.pmCompanyName} team,` : "Hello,";
  const refs = ctx.exceptions.map((e) => e.shortId).join(", ");
  const blocks = ctx.exceptions.map(exceptionBlock).join("\n\n");

  const subject = `${property} — ${topicFor(ctx.exceptions[0]?.ruleId ?? "")} [ref ${refs}]`;
  const body = [
    greeting,
    "",
    `I am the owner of ${property} and I am reviewing the recent owner statement. ` +
      `The item${ctx.exceptions.length === 1 ? "" : "s"} below need${ctx.exceptions.length === 1 ? "s" : ""} ` +
      "resolution:",
    "",
    blocks,
    "",
    "Please confirm by reply. If a credit is due, please apply it to the next owner draw " +
      "and send the corrected statement.",
    "",
    "Thank you,",
    `Owner, ${property}`,
    "",
    referencesLine(ctx.exceptions),
  ].join("\n");

  return { to: null, subject, body };
}

function buildQuoteRequestDraft(ctx: DraftContext): CoordinatorDraft {
  const property = ctx.propertyName ?? "the property";
  const greeting = ctx.pmCompanyName ? `Hello ${ctx.pmCompanyName} team,` : "Hello,";
  const refs = ctx.exceptions.map((e) => e.shortId).join(", ");
  const blocks = ctx.exceptions.map(exceptionBlock).join("\n\n");

  const subject = `Quote request — ${property} ${topicFor(ctx.exceptions[0]?.ruleId ?? "")} [ref ${refs}]`;
  const body = [
    greeting,
    "",
    `I am the owner of ${property}. The recurring charges below suggest we should fix the ` +
      "root cause instead of paying for repeat visits:",
    "",
    blocks,
    "",
    "Please send an itemized quote for a permanent repair, along with the work-order history " +
      "for the visits above. If a root-cause fix is not the right call, please explain why and " +
      "propose the alternative.",
    "",
    "Thank you,",
    `Owner, ${property}`,
    "",
    referencesLine(ctx.exceptions),
  ].join("\n");

  return { to: null, subject, body };
}

const REMINDER_NEXT_STEPS: Record<string, string> = {
  lease_renewal:
    "Confirm the tenant's renewal intent (or ask the PM to), decide on any rent adjustment, " +
    "and send the required notice before the deadline.",
  insurance_renewal:
    "Request the renewal quote from the carrier, compare it against the current premium, and " +
    "bind coverage before the current policy lapses.",
  pm_agreement_renewal:
    "Review this year's PM performance and exceptions, then decide whether to renew, " +
    "renegotiate, or terminate within the notice window.",
};

function buildReminderDraft(ctx: DraftContext): CoordinatorDraft {
  const o = ctx.obligation;
  if (!o) return { to: null, subject: null, body: "Reminder." };

  const when =
    o.daysUntil < 0
      ? `Overdue by ${Math.abs(o.daysUntil)} days (was due ${o.dueDate}).`
      : o.daysUntil === 0
        ? `Due today (${o.dueDate}).`
        : `Due in ${o.daysUntil} days (${o.dueDate}).`;
  const steps =
    REMINDER_NEXT_STEPS[o.obligationType] ??
    "Review the deadline and take action before it passes.";

  const body = [
    o.notes ?? `${obligationLabel(o.obligationType)} for ${o.propertyName ?? "portfolio"}.`,
    "",
    `${when} Notice window: ${o.noticeDays} days. This is the ${o.thresholdDays}-day reminder.`,
    "",
    `Next steps: ${steps}`,
    "",
    "—\nDrafted by Apex from the renewal calendar. Approving marks it seen — nothing is sent.",
  ].join("\n");

  return { to: null, subject: null, body };
}

export function buildTemplateDraft(ctx: DraftContext): CoordinatorDraft {
  switch (ctx.kind) {
    case "email_pm":
      return buildEmailPmDraft(ctx);
    case "request_quote":
      return buildQuoteRequestDraft(ctx);
    case "reminder":
      return buildReminderDraft(ctx);
  }
}
