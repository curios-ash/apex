import { NextResponse } from "next/server";

import { draftRenewalReminders } from "@/lib/actions/draft";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { syncObligations } from "@/lib/obligations/sync";

export const dynamic = "force-dynamic";

// Vercel cron (see vercel.json): daily. Re-derives renewal obligations from
// the property record, then drafts 30/14/7-day reminder actions into the
// approval queue for every workspace. Drafts are idempotent per
// (obligation, threshold) and never send anything — they wait for approval.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
  }

  const results: Record<string, unknown>[] = [];
  const workspaceRows = await db.select().from(workspaces);
  for (const workspace of workspaceRows) {
    const sync = await syncObligations(workspace.id);
    const reminders = await draftRenewalReminders(workspace.id, { trigger: "cron" });
    results.push({
      workspace: workspace.slug,
      obligationsSynced: sync,
      remindersDrafted: reminders.created,
      actionIds: reminders.actionIds,
    });
  }

  return NextResponse.json({ ok: true, results });
}
