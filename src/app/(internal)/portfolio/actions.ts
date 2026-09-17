"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { lookupPlaces, resolvePlace } from "@/deals/geocode";
import { ingestBulkProperties } from "@/lib/portfolio/ingest";
import { getActiveWorkspace } from "@/lib/workspace";

import { inboundTagFromId } from "@/deals/address";
import { db } from "@/lib/db";
import { properties, units } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function addOwnedFromSearch(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const placeId = String(formData.get("placeId") ?? "").trim();
  const query = String(formData.get("query") ?? "").trim();
  if (!query && !placeId) {
    redirect("/portfolio?error=empty-search");
  }

  let suggestion = placeId ? resolvePlace(placeId, query || placeId) : null;
  if (!suggestion && query) {
    const { suggestions } = await lookupPlaces(query);
    suggestion = suggestions.find((s) => s.matched) ?? suggestions[0] ?? resolvePlace("", query);
  }
  if (!suggestion) {
    redirect("/portfolio?error=empty-search");
  }

  const existing = await db.select().from(properties).where(eq(properties.workspaceId, workspace.id));
  const hit = existing.find((row) => {
    if (suggestion.placeId && row.placeId && row.placeId === suggestion.placeId) return true;
    return (
      row.addressLine1 === suggestion.address.line1 &&
      row.city === suggestion.address.city &&
      row.state === suggestion.address.state &&
      row.zip === suggestion.address.zip
    );
  });
  if (hit) {
    redirect("/portfolio?notice=already-on-map");
  }

  const id = crypto.randomUUID();
  await db.insert(properties).values({
    id,
    workspaceId: workspace.id,
    name: suggestion.address.line1,
    addressLine1: suggestion.address.line1,
    addressLine2: suggestion.address.line2,
    city: suggestion.address.city,
    state: suggestion.address.state,
    zip: suggestion.address.zip,
    propertyType: "sfr",
    status: "active",
    latitude: suggestion.latitude,
    longitude: suggestion.longitude,
    placeId: suggestion.geocoder === "manual" ? null : suggestion.placeId,
    geocoder: suggestion.geocoder,
    county: suggestion.county,
    neighborhood: suggestion.neighborhood,
    geoSource: suggestion.geoSource,
    inboundTag: inboundTagFromId(id),
  });
  await db.insert(units).values({
    workspaceId: workspace.id,
    propertyId: id,
    label: "Unit 1",
    status: "vacant",
  });

  revalidatePath("/portfolio");
  redirect("/portfolio?notice=added");
}

export async function bulkAddProperties(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const text = String(formData.get("bulk") ?? "");
  const result = await ingestBulkProperties({
    workspaceId: workspace.id,
    userId: workspace.ownerUserId,
    text,
  });
  const params = new URLSearchParams();
  if (result.errors.length && result.created === 0) {
    params.set("error", result.errors[0]);
  } else {
    params.set("notice", `added-${result.created}-skipped-${result.skipped}`);
    if (result.errors[0]) params.set("warn", result.errors[0]);
  }
  revalidatePath("/portfolio");
  redirect(`/portfolio?${params.toString()}`);
}
