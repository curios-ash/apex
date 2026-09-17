"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { AssumptionKey } from "@/dossier";
import { ASSUMPTION_UNITS } from "@/dossier";
import { intakeListingFile, intakeListingText } from "@/lib/dossier/intake";
import {
  createDossier,
  providedFromListing,
  reviseDossier,
  shareDossier,
  unshareDossier,
  applyCompsToDossier,
} from "@/lib/dossier/run";
import { getActiveWorkspace } from "@/lib/workspace";

import { parseAssumptionUpdates } from "./parse";

// Server actions for the underwriter. Form parsing (dollars -> cents,
// percents -> ratios) lives in ./parse — "use server" modules may only
// export async functions.

const MAX_LISTING_BYTES = 10 * 1024 * 1024;

function propertyIdFrom(formData: FormData): string | null {
  return String(formData.get("propertyId") ?? "").trim() || null;
}

function afterDossier(dossierId: string, propertyId: string | null): never {
  redirect(propertyId ? `/deals/${propertyId}` : `/dossiers/${dossierId}`);
}

export async function createFromText(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const text = String(formData.get("listingText") ?? "").trim();
  const listingUrl = String(formData.get("listingUrl") ?? "").trim() || null;
  const propertyId = propertyIdFrom(formData);
  if (text.length < 20) {
    redirect(
      propertyId
        ? `/dossiers/new?error=text-too-short&propertyId=${propertyId}`
        : "/dossiers/new?error=text-too-short",
    );
  }

  const intake = await intakeListingText({ workspaceId: workspace.id, text });
  const { dossierId } = await createDossier({
    workspaceId: workspace.id,
    userId: workspace.ownerUserId,
    listingUrl,
    propertyId,
    sourceDocumentId: intake.documentId,
    provided: providedFromListing({
      fields: intake.fields,
      fieldConfidence: intake.fieldConfidence,
      documentId: intake.documentId,
    }),
  });
  afterDossier(dossierId, propertyId);
}

export async function createFromFile(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const file = formData.get("file");
  const propertyId = propertyIdFrom(formData);
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      propertyId ? `/dossiers/new?error=no-file&propertyId=${propertyId}` : "/dossiers/new?error=no-file",
    );
  }
  if (file.size > MAX_LISTING_BYTES) {
    redirect(
      propertyId
        ? `/dossiers/new?error=file-too-large&propertyId=${propertyId}`
        : "/dossiers/new?error=file-too-large",
    );
  }
  const listingUrl = String(formData.get("listingUrl") ?? "").trim() || null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const intake = await intakeListingFile({
    workspaceId: workspace.id,
    filename: file.name || "listing.pdf",
    bytes,
    mimeType: file.type || null,
  });
  const { dossierId } = await createDossier({
    workspaceId: workspace.id,
    userId: workspace.ownerUserId,
    listingUrl,
    propertyId,
    sourceDocumentId: intake.documentId,
    provided: providedFromListing({
      fields: intake.fields,
      fieldConfidence: intake.fieldConfidence,
      documentId: intake.documentId,
    }),
  });
  afterDossier(dossierId, propertyId);
}

export async function createManual(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const updates = parseAssumptionUpdates(formData);
  const title = String(formData.get("title") ?? "").trim() || null;

  const provided = new Map();
  for (const [key, value] of Object.entries(updates)) {
    const k = key as AssumptionKey;
    const unit = ASSUMPTION_UNITS[k];
    provided.set(k, {
      key: k,
      valueNum: typeof value === "number" ? value : null,
      valueText: typeof value === "string" ? value : null,
      unit,
      source: "manual",
      confidence: "high",
    });
  }

  const propertyId = propertyIdFrom(formData);
  const { dossierId } = await createDossier({
    workspaceId: workspace.id,
    userId: workspace.ownerUserId,
    title,
    propertyId,
    provided,
  });
  afterDossier(dossierId, propertyId);
}

export async function revise(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const dossierId = String(formData.get("dossierId") ?? "");
  const updates = parseAssumptionUpdates(formData);
  await reviseDossier({
    workspaceId: workspace.id,
    userId: workspace.ownerUserId,
    dossierId,
    updates,
  });
  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath("/dossiers");
}

export async function share(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const dossierId = String(formData.get("dossierId") ?? "");
  await shareDossier({ workspaceId: workspace.id, userId: workspace.ownerUserId, dossierId });
  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath("/deals", "layout");
}

export async function unshare(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const dossierId = String(formData.get("dossierId") ?? "");
  await unshareDossier({ workspaceId: workspace.id, userId: workspace.ownerUserId, dossierId });
  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath("/deals", "layout");
}

export async function pullComps(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const dossierId = String(formData.get("dossierId") ?? "");
  const rawMode = String(formData.get("mode") ?? "fill_if_unverified");
  const mode =
    rawMode === "overwrite" || rawMode === "display_only" || rawMode === "fill_if_unverified"
      ? rawMode
      : "fill_if_unverified";
  const result = await applyCompsToDossier({
    workspaceId: workspace.id,
    userId: workspace.ownerUserId,
    dossierId,
    mode,
  });
  if (!result.ok) {
    redirect(`/dossiers/${dossierId}?compsError=${encodeURIComponent(result.message.slice(0, 180))}`);
  }
  revalidatePath(`/dossiers/${dossierId}`);
  redirect(`/dossiers/${dossierId}?comps=${result.appliedRent ? "applied" : "fetched"}`);
}
