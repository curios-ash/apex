import { formatCents } from "@/lib/format";

import { daysBetween, monthEnd, monthOf, type RuleException, type TransactionCategory } from "./types";
import type {
  EngineBudgetLine,
  EnginePmAgreement,
  EngineTransaction,
  RuleEvidence,
} from "./types";

// The Part 3 rule set. Every rule is a pure function over the property's
// working-set transactions + budget + PM agreement, and emits zero or more
// exceptions shaped {severity, dollar_impact, evidence[], recommended_action}.
// Thresholds are constants (exported for tests) — tuning them changes
// findings, so bump the rule id suffix when semantics change.

export interface RuleContext {
  propertyId: string;
  propertyName: string;
  month: string;
  // Source-selected transactions, all months (trailing windows look back).
  working: EngineTransaction[];
  budgetLines: EngineBudgetLine[];
  pmAgreement: EnginePmAgreement | null;
}

function severityForImpact(cents: number): RuleException["severity"] {
  if (cents >= 50_000) return "critical";
  if (cents >= 2_500) return "warning";
  return "info";
}

function txEvidence(t: EngineTransaction, note?: string): RuleEvidence {
  return {
    transactionId: t.id,
    ...(t.documentId ? { documentId: t.documentId } : {}),
    ...(note ? { note } : {}),
  };
}

function inMonth(t: EngineTransaction, month: string): boolean {
  return monthOf(t.transactionDate) === month;
}

function expensesOf(
  txs: EngineTransaction[],
  categories: readonly TransactionCategory[],
): EngineTransaction[] {
  return txs.filter((t) => t.amountCents < 0 && categories.includes(t.category));
}

// ---------------------------------------------------------------------------
// fee_drift_v1 — management fee charged vs. the PM agreement percentage.
// Basis is all collected income (rent + late/application/other income); some
// agreements fee on rent only — if so, late-fee-heavy months may over-flag.
// ---------------------------------------------------------------------------

export const FEE_DRIFT_MIN_CENTS = 100;
export const FEE_DRIFT_MIN_RELATIVE = 0.01;

