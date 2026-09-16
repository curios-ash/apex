import { formatCents } from "@/lib/format";
import {
  DUPLICATE_WINDOW_DAYS,
  FEE_DRIFT_MIN_CENTS,
  FEE_DRIFT_MIN_RELATIVE,
  WORK_ORDER_AGING_DAYS,
  daysBetween,
  normalizeDescription,
  workOrderRef,
} from "@/reconcile";

import type { AuditFlag, AuditLine } from "./types";

// The audit rule set for the free PM Statement Audit. Same thresholds as the
// reconciliation engine's rules (imported, not copied) so a finding here
// means the same thing it means inside the product. Each rule is a pure
// function over one statement's lines.

function severityForImpact(cents: number): AuditFlag["severity"] {
  if (cents >= 50_000) return "critical";
  if (cents >= 2_500) return "warning";
  return "info";
}

function lineRef(l: AuditLine) {
  return { date: l.date, description: l.description, amountCents: l.amountCents };
}

const OWNER_DRAW_PATTERN =
  /owner (draw|disbursement|distribution)|distribution to owner/i;

// fee_drift — management fees charged vs. the agreement percentage the owner
// entered. Basis is all collected income (rent + late/application/other).
export function feeDrift(lines: AuditLine[], feeBps: number): AuditFlag[] {
  const incomeCents = lines
    .filter((l) => l.amountCents > 0)
    .reduce((sum, l) => sum + l.amountCents, 0);
  const feeLines = lines.filter((l) => l.amountCents < 0 && l.category === "mgmt_fee");
  const actualFeeCents = feeLines.reduce((sum, l) => sum + Math.abs(l.amountCents), 0);
  if (incomeCents <= 0 || actualFeeCents <= 0) return [];

  const expectedFeeCents = Math.round((incomeCents * feeBps) / 10_000);
  const driftCents = actualFeeCents - expectedFeeCents;
  const tolerance = Math.max(FEE_DRIFT_MIN_CENTS, Math.round(expectedFeeCents * FEE_DRIFT_MIN_RELATIVE));
  if (driftCents <= tolerance) return [];

  const feePct = (feeBps / 100).toFixed(2);
  return [
    {
      ruleId: "fee_drift",
      severity: severityForImpact(driftCents),
      dollarImpactCents: driftCents,
      summary: `Management fee overcharge — ${formatCents(driftCents)}`,
      detail:
        `Charged ${formatCents(actualFeeCents)} against ${formatCents(expectedFeeCents)} expected ` +
        `(${feePct}% of ${formatCents(incomeCents)} collected income). Ask your PM to reconcile ` +
        `the fee against your management agreement and credit the difference.`,
      lines: feeLines.map(lineRef),
    },
  ];
}

// duplicate_charge — same normalized description and amount twice within a
// few days. The later charge is the suspected duplicate.
export function duplicateCharges(lines: AuditLine[]): AuditFlag[] {
  const expenses = lines.filter((l) => l.amountCents < 0);
  const flags: AuditFlag[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i];
      const b = expenses[j];
      if (a.amountCents !== b.amountCents) continue;
      if (normalizeDescription(a.description) !== normalizeDescription(b.description)) continue;
      if (a.date && b.date && Math.abs(daysBetween(a.date, b.date)) > DUPLICATE_WINDOW_DAYS) {
        continue;
      }
      const key = `${normalizeDescription(a.description)}|${a.amountCents}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const impactCents = Math.abs(b.amountCents);
      flags.push({
        ruleId: "duplicate_charge",
        severity: severityForImpact(impactCents),
        dollarImpactCents: impactCents,
        summary: `Possible duplicate charge — ${formatCents(impactCents)}`,
        detail:
          `"${b.description}" appears twice${a.date && b.date ? ` (${a.date} and ${b.date})` : ""} ` +
          `for the same amount. Ask the PM whether it was billed twice and request a refund of the duplicate.`,
        lines: [lineRef(a), lineRef(b)],
      });
    }
  }
  return flags;
}

// unexplained_fee — money out that doesn't match any known category and
// isn't an owner draw. These are the "what is this charge?" lines.
export function unexplainedFees(lines: AuditLine[]): AuditFlag[] {
  const flags: AuditFlag[] = [];
  for (const l of lines) {
    if (l.amountCents >= 0) continue;
    if (OWNER_DRAW_PATTERN.test(l.description)) continue;
    if (l.category !== null && l.category !== "other_expense") continue;
    const impactCents = Math.abs(l.amountCents);
    flags.push({
      ruleId: "unexplained_fee",
      severity: severityForImpact(impactCents),
      dollarImpactCents: impactCents,
      summary: `Unexplained charge: "${l.description}" — ${formatCents(impactCents)}`,
      detail:
        `"${l.description}" doesn't match rent, fees, repairs, utilities, taxes, insurance, or ` +
        `any other standard category. Ask the PM what it is and what agreement clause covers it.`,
      lines: [lineRef(l)],
    });
  }
  return flags;
}

// work_order_aging — the same work-order reference billed across more than
// 30 days. Either the job is still open or it is being re-billed.
export function workOrderAging(lines: AuditLine[]): AuditFlag[] {
  const byRef = new Map<string, AuditLine[]>();
  for (const l of lines) {
    if (l.amountCents >= 0) continue;
    if (l.category !== "repair" && l.category !== "maintenance") continue;
    if (!l.date) continue;
    const ref = workOrderRef(l.description);
    if (!ref) continue;
    byRef.set(ref, [...(byRef.get(ref) ?? []), l]);
  }

  const flags: AuditFlag[] = [];
  for (const [ref, refLines] of byRef) {
    const sorted = [...refLines].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const ageDays = daysBetween(first.date!, last.date!);
    if (ageDays <= WORK_ORDER_AGING_DAYS) continue;

    const rebilledCents = sorted.slice(1).reduce((sum, l) => sum + Math.abs(l.amountCents), 0);
    const displayRef = `WO-${ref.toUpperCase()}`;
    flags.push({
      ruleId: "work_order_aging",
      severity: "warning",
      dollarImpactCents: rebilledCents,
      summary: `Work order ${displayRef} open ${ageDays} days — ${formatCents(rebilledCents)} re-billed`,
      detail:
        `${displayRef} was first billed on ${first.date} and again on ${last.date}. ` +
        `Ask the PM for the work-order status and confirm the later charges are not re-billing.`,
      lines: sorted.map(lineRef),
    });
  }
  return flags;
}
