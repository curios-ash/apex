import { generateText } from "ai";

import { formatCents } from "@/lib/format";

import { resolveModelFor } from "./ai-sdk";
import type { LlmCallMeta } from "./types";

// The monthly Owner Review narrative. The LLM explains engine outputs — it
// never computes numbers. Its input is a fixed figures payload built from
// reconciliation results; its output is checked against that payload, and
// any ungrounded dollar/percent figure falls back to the deterministic
// template. The mock provider IS the template, so local runs and CI need no
// credentials.

export const REVIEW_PROMPT_VERSION = "review-narrative-v1";
export const DEFAULT_NARRATIVE_MODEL = "anthropic/claude-fable-5-1";

export interface ReviewExceptionFigure {
  id: string;
  // First 8 chars of the id — the citation handle the narrative uses.
  shortId: string;
  ruleId: string;
  severity: string;
  status: string;
  dollarImpactCents: number;
  summary: string;
}

export interface ReviewVarianceFigure {
  category: string;
  budgetCents: number;
  actualCents: number;
  varianceCents: number;
  variancePct: number | null;
}

export interface ReviewFigures {
  propertyName: string;
  // yyyy-mm-01
  month: string;
  monthLabel: string;
  incomeBudgetCents: number;
  incomeActualCents: number;
  incomeVarianceCents: number;
  expenseBudgetCents: number;
  expenseActualCents: number;
  expenseVarianceCents: number;
  netCashFlowCents: number;
  variances: ReviewVarianceFigure[];
  exceptions: ReviewExceptionFigure[];
  openExceptionCount: number;
  // All-time confirmed impact-ledger total for the property.
  confirmedImpactToDateCents: number;
}

export interface NarrativeLlm {
  generateReview(figures: ReviewFigures): Promise<{ text: string; meta: LlmCallMeta }>;
}

// ---------------------------------------------------------------------------
// Groundedness: every $ amount or percent in the narrative must trace to the
// figures payload. Allowed values are the payload's *Cents fields plus any
// $/percent tokens already inside its strings (engine summaries are grounded
// by construction, so quoting them is safe).
// ---------------------------------------------------------------------------

const MONEY_TOKEN = /-?\$[\d,]+(?:\.\d{1,2})?/g;
const PERCENT_TOKEN = /(\d+(?:\.\d+)?)%/g;

function parseMoneyToken(token: string): number {
  const negative = token.startsWith("-");
  const s = token.replace(/^-?\$/, "").replace(/,/g, "");
  const [dollars, frac = ""] = s.split(".");
  const cents = Number(dollars) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

function collectAllowed(figures: ReviewFigures): { cents: Set<number>; percents: Set<number> } {
  const cents = new Set<number>([0]);
  const percents = new Set<number>();

  function walk(value: unknown, key?: string): void {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (key?.endsWith("Cents")) cents.add(value);
      if (key === "variancePct" && value !== null) percents.add(Math.round(Math.abs(value) * 100));
      return;
    }
    if (typeof value === "string") {
      for (const m of value.matchAll(MONEY_TOKEN)) cents.add(parseMoneyToken(m[0]));
      for (const m of value.matchAll(PERCENT_TOKEN)) percents.add(Number(m[1]));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v));
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  }
  walk(figures);
  return { cents, percents };
}

// Returns the offending tokens; empty means the narrative is grounded.
export function findUngroundedNumbers(text: string, figures: ReviewFigures): string[] {
  const allowed = collectAllowed(figures);
  const offenders: string[] = [];
  for (const m of text.matchAll(MONEY_TOKEN)) {
    if (!allowed.cents.has(parseMoneyToken(m[0]))) offenders.push(m[0]);
  }
  for (const m of text.matchAll(PERCENT_TOKEN)) {
    if (!allowed.percents.has(Number(m[1]))) offenders.push(m[0]);
  }
  return [...new Set(offenders)];
}

// ---------------------------------------------------------------------------
// Deterministic template (the mock provider's output, and the fallback when
// a real model emits an ungrounded number).
// ---------------------------------------------------------------------------

