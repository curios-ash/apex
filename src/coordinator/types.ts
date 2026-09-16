// The Coordinator workflow (master plan Part 2): drafts PM follow-up emails,
// quote requests, and renewal reminders into the approval queue. Everything
// here is pure TypeScript — the DB binding lives in src/lib/actions/ and the
// LLM wrapper in src/lib/llm/drafter.ts. Drafts cite engine findings; they
// never introduce numbers of their own.

export type CoordinatorDraftKind = "email_pm" | "request_quote" | "reminder";

export interface DraftExceptionFigure {
  id: string;
  // First 8 chars of the id — the citation handle drafts use, same
  // convention as the Owner Review narrative.
  shortId: string;
  ruleId: string;
  severity: string;
  // yyyy-mm-01, null for rules that span periods.
  month: string | null;
  dollarImpactCents: number;
  summary: string;
  recommendedAction: string | null;
}

export interface DraftObligationFigure {
  id: string;
  obligationType: string;
  propertyName: string | null;
  // yyyy-mm-dd
  dueDate: string;
  // Engine-computed: days from today to dueDate; negative = overdue.
  daysUntil: number;
  // Which reminder this draft is (30, 14, or 7 days out).
  thresholdDays: number;
  noticeDays: number;
  notes: string | null;
}

export interface DraftContext {
  kind: CoordinatorDraftKind;
  propertyName: string | null;
  pmCompanyName: string | null;
  exceptions: DraftExceptionFigure[];
  obligation: DraftObligationFigure | null;
}

export interface CoordinatorDraft {
  // No PM/vendor emails are on file in R0 — null until the owner fills it in.
  to: string | null;
  // Null for owner-facing reminders (nothing to mail).
  subject: string | null;
  body: string;
}

// Shape stored in actions.draft_payload.
export interface ActionDraftPayload {
  to: string | null;
  subject: string | null;
  body: string;
  citedExceptionIds: string[];
  // Reminder drafts only:
  obligationId?: string;
  thresholdDays?: number;
  dueDate?: string;
  // Provenance, e.g. "mock-deterministic-v1/coordinator-draft-v1".
  generator?: string;
  usedFallback?: boolean;
}
