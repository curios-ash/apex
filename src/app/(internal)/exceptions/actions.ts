"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { exceptions, impactLedgerEntries } from "@/lib/db/schema";
import { runReconciliation } from "@/lib/reconcile/run";
import { getActiveWorkspace } from "@/lib/workspace";

async function loadScopedException(exceptionId: string) {
  const workspace = await getActiveWorkspace();
  const rows = await db
    .select()
    .from(exceptions)
    .where(and(eq(exceptions.id, exceptionId), eq(exceptions.workspaceId, workspace.id)))
    .limit(1);
  return { workspace, exception: rows[0] ?? null };
}

// An exception's dollar impact reaches the impact ledger only here, on
// explicit owner confirmation — never at detection time.
const LEDGER_ENTRY_TYPE: Record<string, "fee_recovered" | "duplicate_charge_refunded" | "unexplained_fee_reversed" | "cost_avoided" | "rent_recovered" | "other"> = {
  fee_drift_v1: "fee_recovered",
  duplicate_charge_v1: "duplicate_charge_refunded",
  repeat_repair_v1: "cost_avoided",
  insurance_tax_jump_v1: "cost_avoided",
  vacancy_vs_plan_v1: "rent_recovered",
  work_order_aging_v1: "other",
};

export async function confirmException(formData: FormData) {
  const id = String(formData.get("exceptionId") ?? "");
  const { workspace, exception } = await loadScopedException(id);
  if (!exception || exception.status !== "open") return;

  const updated = await db
    .update(exceptions)
    .set({
      status: "confirmed",
      confirmedBy: workspace.ownerUserId,
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(exceptions.id, id), eq(exceptions.status, "open")))
    .returning({ id: exceptions.id });
  if (updated.length === 0) return;

  const [ledgerEntry] = await db
    .insert(impactLedgerEntries)
    .values({
      workspaceId: workspace.id,
      propertyId: exception.propertyId,
      exceptionId: exception.id,
      entryType: LEDGER_ENTRY_TYPE[exception.ruleId] ?? "other",
      amountCents: exception.dollarImpactCents,
      confirmed: true,
      description: exception.summary,
      occurredOn: exception.month ?? new Date().toISOString().slice(0, 10),
    })
    .returning({ id: impactLedgerEntries.id });

  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: "exception.confirmed",
    targetType: "exception",
    targetId: id,
    metadata: {
      ruleId: exception.ruleId,
      dollarImpactCents: exception.dollarImpactCents,
      ledgerEntryId: ledgerEntry?.id ?? null,
    },
  });
  revalidatePath("/exceptions");
  revalidatePath("/ledger");
}

export async function dismissException(formData: FormData) {
  const id = String(formData.get("exceptionId") ?? "");
  const { workspace, exception } = await loadScopedException(id);
  if (!exception || exception.status !== "open") return;

  await db
    .update(exceptions)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(and(eq(exceptions.id, id), eq(exceptions.status, "open")));
  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: "exception.dismissed",
    targetType: "exception",
    targetId: id,
    metadata: { ruleId: exception.ruleId, dollarImpactCents: exception.dollarImpactCents },
  });
  revalidatePath("/exceptions");
}

export async function runReconcileNow() {
  const workspace = await getActiveWorkspace();
  await runReconciliation(workspace.id);
  revalidatePath("/exceptions");
  revalidatePath("/review");
}
