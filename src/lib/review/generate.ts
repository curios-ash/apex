import { and, eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  actualLines,
  budgetLines,
  exceptions,
  impactLedgerEntries,
  monthlyReviews,
  properties,
} from "@/lib/db/schema";
import {
  buildTemplateNarrative,
  findUngroundedNumbers,
  getNarrativeLlm,
  type ReviewFigures,
} from "@/lib/llm";
import { logLlmCall } from "@/lib/llm/log";
import { runReconciliation } from "@/lib/reconcile/run";
import { isIncomeCategory } from "@/reconcile";

// Builds the figures payload for one property-month entirely from engine
// outputs (actual_lines, exceptions) and the budget. This object is both the
// narrative LLM's only input and the groundedness reference for its output.
export async function buildReviewFigures(
  workspaceId: string,
  propertyId: string,
  month: string,
): Promise<ReviewFigures | null> {
  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, workspaceId)))
    .limit(1);
  if (!property) return null;

  const [budgetRows, actualRows, exceptionRows, ledgerRows] = await Promise.all([
    db
      .select()
      .from(budgetLines)
      .where(
        and(
          eq(budgetLines.workspaceId, workspaceId),
          eq(budgetLines.propertyId, propertyId),
          eq(budgetLines.month, month),
        ),
      ),
    db
      .select()
      .from(actualLines)
      .where(
        and(
          eq(actualLines.workspaceId, workspaceId),
          eq(actualLines.propertyId, propertyId),
          eq(actualLines.month, month),
        ),
      ),
    db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.workspaceId, workspaceId),
          eq(exceptions.propertyId, propertyId),
          eq(exceptions.month, month),
        ),
      ),
    db
      .select()
      .from(impactLedgerEntries)
      .where(
        and(
          eq(impactLedgerEntries.workspaceId, workspaceId),
          eq(impactLedgerEntries.propertyId, propertyId),
          eq(impactLedgerEntries.confirmed, true),
        ),
      ),
  ]);

  if (budgetRows.length === 0 && actualRows.length === 0) return null;

  const categories = [
    ...new Set([...budgetRows.map((b) => b.category), ...actualRows.map((a) => a.category)]),
  ].sort();

  let incomeBudget = 0;
  let incomeActual = 0;
  let expenseBudget = 0;
  let expenseActual = 0;
  const variances = categories.map((category) => {
    const budgetCents = budgetRows
      .filter((b) => b.category === category)
      .reduce((sum, b) => sum + b.amountCents, 0);
    const actualCents = actualRows
      .filter((a) => a.category === category)
      .reduce((sum, a) => sum + a.amountCents, 0);
    const income = isIncomeCategory(category);
    const varianceCents = income ? actualCents - budgetCents : Math.abs(actualCents) - budgetCents;
    if (income) {
      incomeBudget += budgetCents;
      incomeActual += actualCents;
    } else {
      expenseBudget += budgetCents;
      expenseActual += Math.abs(actualCents);
    }
    return {
      category,
      budgetCents,
      actualCents,
      varianceCents,
      variancePct: budgetCents === 0 ? null : varianceCents / budgetCents,
    };
  });

  const monthLabel = new Date(`${month}T00:00:00Z`).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    propertyName: property.name,
    month,
    monthLabel,
    incomeBudgetCents: incomeBudget,
    incomeActualCents: incomeActual,
    incomeVarianceCents: incomeActual - incomeBudget,
    expenseBudgetCents: expenseBudget,
    expenseActualCents: expenseActual,
    expenseVarianceCents: expenseActual - expenseBudget,
    netCashFlowCents: incomeActual - expenseActual,
    variances,
    exceptions: exceptionRows
      .map((e) => ({
        id: e.id,
        shortId: e.id.slice(0, 8),
        ruleId: e.ruleId,
        severity: e.severity,
        status: e.status,
        dollarImpactCents: e.dollarImpactCents,
        summary: e.summary,
      }))
      .sort((a, b) => b.dollarImpactCents - a.dollarImpactCents),
    openExceptionCount: exceptionRows.filter((e) => e.status === "open").length,
    confirmedImpactToDateCents: ledgerRows.reduce((sum, e) => sum + e.amountCents, 0),
  };
}

// Generates (or regenerates) the Owner Review for one property-month:
// refreshes reconciliation, builds figures, asks the narrative LLM, checks
// groundedness, and upserts monthly_reviews. Returns null when there is no
// data for the month.
export async function generateMonthlyReview(
  workspaceId: string,
  propertyId: string,
  month: string,
  opts: { userId?: string | null } = {},
): Promise<{ reviewId: string; usedFallback: boolean } | null> {
  await runReconciliation(workspaceId, { month, propertyId });
  const figures = await buildReviewFigures(workspaceId, propertyId, month);
  if (!figures) return null;

  const llm = getNarrativeLlm();
  const startedAt = Date.now();
  let text: string;
  let meta;
  try {
    const result = await llm.generateReview(figures);
    text = result.text;
    meta = result.meta;
  } catch (error) {
    await logLlmCall({
      workspaceId,
      purpose: "narrate",
      meta: {
        provider: "unknown",
        model: "unknown",
        promptVersion: "review-narrative-v1",
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - startedAt,
      },
      error: String(error),
    });
    throw error;
  }
  await logLlmCall({
    workspaceId,
    purpose: "narrate",
    meta,
    output: { text },
  });

  // The LLM never computes numbers: any dollar/percent figure it emitted
  // that is not in the figures payload swaps the whole narrative for the
  // deterministic template.
  const offenders = findUngroundedNumbers(text, figures);
  const usedFallback = offenders.length > 0;
  if (usedFallback) {
    console.warn("review narrative failed groundedness check", { propertyId, month, offenders });
    text = buildTemplateNarrative(figures);
  }

  const generator = `${meta.model}/${meta.promptVersion}`;
  const [review] = await db
    .insert(monthlyReviews)
    .values({
      workspaceId,
      propertyId,
      month,
      narrative: text,
      figures: figures as unknown as Record<string, unknown>,
      generator,
      usedFallback,
      generatedBy: opts.userId ?? null,
    })
    .onConflictDoUpdate({
      target: [monthlyReviews.workspaceId, monthlyReviews.propertyId, monthlyReviews.month],
      set: {
        narrative: text,
        figures: figures as unknown as Record<string, unknown>,
        generator,
        usedFallback,
        generatedBy: opts.userId ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: monthlyReviews.id });

  await writeAuditLog({
    workspaceId,
    actorUserId: opts.userId ?? null,
    actorType: opts.userId ? "user" : "system",
    action: "review.generated",
    targetType: "monthly_review",
    targetId: review.id,
    metadata: {
      propertyId,
      month,
      generator,
      usedFallback,
      openExceptions: figures.openExceptionCount,
    },
  });

  return { reviewId: review.id, usedFallback };
}
