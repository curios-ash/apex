import { and, desc, eq } from "drizzle-orm";

import {
  DEFAULT_DEAL1_GATES,
  type Deal1Gates,
  type Deal1Underwriting,
  type InputSource,
  type Sourced,
} from "@/deal1";
import type { Deal1SubscriptionStatus } from "@/deal1/paywall";
import { db } from "@/lib/db";
import { deal1Checks, deal1Gates, workspaces } from "@/lib/db/schema";

export type SavedCheck = {
  id: string;
  address: string;
  addressNorm: string;
  input: Deal1Underwriting;
  noiCents: number;
  dscr: number | null;
  cashFlowCents: number;
  annualDebtServiceCents: number;
  pricePass: boolean;
  dscrPass: boolean;
  linePass: boolean;
  passLineCents: number;
  dscrGate: number;
  decision: "keep" | "pass" | null;
  updatedAt: Date;
};

function sourced<T>(value: T, source: string): Sourced<T> {
  const label: InputSource = source === "entered" ? "entered" : "estimate";
  return { value, source: label };
}

function decisionOf(value: string | null): "keep" | "pass" | null {
  if (value === "keep" || value === "pass") return value;
  return null;
}

export async function loadDeal1Workspace(workspaceId: string): Promise<{
  gates: Deal1Gates;
  checks: SavedCheck[];
  deal1Status: Deal1SubscriptionStatus;
  stripeCustomerId: string | null;
}> {
  const [gateRow, checkRows, workspace] = await Promise.all([
    db.select().from(deal1Gates).where(eq(deal1Gates.workspaceId, workspaceId)).limit(1),
    db
      .select()
      .from(deal1Checks)
      .where(eq(deal1Checks.workspaceId, workspaceId))
      .orderBy(desc(deal1Checks.updatedAt)),
    db
      .select({
        deal1SubscriptionStatus: workspaces.deal1SubscriptionStatus,
        stripeCustomerId: workspaces.stripeCustomerId,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
  ]);

  const gates: Deal1Gates = gateRow[0]
    ? {
        place: gateRow[0].place,
        wideCeilingCents: gateRow[0].wideCeilingCents,
        passLineCents: gateRow[0].passLineCents,
        minUnits: gateRow[0].minUnits,
        maxUnits: gateRow[0].maxUnits,
        fullyLeasedRequired: gateRow[0].fullyLeasedRequired,
        noHeavyRehabRequired: gateRow[0].noHeavyRehabRequired,
        downPaymentRate: gateRow[0].downPaymentRate,
        annualRate: gateRow[0].annualRate,
        dscrGate: gateRow[0].dscrGate,
      }
    : DEFAULT_DEAL1_GATES;

  const checks: SavedCheck[] = checkRows.map((row) => ({
    id: row.id,
    address: row.address,
    addressNorm: row.addressNorm,
    input: {
      purchasePriceCents: sourced(row.purchasePriceCents, row.purchasePriceSource),
      monthlyRentCents: sourced(row.monthlyRentCents, row.monthlyRentSource),
      vacancyRate: sourced(row.vacancyRate, row.vacancySource),
      annualOperatingExpensesCents: sourced(row.annualOperatingExpensesCents, row.opexSource),
      annualRate: sourced(row.annualRate, row.annualRateSource),
      units: sourced(row.units, row.unitsSource),
      fullyLeased: sourced(row.fullyLeased, row.fullyLeasedSource),
      heavyRehab: sourced(row.heavyRehab, row.heavyRehabSource),
    },
    noiCents: row.noiCents,
    dscr: row.dscr,
    cashFlowCents: row.cashFlowCents,
    annualDebtServiceCents: row.annualDebtServiceCents,
    pricePass: row.pricePass,
    dscrPass: row.dscrPass,
    linePass: row.linePass,
    passLineCents: row.passLineCents,
    dscrGate: row.dscrGate,
    decision: decisionOf(row.decision),
    updatedAt: row.updatedAt,
  }));

  return {
    gates,
    checks,
    deal1Status: workspace[0]?.deal1SubscriptionStatus ?? "none",
    stripeCustomerId: workspace[0]?.stripeCustomerId ?? null,
  };
}

export async function saveDeal1Gates(workspaceId: string, gates: Deal1Gates): Promise<void> {
  await db
    .insert(deal1Gates)
    .values({
      workspaceId,
      place: gates.place,
      wideCeilingCents: gates.wideCeilingCents,
      passLineCents: gates.passLineCents,
      minUnits: gates.minUnits,
      maxUnits: gates.maxUnits,
      fullyLeasedRequired: gates.fullyLeasedRequired,
      noHeavyRehabRequired: gates.noHeavyRehabRequired,
      downPaymentRate: gates.downPaymentRate,
      annualRate: gates.annualRate,
      dscrGate: gates.dscrGate,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: deal1Gates.workspaceId,
      set: {
        place: gates.place,
        wideCeilingCents: gates.wideCeilingCents,
        passLineCents: gates.passLineCents,
        minUnits: gates.minUnits,
        maxUnits: gates.maxUnits,
        fullyLeasedRequired: gates.fullyLeasedRequired,
        noHeavyRehabRequired: gates.noHeavyRehabRequired,
        downPaymentRate: gates.downPaymentRate,
        annualRate: gates.annualRate,
        dscrGate: gates.dscrGate,
        updatedAt: new Date(),
      },
    });
}

export async function findCheckByAddress(workspaceId: string, addressNorm: string) {
  const [row] = await db
    .select({ id: deal1Checks.id })
    .from(deal1Checks)
    .where(and(eq(deal1Checks.workspaceId, workspaceId), eq(deal1Checks.addressNorm, addressNorm)))
    .limit(1);
  return row ?? null;
}

export async function countChecks(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ id: deal1Checks.id })
    .from(deal1Checks)
    .where(eq(deal1Checks.workspaceId, workspaceId));
  return rows.length;
}
