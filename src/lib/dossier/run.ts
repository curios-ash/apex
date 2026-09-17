import { and, desc, eq, sql } from "drizzle-orm";

import {
  rentAssumptionFromComps,
  rentIsUnverified,
  shouldApplyRent,
  type ApplyCompsMode,
} from "@/comps";
import {
  ASSUMPTION_UNITS,
  buildDossierPayload,
  defaultDownsideParams,
  defaultValueFor,
  ENGINE_ASSUMPTION_KEYS,
  FINANCE_V1,
  type AssumptionConfidence,
  type AssumptionKey,
  type AssumptionValue,
  type DossierPayload,
} from "@/dossier";
import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { assumptions, dossiers } from "@/lib/db/schema";
import { fetchCompSet } from "@/lib/rentcast/client";

// DB binding for the underwriter: assumption rows (versioned, sourced,
// confidence-graded) in, dossier payload out. All math happens in
// src/dossier + src/finance — this module only maps and persists.

export interface ListingFieldExtraction {
  fields: Record<string, unknown>;
  fieldConfidence: Record<string, number>;
  documentId: string | null;
}

function confidenceLevel(c: number | undefined): AssumptionConfidence {
  if (c === undefined) return "low";
  if (c >= 0.9) return "high";
  if (c >= 0.7) return "medium";
  return "low";
}

const DEFAULT_SOURCE_LABELS: Partial<Record<AssumptionKey, string>> = {
  closing_costs: "default:3% of price",
  property_tax_annual: "default:1.1% of price",
  insurance_annual: "default:0.5% of price",
  maintenance_annual: "default:5% of scheduled rent",
  management_fee_annual: "default:8% of scheduled rent",
  loan_principal: "default:75% of price",
  loan_interest_rate: "default:6.5% fixed",
  loan_term_months: "default:360",
};

// Maps extracted listing fields onto assumption values. Anything the listing
// did not state stays null here and is filled with a default by the caller.
function assumptionsFromListing(
  extraction: ListingFieldExtraction,
): Map<AssumptionKey, AssumptionValue> {
  const { fields, fieldConfidence } = extraction;
  const map = new Map<AssumptionKey, AssumptionValue>();

  const putNum = (
    key: AssumptionKey,
    raw: unknown,
    confidenceField: string,
    transform: (n: number) => number = (n) => n,
  ) => {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return;
    map.set(key, {
      key,
      valueNum: transform(raw),
      valueText: null,
      unit: ASSUMPTION_UNITS[key],
      source: "listing",
      confidence: confidenceLevel(fieldConfidence[confidenceField]),
    });
  };

  if (typeof fields.address === "string" && fields.address.trim().length > 0) {
    map.set("address", {
      key: "address",
      valueNum: null,
      valueText: fields.address.trim(),
      unit: "text",
      source: "listing",
      confidence: confidenceLevel(fieldConfidence.address),
    });
  }
  putNum("purchase_price", fields.listPriceCents, "listPriceCents");
  putNum("monthly_rent", fields.rentCents, "rentCents");
  putNum("property_tax_annual", fields.propertyTaxAnnualCents, "propertyTaxAnnualCents");
  putNum("hoa_annual", fields.hoaMonthlyCents, "hoaMonthlyCents", (n) => n * 12);
  putNum("bedrooms", fields.bedrooms, "bedrooms");
  putNum("bathrooms", fields.bathrooms, "bathrooms");
  putNum("sqft", fields.sqft, "sqft");
  putNum("year_built", fields.yearBuilt, "yearBuilt");
  if (fields.tenantOccupied === true) {
    map.set("tenant_occupied", {
      key: "tenant_occupied",
      valueNum: 1,
      valueText: null,
      unit: "count",
      source: "listing",
      confidence: confidenceLevel(fieldConfidence.tenantOccupied),
    });
  }
  return map;
}

