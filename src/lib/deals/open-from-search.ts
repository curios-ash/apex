import { revalidatePath } from "next/cache";

import { lookupPlaces, resolvePlace } from "@/deals/geocode";
import { getActiveWorkspace } from "@/lib/workspace";

import { openDealFromPlace } from "./open";

export type OpenDealSearchResult =
  | { ok: true; propertyId: string }
  | { ok: false; error: "empty-search" | "open-failed" };

export async function openDealFromSearchForm(formData: FormData): Promise<OpenDealSearchResult> {
  const placeId = String(formData.get("placeId") ?? "").trim();
  const query = String(formData.get("query") ?? "").trim();
  if (!query && !placeId) {
    return { ok: false, error: "empty-search" };
  }

  let suggestion = placeId ? resolvePlace(placeId, query || placeId) : null;
  if (!suggestion && query) {
    const { suggestions } = await lookupPlaces(query);
    suggestion = suggestions.find((s) => s.matched) ?? suggestions[0] ?? resolvePlace("", query);
  }
  if (!suggestion) {
    return { ok: false, error: "empty-search" };
  }

  try {
    const workspace = await getActiveWorkspace();
    const { propertyId } = await openDealFromPlace({
      workspaceId: workspace.id,
      userId: workspace.ownerUserId,
      suggestion,
    });
    revalidatePath("/deals");
    revalidatePath(`/deals/${propertyId}`);
    return { ok: true, propertyId };
  } catch (error) {
    console.error("open deal from search failed", error);
    return { ok: false, error: "open-failed" };
  }
}
