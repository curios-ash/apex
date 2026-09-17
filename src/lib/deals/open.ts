import { and, desc, eq, sql } from "drizzle-orm";

import { inboundTagFromId, normalizeAddressKey } from "@/deals/address";
import type { PlaceSuggestion } from "@/deals/geocode";
import { formatAddress } from "@/deals/address";
import { db } from "@/lib/db";
import { dossiers, properties } from "@/lib/db/schema";

import { recordDealEvent } from "./events";

export type OpenedDeal = {
  propertyId: string;
  created: boolean;
};

function propertyMatchesSuggestion(
  property: { addressLine1: string; city: string; state: string; zip: string; placeId: string | null },
  suggestion: PlaceSuggestion,
): boolean {
  if (suggestion.placeId && property.placeId && property.placeId === suggestion.placeId) {
    return true;
  }
  const left = normalizeAddressKey(
    `${property.addressLine1} ${property.city} ${property.state} ${property.zip}`,
  );
  const right = normalizeAddressKey(formatAddress(suggestion.address));
  return left === right;
}

export async function openDealFromPlace(params: {
  workspaceId: string;
  userId: string | null;
  suggestion: PlaceSuggestion;
}): Promise<OpenedDeal> {
  const { workspaceId, userId, suggestion } = params;
  const existing = await db
    .select()
    .from(properties)
    .where(eq(properties.workspaceId, workspaceId));
  const match = existing.find((row) => propertyMatchesSuggestion(row, suggestion));
  if (match) {
    return { propertyId: match.id, created: false };
  }

  const id = crypto.randomUUID();
  const [row] = await db
    .insert(properties)
    .values({
      id,
      workspaceId,
      name: suggestion.address.line1,
      addressLine1: suggestion.address.line1,
      addressLine2: suggestion.address.line2,
      city: suggestion.address.city,
      state: suggestion.address.state,
      zip: suggestion.address.zip,
      propertyType: "sfr",
      status: "prospecting",
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      placeId: suggestion.geocoder === "manual" ? null : suggestion.placeId,
      geocoder: suggestion.geocoder,
      inboundTag: inboundTagFromId(id),
    })
    .returning({ id: properties.id });

  await recordDealEvent({
    workspaceId,
    propertyId: row.id,
    kind: "deal_opened",
    title: "Deal opened from search",
    summary: formatAddress(suggestion.address),
    refType: "property",
    refId: row.id,
    metadata: { geocoder: suggestion.geocoder, placeId: suggestion.placeId },
    actorUserId: userId,
  });

  return { propertyId: row.id, created: true };
}

export async function latestDossierId(workspaceId: string, propertyId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: dossiers.id })
    .from(dossiers)
    .where(and(eq(dossiers.workspaceId, workspaceId), eq(dossiers.propertyId, propertyId)))
    .orderBy(desc(dossiers.updatedAt))
    .limit(1);
  return row?.id ?? null;
}

export async function getDeal(workspaceId: string, propertyId: string) {
  const [row] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function listDeals(workspaceId: string) {
  const rows = await db
    .select()
    .from(properties)
    .where(eq(properties.workspaceId, workspaceId))
    .orderBy(sql`${properties.updatedAt} desc`);
  return rows;
}
