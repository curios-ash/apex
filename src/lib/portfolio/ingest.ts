import { formatAddress, inboundTagFromId, normalizeAddressKey } from "@/deals/address";
import { attachPublicGeo, lookupPlaces, resolvePlace, type PlaceSuggestion } from "@/deals/geocode";
import { lookupCensusGeo } from "@/geo/census";
import { parseBulkProperties, type BulkPropertyRow } from "@/geo/csv";
import { mergePublicGeo } from "@/geo/public-geo";
import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { properties, units } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const MAX_BULK_ROWS = 200;

export type IngestResult = {
  created: number;
  skipped: number;
  unitsCreated: number;
  errors: string[];
};

function matchesSuggestion(
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

async function suggestionForRow(row: BulkPropertyRow): Promise<PlaceSuggestion> {
  const query = formatAddress(row.address);
  const { suggestions } = await lookupPlaces(query);
  const matched = suggestions.find((s) => s.matched) ?? suggestions[0];
  let suggestion = matched
    ? attachPublicGeo(matched)
    : resolvePlace("", query);

  const census = await lookupCensusGeo(suggestion.address);
  if (census) {
    const merged = mergePublicGeo(suggestion.address, {
      ...census,
      county: census.county ?? suggestion.county,
      neighborhood: census.neighborhood ?? suggestion.neighborhood,
      latitude: census.latitude ?? suggestion.latitude,
      longitude: census.longitude ?? suggestion.longitude,
      source: "census",
    });
    suggestion = {
      ...suggestion,
      county: merged.county,
      neighborhood: merged.neighborhood,
      latitude: merged.latitude,
      longitude: merged.longitude,
      geoSource: merged.source,
    };
  }

  if (row.name) {
    suggestion = { ...suggestion, label: row.name };
  }
  return suggestion;
}

async function insertOwnedProperty(params: {
  workspaceId: string;
  suggestion: PlaceSuggestion;
  unitCount: number | null;
  purchasePriceCents: number | null;
  propertyType: BulkPropertyRow["propertyType"];
}): Promise<{ propertyId: string; unitsCreated: number }> {
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(properties)
    .values({
      id,
      workspaceId: params.workspaceId,
      name: params.suggestion.address.line1,
      addressLine1: params.suggestion.address.line1,
      addressLine2: params.suggestion.address.line2,
      city: params.suggestion.address.city,
      state: params.suggestion.address.state,
      zip: params.suggestion.address.zip,
      propertyType: params.propertyType ?? "sfr",
      status: "active",
      purchasePriceCents: params.purchasePriceCents,
      latitude: params.suggestion.latitude,
      longitude: params.suggestion.longitude,
      placeId: params.suggestion.geocoder === "manual" ? null : params.suggestion.placeId,
      geocoder: params.suggestion.geocoder,
      county: params.suggestion.county,
      neighborhood: params.suggestion.neighborhood,
      geoSource: params.suggestion.geoSource,
      inboundTag: inboundTagFromId(id),
    })
    .returning({ id: properties.id });

  const doors = params.unitCount ?? 1;
  let unitsCreated = 0;
  for (let i = 0; i < doors; i += 1) {
    const label = doors === 1 ? "Unit 1" : `Unit ${i + 1}`;
    await db.insert(units).values({
      workspaceId: params.workspaceId,
      propertyId: row.id,
      label,
      status: "vacant",
    });
    unitsCreated += 1;
  }
  return { propertyId: row.id, unitsCreated };
}

export async function ingestBulkProperties(params: {
  workspaceId: string;
  userId: string | null;
  text: string;
}): Promise<IngestResult> {
  const rows = parseBulkProperties(params.text).slice(0, MAX_BULK_ROWS);
  const result: IngestResult = { created: 0, skipped: 0, unitsCreated: 0, errors: [] };
  if (rows.length === 0) {
    result.errors.push("No addresses found. Paste one per line or a CSV with an address column.");
    return result;
  }

  const existing = await db.select().from(properties).where(eq(properties.workspaceId, params.workspaceId));
  const seen = new Set<string>();

  for (const row of rows) {
    try {
      const suggestion = await suggestionForRow(row);
      const key = normalizeAddressKey(formatAddress(suggestion.address));
      if (seen.has(key) || existing.some((p) => matchesSuggestion(p, suggestion))) {
        result.skipped += 1;
        seen.add(key);
        continue;
      }
      seen.add(key);
      const inserted = await insertOwnedProperty({
        workspaceId: params.workspaceId,
        suggestion,
        unitCount: row.unitCount,
        purchasePriceCents: row.purchasePriceCents,
        propertyType: row.propertyType,
      });
      result.created += 1;
      result.unitsCreated += inserted.unitsCreated;
      existing.push({
        addressLine1: suggestion.address.line1,
        city: suggestion.address.city,
        state: suggestion.address.state,
        zip: suggestion.address.zip,
        placeId: suggestion.geocoder === "manual" ? null : suggestion.placeId,
      } as (typeof existing)[number]);
    } catch (error) {
      result.errors.push(
        `Could not add ${row.raw.slice(0, 80)}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  await writeAuditLog({
    workspaceId: params.workspaceId,
    actorUserId: params.userId,
    actorType: "user",
    action: "portfolio.bulk_ingest",
    targetType: "property",
    metadata: {
      created: result.created,
      skipped: result.skipped,
      unitsCreated: result.unitsCreated,
      errorCount: result.errors.length,
    },
  });

  return result;
}
