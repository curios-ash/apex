import { and, eq, sql } from "drizzle-orm";

import { formatAddress } from "@/deals/address";
import { mergePublicGeo } from "@/geo/public-geo";
import type { GeoPropertyFact } from "@/geo/types";
import { db } from "@/lib/db";
import { impactLedgerEntries, properties, units } from "@/lib/db/schema";

export type PortfolioMapProperty = {
  id: string;
  name: string;
  address: string;
  status: string;
  city: string;
  state: string;
  county: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  geoSource: string | null;
  unitCount: number;
  purchasePriceCents: number | null;
  currentValueCents: number | null;
  impactCents: number;
};

export async function loadPortfolioMap(workspaceId: string): Promise<{
  properties: PortfolioMapProperty[];
  facts: GeoPropertyFact[];
}> {
  const [propertyRows, unitRows, impactRows] = await Promise.all([
    db.select().from(properties).where(eq(properties.workspaceId, workspaceId)),
    db
      .select({
        propertyId: units.propertyId,
        count: sql<number>`count(*)::int`,
      })
      .from(units)
      .where(eq(units.workspaceId, workspaceId))
      .groupBy(units.propertyId),
    db
      .select({
        propertyId: impactLedgerEntries.propertyId,
        total: sql<number>`coalesce(sum(${impactLedgerEntries.amountCents}), 0)::bigint`,
      })
      .from(impactLedgerEntries)
      .where(
        and(eq(impactLedgerEntries.workspaceId, workspaceId), eq(impactLedgerEntries.confirmed, true)),
      )
      .groupBy(impactLedgerEntries.propertyId),
  ]);

  const unitCountByProperty = new Map(unitRows.map((row) => [row.propertyId, Number(row.count)]));
  const impactByProperty = new Map(
    impactRows
      .filter((row) => row.propertyId)
      .map((row) => [row.propertyId as string, Number(row.total)]),
  );

  const mapped: PortfolioMapProperty[] = propertyRows.map((row) => {
    const geo = mergePublicGeo(
      {
        line1: row.addressLine1,
        line2: row.addressLine2,
        city: row.city,
        state: row.state,
        zip: row.zip,
      },
      {
        county: row.county,
        neighborhood: row.neighborhood,
        latitude: row.latitude,
        longitude: row.longitude,
        source: row.geoSource === "google" || row.geoSource === "census" ? row.geoSource : "mock-census-v1",
      },
    );
    return {
      id: row.id,
      name: row.name,
      address: formatAddress({
        line1: row.addressLine1,
        line2: row.addressLine2,
        city: row.city,
        state: row.state,
        zip: row.zip,
      }),
      status: row.status,
      city: geo.city,
      state: geo.state,
      county: geo.county,
      neighborhood: geo.neighborhood,
      latitude: geo.latitude,
      longitude: geo.longitude,
      geoSource: geo.source,
      unitCount: unitCountByProperty.get(row.id) ?? 0,
      purchasePriceCents: row.purchasePriceCents,
      currentValueCents: row.currentValueCents,
      impactCents: impactByProperty.get(row.id) ?? 0,
    };
  });

  const facts: GeoPropertyFact[] = mapped.map((row) => ({
    id: row.id,
    state: row.state,
    county: row.county,
    city: row.city,
    neighborhood: row.neighborhood,
    unitCount: row.unitCount,
    purchasePriceCents: row.purchasePriceCents,
    currentValueCents: row.currentValueCents,
    impactCents: row.impactCents,
  }));

  return { properties: mapped, facts };
}