export function buildTemplateNarrative(figures: ReviewFigures): string {
  const paragraphs: string[] = [];

  const incomeDirection =
    figures.incomeVarianceCents === 0
      ? "on plan"
      : figures.incomeVarianceCents > 0
        ? `${formatCents(figures.incomeVarianceCents)} ahead of plan`
        : `${formatCents(Math.abs(figures.incomeVarianceCents))} behind plan`;
  paragraphs.push(
    `${figures.monthLabel} review for ${figures.propertyName}. Collected ` +
      `${formatCents(figures.incomeActualCents)} against a plan of ` +
      `${formatCents(figures.incomeBudgetCents)} (${incomeDirection}). Operating expenses were ` +
      `${formatCents(figures.expenseActualCents)} against ${formatCents(figures.expenseBudgetCents)} ` +
      `budgeted. Net cash flow for the month: ${formatCents(figures.netCashFlowCents)}.`,
  );

  const open = figures.exceptions.filter((e) => e.status === "open");
  if (open.length === 0) {
    paragraphs.push("No open exceptions this month — the statement reconciled cleanly.");
  } else {
    const items = open
      .map(
        (e) =>
          `[${e.shortId}] ${e.summary}. Impact ${formatCents(e.dollarImpactCents)} ` +
          `(${e.severity}).`,
      )
      .join(" ");
    paragraphs.push(
      `${open.length} exception${open.length === 1 ? "" : "s"} need${open.length === 1 ? "s" : ""} attention: ${items}`,
    );
  }

  paragraphs.push(
    `Confirmed impact to date on this property: ${formatCents(figures.confirmedImpactToDateCents)}.`,
  );

  return paragraphs.join("\n\n");
}

function mockNarrativeLlm(): NarrativeLlm {
  return {
    async generateReview(figures) {
      const startedAt = Date.now();
      return {
        text: buildTemplateNarrative(figures),
        meta: {
          provider: "mock",
          model: "mock-deterministic-v1",
          promptVersion: REVIEW_PROMPT_VERSION,
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - startedAt,
        },
      };
    },
  };
}

function aiSdkNarrativeLlm(resolved: {
  provider: "gateway" | "anthropic";
  modelId: string;
  model: Parameters<typeof generateText>[0]["model"];
}): NarrativeLlm {
  return {
    async generateReview(figures) {
      const startedAt = Date.now();
      const result = await generateText({
        model: resolved.model,
        system: [
          "You write the monthly owner review for a rental-property audit tool.",
          "Every dollar amount and percentage you write MUST appear in the FIGURES JSON below.",
          "Do not compute, derive, round, or estimate any number. Do not add dates beyond the month label given.",
          `Cite exceptions by their bracketed short id, e.g. [${figures.exceptions[0]?.shortId ?? "abcdef12"}].`,
          "Three short paragraphs: cash performance vs plan, exceptions needing attention, and confirmed impact to date.",
        ].join(" "),
        prompt: `FIGURES JSON:\n${JSON.stringify(figures, null, 2)}`,
      });
      return {
        text: result.text,
        meta: {
          provider: resolved.provider,
          model: resolved.modelId,
          promptVersion: REVIEW_PROMPT_VERSION,
          inputTokens: (result.usage as { inputTokens?: number })?.inputTokens ?? null,
          outputTokens: (result.usage as { outputTokens?: number })?.outputTokens ?? null,
          latencyMs: Date.now() - startedAt,
        },
      };
    },
  };
}

let cached: NarrativeLlm | null = null;

export function getNarrativeLlm(): NarrativeLlm {
  if (cached) return cached;
  const resolved = resolveModelFor("APEX_NARRATIVE_MODEL", DEFAULT_NARRATIVE_MODEL);
  cached = resolved ? aiSdkNarrativeLlm(resolved) : mockNarrativeLlm();
  return cached;
}

// Test hook, mirrors resetDocumentLlm.
export function resetNarrativeLlm(): void {
  cached = null;
}