// Fills every engine key the extraction/manual input did not provide with
// the documented default (source "default", confidence "low").
function withDefaults(
  provided: Map<AssumptionKey, AssumptionValue>,
): Map<AssumptionKey, AssumptionValue> {
  const ctx = {
    purchasePriceCents: provided.get("purchase_price")?.valueNum ?? null,
    monthlyRentCents: provided.get("monthly_rent")?.valueNum ?? null,
  };
  const map = new Map(provided);
  for (const key of ENGINE_ASSUMPTION_KEYS) {
    if (map.has(key)) continue;
    map.set(key, {
      key,
      valueNum: defaultValueFor(key, ctx),
      valueText: null,
      unit: ASSUMPTION_UNITS[key],
      source: "default",
      confidence: "low",
    });
  }
  for (const downsideDefault of defaultDownsideParams()) {
    if (!map.has(downsideDefault.key)) map.set(downsideDefault.key, downsideDefault);
  }
  return map;
}

type AssumptionRow = typeof assumptions.$inferSelect;

function sourceFromDb(raw: string): AssumptionValue["source"] {
  if (raw.startsWith("listing")) return "listing";
  if (raw.startsWith("default")) return "default";
  if (raw.startsWith("comp")) return "comp";
  return "manual";
}

function rowToValue(row: AssumptionRow): AssumptionValue {
  return {
    key: row.key as AssumptionKey,
    valueNum: row.valueNum,
    valueText: row.valueText,
    unit: (row.unit ?? "text") as AssumptionValue["unit"],
    source: sourceFromDb(row.source),
    confidence: row.confidence,
    sourceRef: row.source,
  };
}

function dbSource(value: AssumptionValue, documentId: string | null): string {
  if (value.sourceRef) return value.sourceRef;
  if (value.source === "listing") {
    return documentId ? `listing:document:${documentId}` : "listing";
  }
  if (value.source === "default") {
    return DEFAULT_SOURCE_LABELS[value.key] ?? "default";
  }
  if (value.source === "comp") return "comp";
  return "manual";
}

async function insertAssumptionSet(
  workspaceId: string,
  dossierId: string,
  set: Map<AssumptionKey, AssumptionValue>,
  version: number,
  documentId: string | null,
): Promise<void> {
  const rows = [...set.values()].map((v) => ({
    workspaceId,
    dossierId,
    key: v.key,
    valueNum: v.valueNum,
    valueText: v.valueText,
    unit: v.unit,
    source: dbSource(v, documentId),
    confidence: v.confidence,
    version,
  }));
  if (rows.length > 0) await db.insert(assumptions).values(rows);
}

async function loadCurrentAssumptions(
  workspaceId: string,
  dossierId: string,
): Promise<{ version: number; set: Map<AssumptionKey, AssumptionValue> }> {
  const rows = await db
    .select()
    .from(assumptions)
    .where(and(eq(assumptions.workspaceId, workspaceId), eq(assumptions.dossierId, dossierId)))
    .orderBy(desc(assumptions.version));
  const version = rows[0]?.version ?? 0;
  const set = new Map<AssumptionKey, AssumptionValue>();
  for (const row of rows.filter((r) => r.version === version)) {
    set.set(row.key as AssumptionKey, rowToValue(row));
  }
  return { version, set };
}

