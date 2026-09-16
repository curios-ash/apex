import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { properties, transactions, workspaces } from "@/lib/db/schema";
import { runReconciliation } from "@/lib/reconcile/run";
import { generateMonthlyReview } from "@/lib/review/generate";

export const dynamic = "force-dynamic";

// Vercel cron (see vercel.json): on the 1st of each month, reconcile the
// month that just ended and generate the Owner Review for every property
// with activity, in every workspace. R0 runs this in one request; durable
// execution (Vercel Workflow) replaces the loop in R1.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
  }

  // Previous calendar month in UTC.
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const month = prev.toISOString().slice(0, 10);

  const results: Record<string, unknown>[] = [];
  const workspaceRows = await db.select().from(workspaces);
  for (const workspace of workspaceRows) {
    const summary = await runReconciliation(workspace.id, { month });

    const activeProperties = await db
      .selectDistinct({ propertyId: transactions.propertyId })
      .from(transactions)
      .where(eq(transactions.workspaceId, workspace.id));
    const propertyRows = await db
      .select()
      .from(properties)
      .where(eq(properties.workspaceId, workspace.id));
    const known = new Set(propertyRows.map((p) => p.id));

    const generated: string[] = [];
    for (const row of activeProperties) {
      if (!row.propertyId || !known.has(row.propertyId)) continue;
      const review = await generateMonthlyReview(workspace.id, row.propertyId, month);
      if (review) generated.push(row.propertyId);
    }
    results.push({ workspace: workspace.slug, reconcile: summary, reviewsGenerated: generated });
  }

  return NextResponse.json({ ok: true, month, results });
}
