"use server";

import { revalidatePath } from "next/cache";

import { generateMonthlyReview } from "@/lib/review/generate";
import { getActiveWorkspace } from "@/lib/workspace";

export type GenerateReviewState = { ok: boolean; message: string } | null;

export async function generateReviewAction(
  _prev: GenerateReviewState,
  formData: FormData,
): Promise<GenerateReviewState> {
  const propertyId = String(formData.get("propertyId") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!propertyId || !/^\d{4}-\d{2}-01$/.test(month)) {
    return { ok: false, message: "Missing property or month." };
  }

  const workspace = await getActiveWorkspace();
  const result = await generateMonthlyReview(workspace.id, propertyId, month, {
    userId: workspace.ownerUserId,
  });
  revalidatePath("/review");
  if (!result) {
    return { ok: false, message: "No budget or actual data for that month yet." };
  }
  return {
    ok: true,
    message: result.usedFallback
      ? "Review generated with the deterministic template (model output failed the groundedness check)."
      : "Review generated.",
  };
}