async function recomputeAndStore(
  workspaceId: string,
  dossierId: string,
  set: Map<AssumptionKey, AssumptionValue>,
  version: number,
  extras?: { comps?: DossierPayload["comps"] },
): Promise<DossierPayload> {
  const payload = buildDossierPayload({
    assumptions: set,
    assumptionVersion: version,
    now: new Date(),
  });
  const [current] = await db
    .select({ payload: dossiers.payload })
    .from(dossiers)
    .where(and(eq(dossiers.id, dossierId), eq(dossiers.workspaceId, workspaceId)))
    .limit(1);
  const existing = (current?.payload ?? {}) as DossierPayload;
  const merged: DossierPayload = {
    ...payload,
    comps: extras?.comps !== undefined ? extras.comps : (existing.comps ?? null),
  };
  await db
    .update(dossiers)
    .set({ payload: merged as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(and(eq(dossiers.id, dossierId), eq(dossiers.workspaceId, workspaceId)));
  return merged;
}

// Creates a dossier from listing extraction fields (pasted text or uploaded
// PDF, already extracted by intake.ts) or from manual inputs. Every engine
// input lands in `assumptions` at version 1 with source + confidence.
export async function createDossier(params: {
  workspaceId: string;
  userId: string | null;
  title?: string | null;
  listingUrl?: string | null;
  sourceDocumentId?: string | null;
  propertyId?: string | null;
  provided: Map<AssumptionKey, AssumptionValue>;
}): Promise<{ dossierId: string }> {
  const { workspaceId, userId } = params;
  const set = withDefaults(params.provided);
  const address = set.get("address")?.valueText ?? null;
  const title = params.title?.trim() || address || "Untitled deal";

  const [dossier] = await db
    .insert(dossiers)
    .values({
      workspaceId,
      propertyId: params.propertyId ?? null,
      title,
      listingUrl: params.listingUrl?.trim() || null,
      sourceDocumentId: params.sourceDocumentId ?? null,
      financeVersion: FINANCE_V1,
      status: "draft",
    })
    .returning({ id: dossiers.id });

  await insertAssumptionSet(workspaceId, dossier.id, set, 1, params.sourceDocumentId ?? null);
  const payload = await recomputeAndStore(workspaceId, dossier.id, set, 1);

  await writeAuditLog({
    workspaceId,
    actorUserId: userId,
    actorType: userId ? "user" : "system",
    action: "dossier.created",
    targetType: "dossier",
    targetId: dossier.id,
    metadata: {
      title,
      propertyId: params.propertyId ?? null,
      sourceDocumentId: params.sourceDocumentId ?? null,
      listingUrl: params.listingUrl ?? null,
      computable: payload.computable,
      missingInputs: payload.missingInputs,
      assumptionCount: set.size,
    },
  });

  if (params.propertyId) {
    const { recordDealEvent } = await import("@/lib/deals/events");
    await recordDealEvent({
      workspaceId,
      propertyId: params.propertyId,
      kind: "dossier_version",
      title: "Dossier v1 computed",
      summary: payload.computable
        ? "Pro forma saved from the finance engine."
        : `Needs ${payload.missingInputs.join(", ") || "inputs"} before the engine can run.`,
      refType: "dossier",
      refId: dossier.id,
      metadata: { version: 1, computable: payload.computable },
      actorUserId: userId,
    });
  }

  return { dossierId: dossier.id };
}

export function providedFromListing(extraction: ListingFieldExtraction) {
  return assumptionsFromListing(extraction);
}

// Applies user edits as a new assumption version and recomputes the pro
// forma. Changed keys become source "manual" / confidence "high"; untouched
// keys carry their provenance forward.
export async function reviseDossier(params: {
  workspaceId: string;
  userId: string | null;
  dossierId: string;
  updates: Partial<Record<AssumptionKey, number | string | null>>;
}): Promise<{ version: number } | null> {
  const { workspaceId, userId, dossierId, updates } = params;
  const [dossier] = await db
    .select()
    .from(dossiers)
    .where(and(eq(dossiers.id, dossierId), eq(dossiers.workspaceId, workspaceId)))
    .limit(1);
  if (!dossier) return null;

  const { version, set } = await loadCurrentAssumptions(workspaceId, dossierId);
  const next = new Map(set);
  const changed: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(updates)) {
    const key = rawKey as AssumptionKey;
    if (!(key in ASSUMPTION_UNITS)) continue;
    const unit = ASSUMPTION_UNITS[key];
    const existing = next.get(key);

    let valueNum: number | null = null;
    let valueText: string | null = null;
    if (unit === "text") {
      valueText = typeof rawValue === "string" && rawValue.trim() ? rawValue.trim() : null;
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      valueNum = rawValue;
    }

    if (existing && existing.valueNum === valueNum && existing.valueText === valueText) continue;
    next.set(key, {
      key,
      valueNum,
      valueText,
      unit,
      source: "manual",
      confidence: "high",
    });
    changed.push(key);
  }

  if (changed.length === 0) return { version };

  const nextVersion = version + 1;
  await insertAssumptionSet(workspaceId, dossierId, next, nextVersion, null);
  const payload = await recomputeAndStore(workspaceId, dossierId, next, nextVersion);

  await writeAuditLog({
    workspaceId,
    actorUserId: userId,
    actorType: userId ? "user" : "system",
    action: "dossier.revised",
    targetType: "dossier",
    targetId: dossierId,
    metadata: { version: nextVersion, changedKeys: changed, computable: payload.computable },
  });

  if (dossier.propertyId) {
    const { recordDealEvent } = await import("@/lib/deals/events");
    await recordDealEvent({
      workspaceId,
      propertyId: dossier.propertyId,
      kind: "dossier_version",
      title: `Dossier v${nextVersion} computed`,
      summary: `Updated ${changed.join(", ")}. Outputs from ${FINANCE_V1}.`,
      refType: "dossier",
      refId: dossierId,
      metadata: { version: nextVersion, changedKeys: changed, computable: payload.computable },
      actorUserId: userId,
    });
  }

  return { version: nextVersion };
}

export async function shareDossier(params: {
  workspaceId: string;
  userId: string | null;
  dossierId: string;
}): Promise<{ token: string } | null> {
  const { workspaceId, userId, dossierId } = params;
  const [existing] = await db
    .select()
    .from(dossiers)
    .where(and(eq(dossiers.id, dossierId), eq(dossiers.workspaceId, workspaceId)))
    .limit(1);
  if (!existing) return null;
  if (existing.shareToken) return { token: existing.shareToken };

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await db
    .update(dossiers)
    .set({ shareToken: token, sharedAt: new Date(), updatedAt: new Date() })
    .where(eq(dossiers.id, dossierId));
  await writeAuditLog({
    workspaceId,
    actorUserId: userId,
    actorType: "user",
    action: "dossier.shared",
    targetType: "dossier",
    targetId: dossierId,
  });
  if (existing.propertyId) {
    const { recordDealEvent } = await import("@/lib/deals/events");
    await recordDealEvent({
      workspaceId,
      propertyId: existing.propertyId,
      kind: "share",
      title: "Read-only share link created",
      summary: "Anyone with the link can see this deal’s engine outputs — not your workspace.",
      refType: "dossier",
      refId: dossierId,
      actorUserId: userId,
    });
  }
  return { token };
}

export async function unshareDossier(params: {
  workspaceId: string;
  userId: string | null;
  dossierId: string;
}): Promise<void> {
  const { workspaceId, userId, dossierId } = params;
  await db
    .update(dossiers)
    .set({ shareToken: null, sharedAt: null, updatedAt: new Date() })
    .where(and(eq(dossiers.id, dossierId), eq(dossiers.workspaceId, workspaceId)));
  await writeAuditLog({
    workspaceId,
    actorUserId: userId,
    actorType: "user",
    action: "dossier.unshared",
    targetType: "dossier",
    targetId: dossierId,
  });
}

export interface LoadedDossier {
  dossier: typeof dossiers.$inferSelect;
  payload: DossierPayload;
  assumptionVersion: number;
  assumptions: AssumptionValue[];
}

function toLoaded(
  dossier: typeof dossiers.$inferSelect,
  version: number,
  set: Map<AssumptionKey, AssumptionValue>,
): LoadedDossier {
  return {
    dossier,
    payload: dossier.payload as unknown as DossierPayload,
    assumptionVersion: version,
    assumptions: [...set.values()],
  };
}

export async function loadDossier(
  workspaceId: string,
  dossierId: string,
): Promise<LoadedDossier | null> {
  const [dossier] = await db
    .select()
    .from(dossiers)
    .where(and(eq(dossiers.id, dossierId), eq(dossiers.workspaceId, workspaceId)))
    .limit(1);
  if (!dossier) return null;
  const { version, set } = await loadCurrentAssumptions(workspaceId, dossierId);
  return toLoaded(dossier, version, set);
}

// Public share-link read: token-gated, no workspace scoping by design — the
// token IS the authorization. Returns only the dossier's own deal data.
export async function loadSharedDossier(token: string): Promise<LoadedDossier | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await db
    .select()
    .from(dossiers)
    .where(sql`${dossiers.shareToken} = ${token}`)
    .limit(1);
  const dossier = rows[0];
  if (!dossier) return null;
  const { version, set } = await loadCurrentAssumptions(dossier.workspaceId, dossier.id);
  return toLoaded(dossier, version, set);
}