export function feeDriftRule(ctx: RuleContext): RuleException[] {
  const agreement = ctx.pmAgreement;
  if (!agreement) return [];

  const monthTxs = ctx.working.filter((t) => inMonth(t, ctx.month));
  const incomeCents = monthTxs
    .filter((t) => t.amountCents > 0)
    .reduce((sum, t) => sum + t.amountCents, 0);
  const feeTxs = expensesOf(monthTxs, ["mgmt_fee"]);
  const actualFeeCents = feeTxs.reduce((sum, t) => sum + Math.abs(t.amountCents), 0);
  if (incomeCents <= 0 || actualFeeCents <= 0) return [];

  const expectedFeeCents = Math.round((incomeCents * agreement.feeBps) / 10_000);
  const driftCents = actualFeeCents - expectedFeeCents;
  const tolerance = Math.max(FEE_DRIFT_MIN_CENTS, Math.round(expectedFeeCents * FEE_DRIFT_MIN_RELATIVE));
  if (driftCents <= tolerance) return [];

  const feePct = (agreement.feeBps / 100).toFixed(2);
  return [
    {
      ruleId: "fee_drift_v1",
      propertyId: ctx.propertyId,
      month: ctx.month,
      severity: severityForImpact(driftCents),
      dollarImpactCents: driftCents,
      summary:
        `Management fee ${formatCents(actualFeeCents)} vs ${formatCents(expectedFeeCents)} expected ` +
        `(${feePct}% of ${formatCents(incomeCents)} collected income)`,
      evidence: [
        ...feeTxs.map((t) => txEvidence(t)),
        {
          note:
            `Agreement with ${agreement.pmCompanyName}: ${feePct}% of collected income. ` +
            `Charged ${formatCents(actualFeeCents)}; expected ${formatCents(expectedFeeCents)}; ` +
            `drift ${formatCents(driftCents)}.`,
        },
      ],
      recommendedAction:
        `Ask ${agreement.pmCompanyName} to reconcile the management fee against the agreement ` +
        `(${feePct}% of collected income) and request a credit of ${formatCents(driftCents)}.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// duplicate_charge_v1 — same normalized description + same amount, twice
// within a few days. The later charge is the suspected duplicate.
// ---------------------------------------------------------------------------

export const DUPLICATE_WINDOW_DAYS = 7;

export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function duplicateChargeRule(ctx: RuleContext): RuleException[] {
  const monthExpenses = ctx.working.filter((t) => t.amountCents < 0 && inMonth(t, ctx.month));
  const exceptions: RuleException[] = [];
  const seenPairs = new Set<string>();

  for (let i = 0; i < monthExpenses.length; i++) {
    for (let j = i + 1; j < monthExpenses.length; j++) {
      const a = monthExpenses[i];
      const b = monthExpenses[j];
      if (a.amountCents !== b.amountCents) continue;
      if (normalizeDescription(a.description) !== normalizeDescription(b.description)) continue;
      if (Math.abs(daysBetween(a.transactionDate, b.transactionDate)) > DUPLICATE_WINDOW_DAYS) {
        continue;
      }
      const pairKey = [a.id, b.id].sort().join("|");
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const impactCents = Math.abs(b.amountCents);
      exceptions.push({
        ruleId: "duplicate_charge_v1",
        propertyId: ctx.propertyId,
        month: ctx.month,
        severity: severityForImpact(impactCents),
        dollarImpactCents: impactCents,
        summary:
          `Possible duplicate charge: "${b.description}" ${formatCents(impactCents)} on ` +
          `${a.transactionDate} and ${b.transactionDate}`,
        evidence: [
          txEvidence(a, "first charge"),
          txEvidence(b, "suspected duplicate"),
        ],
        recommendedAction:
          `Ask the PM whether "${b.description}" (${formatCents(impactCents)}) was billed twice ` +
          `and request a refund of the duplicate.`,
      });
    }
  }
  return exceptions;
}

// ---------------------------------------------------------------------------
// repeat_repair_v1 — a repair category that keeps recurring in the trailing
// 90 days. Chronic repeat spend usually means a root-cause fix is cheaper.
// ---------------------------------------------------------------------------

export const REPEAT_REPAIR_WINDOW_DAYS = 90;
export const REPEAT_REPAIR_MIN_COUNT = 3;
const REPAIR_CATEGORIES: readonly TransactionCategory[] = ["repair", "maintenance"];

export function repeatRepairRule(ctx: RuleContext): RuleException[] {
  const windowStart = monthEnd(ctx.month);
  const exceptions: RuleException[] = [];

  for (const category of REPAIR_CATEGORIES) {
    const inWindow = expensesOf(ctx.working, [category])
      .filter(
        (t) =>
          t.transactionDate <= windowStart &&
          daysBetween(t.transactionDate, windowStart) <= REPEAT_REPAIR_WINDOW_DAYS,
      )
      .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
    if (inWindow.length < REPEAT_REPAIR_MIN_COUNT) continue;

    const totalCents = inWindow.reduce((sum, t) => sum + Math.abs(t.amountCents), 0);
    exceptions.push({
      ruleId: "repeat_repair_v1",
      propertyId: ctx.propertyId,
      month: ctx.month,
      severity: totalCents >= 100_000 ? "critical" : "warning",
      dollarImpactCents: totalCents,
      summary:
        `${inWindow.length} ${category.replace("_", " ")} charges in ${REPEAT_REPAIR_WINDOW_DAYS} days ` +
        `totaling ${formatCents(totalCents)}`,
      evidence: [
        ...inWindow.map((t) => txEvidence(t)),
        {
          note:
            `${inWindow.length} ${category} transactions between ${inWindow[0].transactionDate} ` +
            `and ${windowStart}.`,
        },
      ],
      recommendedAction:
        `Ask the PM for the work-order history behind these ${category} charges and whether a ` +
        `single root-cause repair replaces repeated service calls.`,
    });
  }
  return exceptions;
}

// ---------------------------------------------------------------------------
// insurance_tax_jump_v1 — insurance or property-tax spend jumps vs. the
// property's own baseline (average of prior months that had the charge).
// ---------------------------------------------------------------------------

export const JUMP_BASELINE_MONTHS = 6;
export const JUMP_MIN_CENTS = 2_500;
export const JUMP_MIN_RELATIVE = 0.2;
const JUMP_CATEGORIES: readonly TransactionCategory[] = ["insurance", "property_tax"];

export function insuranceTaxJumpRule(ctx: RuleContext): RuleException[] {
  const exceptions: RuleException[] = [];

  for (const category of JUMP_CATEGORIES) {
    const current = expensesOf(ctx.working, [category]).filter((t) => inMonth(t, ctx.month));
    const currentCents = current.reduce((sum, t) => sum + Math.abs(t.amountCents), 0);
    if (currentCents <= 0) continue;

    const priorByMonth = new Map<string, number>();
    for (const t of expensesOf(ctx.working, [category])) {
      const m = monthOf(t.transactionDate);
      if (m >= ctx.month) continue;
      priorByMonth.set(m, (priorByMonth.get(m) ?? 0) + Math.abs(t.amountCents));
    }
    const baselineMonths = [...priorByMonth.keys()].sort().slice(-JUMP_BASELINE_MONTHS);
    if (baselineMonths.length === 0) continue;
    const baselineCents = Math.round(
      baselineMonths.reduce((sum, m) => sum + (priorByMonth.get(m) ?? 0), 0) / baselineMonths.length,
    );
    if (baselineCents <= 0) continue;

    const jumpCents = currentCents - baselineCents;
    const tolerance = Math.max(JUMP_MIN_CENTS, Math.round(baselineCents * JUMP_MIN_RELATIVE));
    if (jumpCents <= tolerance) continue;

    const label = category === "insurance" ? "Insurance" : "Property tax";
    const jumpPct = jumpCents / baselineCents;
    exceptions.push({
      ruleId: "insurance_tax_jump_v1",
      propertyId: ctx.propertyId,
      month: ctx.month,
      severity: jumpPct >= 0.5 ? "critical" : "warning",
      dollarImpactCents: jumpCents,
      summary:
        `${label} jumped to ${formatCents(currentCents)} vs ${formatCents(baselineCents)} baseline ` +
        `(+${Math.round(jumpPct * 100)}%)`,
      evidence: [
        ...current.map((t) => txEvidence(t)),
        {
          note:
            `Baseline is the average of ${baselineMonths.length} prior month(s) with ${category} ` +
            `charges (${baselineMonths.join(", ")}).`,
        },
      ],
      recommendedAction:
        `Ask the PM or carrier why ${category.replace("_", " ")} rose ${formatCents(jumpCents)} ` +
        `over the ${formatCents(baselineCents)} baseline; request the renewal or assessment notice.`,
    });
  }
  return exceptions;
}

// ---------------------------------------------------------------------------
// vacancy_vs_plan_v1 — collected rent vs. the budgeted rent for the month.
// ---------------------------------------------------------------------------

export const VACANCY_TOLERANCE = 0.05;

export function vacancyVsPlanRule(ctx: RuleContext): RuleException[] {
  const rentBudgetCents = ctx.budgetLines
    .filter((b) => b.month === ctx.month && b.category === "rent")
    .reduce((sum, b) => sum + b.amountCents, 0);
  if (rentBudgetCents <= 0) return [];

  const rentTxs = ctx.working.filter(
    (t) => t.category === "rent" && t.amountCents > 0 && inMonth(t, ctx.month),
  );
  const rentActualCents = rentTxs.reduce((sum, t) => sum + t.amountCents, 0);
  const shortfallCents = rentBudgetCents - rentActualCents;
  if (shortfallCents <= Math.round(rentBudgetCents * VACANCY_TOLERANCE)) return [];

  const shortfallPct = shortfallCents / rentBudgetCents;
  return [
    {
      ruleId: "vacancy_vs_plan_v1",
      propertyId: ctx.propertyId,
      month: ctx.month,
      severity: shortfallPct >= 0.5 ? "critical" : "warning",
      dollarImpactCents: shortfallCents,
      summary:
        `Collected rent ${formatCents(rentActualCents)} vs ${formatCents(rentBudgetCents)} planned ` +
        `(${formatCents(shortfallCents)} short, ${Math.round(shortfallPct * 100)}%)`,
      evidence: [
        ...rentTxs.map((t) => txEvidence(t)),
        { note: `Budgeted rent ${formatCents(rentBudgetCents)}; collected ${formatCents(rentActualCents)}.` },
      ],
      recommendedAction:
        `Confirm which units were vacant or delinquent and ask the PM for the leasing plan and ` +
        `expected make-ready date.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// work_order_aging_v1 — the same work-order reference billed across more
// than 30 days. Either the job is still open or it is being re-billed.
// ---------------------------------------------------------------------------

export const WORK_ORDER_AGING_DAYS = 30;
const WORK_ORDER_REF = /(?:work\s*order|wo)[\s:#-]*(?:no\.?|number[\s:#-]*)?([a-z0-9-]*\d[a-z0-9-]*)/i;

export function workOrderRef(description: string): string | null {
  const m = WORK_ORDER_REF.exec(description);
  return m ? m[1].toLowerCase() : null;
}

export function workOrderAgingRule(ctx: RuleContext): RuleException[] {
  const byRef = new Map<string, EngineTransaction[]>();
  for (const t of expensesOf(ctx.working, REPAIR_CATEGORIES)) {
    if (monthOf(t.transactionDate) > ctx.month) continue;
    const ref = workOrderRef(t.description);
    if (!ref) continue;
    byRef.set(ref, [...(byRef.get(ref) ?? []), t]);
  }

  const exceptions: RuleException[] = [];
  for (const [ref, txs] of byRef) {
    const sorted = [...txs].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const ageDays = daysBetween(first.transactionDate, last.transactionDate);
    if (ageDays <= WORK_ORDER_AGING_DAYS) continue;

    const rebilledCents = sorted
      .slice(1)
      .reduce((sum, t) => sum + Math.abs(t.amountCents), 0);
    const displayRef = `WO-${ref.toUpperCase()}`;
    exceptions.push({
      ruleId: "work_order_aging_v1",
      propertyId: ctx.propertyId,
      month: monthOf(last.transactionDate),
      severity: "warning",
      dollarImpactCents: rebilledCents,
      summary:
        `Work order ${displayRef} open ${ageDays} days ` +
        `(${first.transactionDate} → ${last.transactionDate}), ${formatCents(rebilledCents)} billed after the first charge`,
      evidence: sorted.map((t) => txEvidence(t)),
      recommendedAction:
        `Ask the PM for the status of work order ${displayRef} — open ${ageDays} days — ` +
        `and confirm the later ${formatCents(rebilledCents)} in charges are not re-billing.`,
    });
  }
  return exceptions;
}

export const RULES = [
  feeDriftRule,
  duplicateChargeRule,
  repeatRepairRule,
  insuranceTaxJumpRule,
  vacancyVsPlanRule,
  workOrderAgingRule,
] as const;
