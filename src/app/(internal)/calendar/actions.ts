"use server";

import { revalidatePath } from "next/cache";

import { draftRenewalReminders } from "@/lib/actions/draft";
import { syncObligations } from "@/lib/obligations/sync";
import { getActiveWorkspace } from "@/lib/workspace";

// Manual stand-in for the daily cron (GET /api/cron/renewal-reminders):
// re-derives obligations from the property record, then drafts any due
// 30/14/7-day reminders into the approval queue.
export async function checkRenewalReminders() {
  const workspace = await getActiveWorkspace();
  await syncObligations(workspace.id);
  await draftRenewalReminders(workspace.id, { trigger: "manual" });
  revalidatePath("/calendar");
  revalidatePath("/actions");
  revalidatePath("/activity");
}