function queryFromAssumptions(
  set: Map<AssumptionKey, AssumptionValue>,
  fallbackAddress: string | null,
): { address: string; bedrooms: number | null; bathrooms: number | null; sqft: number | null } | null {
  const address = set.get("address")?.valueText?.trim() || fallbackAddress?.trim() || null;
  if (!address) return null;
  return {
    address,
    bedrooms: set.get("bedrooms")?.valueNum ?? null,
    bathrooms: set.get("bathrooms")?.valueNum ?? null,
    sqft: set.get("sqft")?.valueNum ?? null,
  };
}

// Pulls RentCast (or mock) comps and optionally writes median rent as a
// sourced assumption. The finance engine is recomputed from assumptions —
// comps never become an engine input on their own.
export async function applyCompsToDossier(params: {
  workspaceId: string;
  userId: string | null;
  dossierId: string;
  mode: ApplyCompsMode;
}): Promise<{ ok: true; version: number; appliedRent: boolean } | { ok: false; message: string }> {
  const { workspaceId, userId, dossierId, mode } = params;
  const [dossier] = await db
    .select()
    .from(dossiers)
    .where(and(eq(dossiers.id, dossierId), eq(dossiers.workspaceId, workspaceId)))
    .limit(1);
  if (!dossier) return { ok: false, message: "Dossier not found." };

  const { version, set } = await loadCurrentAssumptions(workspaceId, dossierId);
  const queryFields = queryFromAssumptions(set, dossier.title);
  if (!queryFields) {
    return { ok: false, message: "Add an address before pulling comps." };
  }

  let comps;
  try {
    comps = await fetchCompSet({
      query: { ...queryFields, radiusMiles: 2 },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "RentCast request failed.";
    return { ok: false, message };
  }

  const unverified = rentIsUnverified(set);
  const applyRent = shouldApplyRent(mode, unverified);
  const rent = applyRent ? rentAssumptionFromComps(comps) : null;
  const next = new Map(set);
  let nextVersion = version;
  if (rent) {
    next.set("monthly_rent", rent);
    nextVersion = version + 1;
    await insertAssumptionSet(workspaceId, dossierId, next, nextVersion, null);
  }

  const payload = await recomputeAndStore(workspaceId, dossierId, next, nextVersion, { comps });

  await writeAuditLog({
    workspaceId,
    actorUserId: userId,
    actorType: userId ? "user" : "system",
    action: rent ? "dossier.comps_applied" : "dossier.comps_fetched",
    targetType: "dossier",
    targetId: dossierId,
    metadata: {
      provider: comps.provider,
      usedMock: comps.usedMock,
      listingCount: comps.summary.listingCount,
      medianRentCents: comps.summary.medianRentCents,
      appliedRent: Boolean(rent),
      version: nextVersion,
      computable: payload.computable,
    },
  });

  return { ok: true, version: nextVersion, appliedRent: Boolean(rent) };
}
