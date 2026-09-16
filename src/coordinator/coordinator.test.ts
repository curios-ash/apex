import { describe, expect, it } from "vitest";

import { collectAllowedValues, findUngroundedTokens } from "@/lib/llm/groundedness";

import { buildTemplateDraft, actionTitle } from "./draft";
import type { DraftContext } from "./types";
import { buildMailtoHref } from "./mailto";
import { deriveObligations } from "./obligations";
import { daysBetweenIso, reminderBucket, remindersDue } from "./reminders";

const EXCEPTION = {
  id: "11111111-2222-3333-4444-555555555555",
  shortId: "11111111",
  ruleId: "fee_drift_v1",
  severity: "warning",
  month: "2026-03-01",
  dollarImpactCents: 5_800,
  summary: "Management fee $290.00 vs $232.00 expected (8.00% of $2,900.00 collected income)",
  recommendedAction:
    "Ask Sunset Property Management to reconcile the management fee against the agreement " +
    "(8.00% of collected income) and request a credit of $58.00.",
};

const EMAIL_CTX: DraftContext = {
  kind: "email_pm",
  propertyName: "421 Maple Street",
  pmCompanyName: "Sunset Property Management",
  exceptions: [EXCEPTION],
  obligation: null,
};

const REMINDER_CTX: DraftContext = {
  kind: "reminder",
  propertyName: "421 Maple Street",
  pmCompanyName: null,
  exceptions: [],
  obligation: {
    id: "aaaaaaaa-0000-0000-0000-000000000000",
    obligationType: "lease_renewal",
    propertyName: "421 Maple Street",
    dueDate: "2026-10-06",
    daysUntil: 20,
    thresholdDays: 30,
    noticeDays: 60,
    notes: "Lease for Jordan Reyes (421 Maple Street Unit A) ends 2026-10-06.",
  },
};

function grounded(ctx: DraftContext): string[] {
  const draft = buildTemplateDraft(ctx);
  return findUngroundedTokens(
    `${draft.subject ?? ""}\n${draft.body}`,
    collectAllowedValues(ctx),
  );
}

describe("buildTemplateDraft", () => {
  it("is deterministic", () => {
    expect(buildTemplateDraft(EMAIL_CTX)).toEqual(buildTemplateDraft(EMAIL_CTX));
    expect(buildTemplateDraft(REMINDER_CTX)).toEqual(buildTemplateDraft(REMINDER_CTX));
  });

  it("email_pm: cites the exception short id and quotes engine text verbatim", () => {
    const draft = buildTemplateDraft(EMAIL_CTX);
    expect(draft.subject).toContain("421 Maple Street");
    expect(draft.subject).toContain("[ref 11111111]");
    expect(draft.subject).toContain("management fee reconciliation");
    expect(draft.body).toContain("[11111111] Management fee $290.00 vs $232.00 expected");
    expect(draft.body).toContain(EXCEPTION.recommendedAction!);
    expect(draft.body).toContain("Hello Sunset Property Management team,");
    expect(draft.body).toContain("Apex never sends email on its own.");
    expect(draft.to).toBeNull();
  });

  it("email_pm template is grounded by construction", () => {
    expect(grounded(EMAIL_CTX)).toEqual([]);
  });

  it("request_quote: asks for an itemized root-cause quote", () => {
    const ctx: DraftContext = {
      ...EMAIL_CTX,
      kind: "request_quote",
      exceptions: [
        {
          ...EXCEPTION,
          ruleId: "repeat_repair_v1",
          dollarImpactCents: 100_000,
          summary: "6 repair charges in 90 days totaling $1,000.00",
        },
      ],
    };
    const draft = buildTemplateDraft(ctx);
    expect(draft.subject).toContain("Quote request");
    expect(draft.body).toContain("itemized quote");
    expect(grounded(ctx)).toEqual([]);
  });

  it("reminder: owner-facing note with no mail fields", () => {
    const draft = buildTemplateDraft(REMINDER_CTX);
    expect(draft.to).toBeNull();
    expect(draft.subject).toBeNull();
    expect(draft.body).toContain("Due in 20 days (2026-10-06)");
    expect(draft.body).toContain("30-day reminder");
    expect(draft.body).toContain("Notice window: 60 days");
    expect(draft.body).toContain(REMINDER_CTX.obligation!.notes!);
  });

  it("reminder: overdue phrasing", () => {
    const ctx: DraftContext = {
      ...REMINDER_CTX,
      obligation: { ...REMINDER_CTX.obligation!, daysUntil: -3, thresholdDays: 7 },
    };
    expect(buildTemplateDraft(ctx).body).toContain("Overdue by 3 days (was due 2026-10-06)");
  });
});

describe("actionTitle", () => {
  it("email titles name the PM, topic, and impact", () => {
    expect(actionTitle("email_pm", EMAIL_CTX)).toBe(
      "Email Sunset Property Management — management fee reconciliation ($58.00)",
    );
  });

  it("reminder titles carry the countdown", () => {
    expect(actionTitle("reminder", REMINDER_CTX)).toBe(
      "Lease renewal due in 20 days — 421 Maple Street",
    );
  });
});

describe("groundedness check", () => {
  it("flags invented dollar amounts and percents in drafts", () => {
    const allowed = collectAllowedValues(EMAIL_CTX);
    expect(findUngroundedTokens("Please refund $9,999.00.", allowed)).toEqual(["$9,999.00"]);
    expect(findUngroundedTokens("That is 12% of rent.", allowed)).toEqual(["12%"]);
  });

  it("accepts figures quoted from the context", () => {
    const allowed = collectAllowedValues(EMAIL_CTX);
    const text = "Fee was $290.00 against $232.00 expected — 8.00% of $2,900.00. Credit $58.00.";
    expect(findUngroundedTokens(text, allowed)).toEqual([]);
  });
});

