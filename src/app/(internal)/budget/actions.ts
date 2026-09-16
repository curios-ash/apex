"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { budgetLines, properties } from "@/lib/db/schema";
import { transactionCategories } from "@/lib/llm/schemas";
import { runReconciliation } from "@/lib/reconcile/run";
import { getActiveWorkspace } from "@/lib/workspace";

export type BudgetState = { ok: boolean; message: string } | null;

// Manual budget entry (R0; the setup wizard is R1). One row per category for
// a property-month; amounts are dollars in the form, integer cents in the
// DB. Empty inputs delete an existing line.
export async function saveBudgetLines(
  _prev: BudgetState,
  formData: FormData,
): Promise<BudgetState> {
  const propertyId = String(formData.get("propertyId") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!propertyId || !/^\d{4}-\d{2}-01$/.test(month)) {
    return { ok: false, message: "Missing property or month." };
  }

  const workspace = await getActiveWorkspace();
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, workspace.id)))
    .limit(1);
  if (!property) return { ok: false, message: "Property not found in this workspace." };

  let upserted = 0;
  let deleted = 0;
  for (const category of transactionCategories) {
    const raw = String(formData.get(`amount:${category}`) ?? "").trim();
    const existing = await db
      .select({ id: budgetLines.id })
      .from(budgetLines)
      .where(
        and(
          eq(budgetLines.workspaceId, workspace.id),
          eq(budgetLines.propertyId, propertyId),
          eq(budgetLines.category, category),
          eq(budgetLines.month, month),
        ),
      )
      .limit(1);

    if (raw === "") {
      if (existing.length > 0) {
        await db.delete(budgetLines).where(eq(budgetLines.id, existing[0].id));
        deleted += 1;
      }
      continue;
    }

    const dollars = Number(raw.replace(/[$,]/g, ""));
    if (!Number.isFinite(dollars) || dollars < 0) {
      return { ok: false, message: `"${category}" must be a non-negative dollar amount.` };
    }
    const amountCents = Math.round(dollars * 100);

    await db
      .insert(budgetLines)
      .values({ workspaceId: workspace.id, propertyId, category, month, amountCents })
      .onConflictDoUpdate({
        target: [
          budgetLines.workspaceId,
          budgetLines.propertyId,
          budgetLines.category,
          budgetLines.month,
        ],
        set: { amountCents },
      });
    upserted += 1;
  }

  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: "budget.saved",
    targetType: "property",
    targetId: propertyId,
    metadata: { month, upserted, deleted },
  });

  // Budget changes can create or clear vacancy/fee findings.
  await runReconciliation(workspace.id, { month, propertyId }).catch((error) =>
    console.error("reconciliation after budget save failed", error),
  );
  revalidatePath("/budget");
  revalidatePath("/exceptions");
  revalidatePath("/review");
  return { ok: true, message: `Saved ${upserted} budget line${upserted === 1 ? "" : "s"}${deleted ? `, cleared ${deleted}` : ""} for ${month.slice(0, 7)}.` };
}