describe("deriveObligations", () => {
  it("derives lease, policy, and PM agreement obligations", () => {
    const specs = deriveObligations({
      leases: [
        {
          id: "lease-1",
          tenantName: "Jordan Reyes",
          endDate: "2026-10-06",
          status: "active",
          propertyId: "prop-1",
          propertyName: "421 Maple Street",
          unitLabel: "Unit A",
        },
        {
          id: "lease-2",
          tenantName: "Former Tenant",
          endDate: "2026-01-01",
          status: "expired",
          propertyId: "prop-1",
          propertyName: "421 Maple Street",
          unitLabel: "Unit B",
        },
      ],
      policies: [
        {
          id: "policy-1",
          carrier: "Lone Star Mutual",
          policyType: "landlord_dwelling",
          renewalDate: "2026-10-31",
          propertyId: "prop-1",
          propertyName: "421 Maple Street",
        },
      ],
      pmAgreements: [
        {
          id: "pm-1",
          pmCompanyName: "Sunset Property Management",
          endDate: "2026-11-30",
          propertyId: "prop-1",
          propertyName: "421 Maple Street",
        },
      ],
    });

    expect(specs).toHaveLength(3);
    const lease = specs.find((s) => s.obligationType === "lease_renewal")!;
    expect(lease).toMatchObject({
      relatedId: "lease-1",
      propertyId: "prop-1",
      dueDate: "2026-10-06",
      noticeDays: 60,
    });
    expect(lease.notes).toContain("Jordan Reyes");
    expect(lease.notes).toContain("Unit A");

    const policy = specs.find((s) => s.obligationType === "insurance_renewal")!;
    expect(policy).toMatchObject({ dueDate: "2026-10-31", noticeDays: 30 });
    expect(policy.notes).toContain("Lone Star Mutual");

    const pm = specs.find((s) => s.obligationType === "pm_agreement_renewal")!;
    expect(pm).toMatchObject({ dueDate: "2026-11-30", noticeDays: 60 });
    expect(pm.notes).toContain("Sunset Property Management");
  });
});

describe("reminder scheduling", () => {
  it("daysBetweenIso is day-granularity and sign-correct", () => {
    expect(daysBetweenIso("2026-09-16", "2026-10-06")).toBe(20);
    expect(daysBetweenIso("2026-10-06", "2026-09-16")).toBe(-20);
    expect(daysBetweenIso("2026-09-16", "2026-09-16")).toBe(0);
    // Month and year boundaries.
    expect(daysBetweenIso("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("reminderBucket: 30/14/7 windows, overdue counts as 7", () => {
    expect(reminderBucket(31)).toBeNull();
    expect(reminderBucket(30)).toBe(30);
    expect(reminderBucket(20)).toBe(30);
    expect(reminderBucket(14)).toBe(14);
    expect(reminderBucket(8)).toBe(14);
    expect(reminderBucket(7)).toBe(7);
    expect(reminderBucket(0)).toBe(7);
    expect(reminderBucket(-5)).toBe(7);
  });

  it("remindersDue: one reminder per obligation per run, idempotent", () => {
    const pending = [
      { id: "a", dueDate: "2026-10-06" }, // 20 days out -> 30-day bucket
      { id: "b", dueDate: "2026-09-23" }, // 7 days out -> 7-day bucket
      { id: "c", dueDate: "2026-12-01" }, // 76 days out -> not due
    ];
    const today = "2026-09-16";

    const first = remindersDue(pending, [], today);
    expect(first).toEqual([
      { obligationId: "a", thresholdDays: 30 },
      { obligationId: "b", thresholdDays: 7 },
    ]);

    // Re-running with those drafts recorded produces nothing new.
    const second = remindersDue(pending, first, today);
    expect(second).toEqual([]);

    // When "a" reaches the 14-day window, the next reminder fires.
    const later = remindersDue(
      pending,
      first,
      "2026-09-25", // a is 11 days out
    );
    expect(later).toEqual([{ obligationId: "a", thresholdDays: 14 }]);
  });

  it("remindersDue: a late-appearing obligation gets exactly one reminder", () => {
    const pending = [{ id: "a", dueDate: "2026-09-20" }]; // 4 days out
    const due = remindersDue(pending, [], "2026-09-16");
    expect(due).toEqual([{ obligationId: "a", thresholdDays: 7 }]);
  });
});

describe("buildMailtoHref", () => {
  it("builds an encoded mailto link carrying the cited ids", () => {
    const draft = buildTemplateDraft(EMAIL_CTX);
    const href = buildMailtoHref(draft)!;
    expect(href.startsWith("mailto:?subject=")).toBe(true);
    expect(href).toContain(encodeURIComponent("[ref 11111111]"));
    expect(href).toContain(encodeURIComponent("[11111111] Management fee $290.00"));
    // Newlines are percent-encoded, not form-encoded.
    expect(href).toContain("%0A");
    expect(href).not.toContain("+");
  });

  it("includes the recipient when present", () => {
    const href = buildMailtoHref({ to: "pm@example.com", subject: "Hi", body: "Body" })!;
    expect(href.startsWith("mailto:pm@example.com?subject=Hi")).toBe(true);
  });

  it("returns null for owner-facing reminders", () => {
    expect(buildMailtoHref(buildTemplateDraft(REMINDER_CTX))).toBeNull();
  });
});
