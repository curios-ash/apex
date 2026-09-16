import { and, eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { documents, extractions } from "@/lib/db/schema";
import { sha256Hex } from "@/lib/hash";
import { extractTextContent } from "@/lib/ingest/text";
import {
  EXTRACTION_SCHEMAS,
  extractionStatusFor,
  getDocumentLlm,
  overallConfidence,
  reviewThreshold,
} from "@/lib/llm";
import { logLlmCall } from "@/lib/llm/log";
import { buildStorageKey, getStorage } from "@/lib/storage";

// Listing intake for the underwriter. Unlike the generic document pipeline
// (which classifies first), here the user has already told us what the
// document is: a for-sale listing. We store the capture for provenance, run
// listing extraction directly, and hand the fields to the dossier builder.

export interface ListingIntakeResult {
  documentId: string;
  fields: Record<string, unknown>;
  fieldConfidence: Record<string, number>;
}

async function storeAndExtractListing(params: {
  workspaceId: string;
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
  source: "upload" | "manual";
}): Promise<ListingIntakeResult> {
  const { workspaceId, filename, bytes, mimeType, source } = params;
  if (bytes.length === 0) throw new Error("empty file");

  // Same capture pasted/uploaded twice: reuse the existing document row
  // (documents is unique on workspace + sha256) but still run extraction.
  const sha256 = sha256Hex(bytes);
  const existing = await db
    .select()
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.sha256, sha256)))
    .limit(1);

  let id: string;
  if (existing.length > 0) {
    id = existing[0].id;
  } else {
    id = crypto.randomUUID();
    const storage = getStorage();
    const storageKey = await storage.put(
      buildStorageKey(workspaceId, id, filename),
      bytes,
      mimeType,
    );

    await db.insert(documents).values({
      id,
      workspaceId,
      documentType: "listing",
      source,
      status: "received",
      storageKey,
      originalFilename: filename,
      mimeType,
      byteSize: bytes.length,
      sha256,
    });

    await writeAuditLog({
      workspaceId,
      actorType: "system",
      action: "document.received",
      targetType: "document",
      targetId: id,
      metadata: { source, filename, via: "dossier-intake", storageBackend: storage.backend },
    });
  }
  const storage = getStorage();
  const storageKey = await storage.put(buildStorageKey(workspaceId, id, filename), bytes, mimeType);

  await db.insert(documents).values({
    id,
    workspaceId,
    documentType: "listing",
    source,
    status: "received",
    storageKey,
    originalFilename: filename,
    mimeType,
    byteSize: bytes.length,
    sha256: sha256Hex(bytes),
  });

  await writeAuditLog({
    workspaceId,
    actorType: "system",
    action: "document.received",
    targetType: "document",
    targetId: id,
    metadata: { source, filename, via: "dossier-intake", storageBackend: storage.backend },
  });

  const text = await extractTextContent(bytes, mimeType, filename);
  const entry = EXTRACTION_SCHEMAS.listing;
  const llm = getDocumentLlm();

  const extractionStarted = Date.now();

  let extraction;
  try {
    extraction = await llm.extract(
      { filename, text, mimeType, kind: "listing" },
      entry.schema,
      entry.version,
    );
  } catch (error) {
    await logLlmCall({
      workspaceId,
      documentId: id,
      purpose: "extract",
      meta: {
        provider: "unknown",
        model: "unknown",
        promptVersion: entry.version,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - extractionStarted,
      },
      error: String(error),
    });
    await db.update(documents).set({ status: "failed" }).where(eq(documents.id, id));
    throw error;
  }
  await logLlmCall({
    workspaceId,
    documentId: id,
    purpose: "extract",
    meta: extraction.meta,
    output: extraction.output,
  });

  const status = extractionStatusFor(extraction.output.fieldConfidence, reviewThreshold());
  await db.insert(extractions).values({
    workspaceId,
    documentId: id,
    schemaVersion: entry.version,
    extractor: `${extraction.meta.model}/${extraction.meta.promptVersion}`,
    payload: {
      fields: extraction.output.fields,
      fieldConfidence: extraction.output.fieldConfidence,
    },
    confidence: overallConfidence(extraction.output.fieldConfidence),
    status,
  });
  await db.update(documents).set({ status: "extracted" }).where(eq(documents.id, id));

  return {
    documentId: id,
    fields: extraction.output.fields as Record<string, unknown>,
    fieldConfidence: extraction.output.fieldConfidence,
  };
}

export async function intakeListingText(params: {
  workspaceId: string;
  text: string;
}): Promise<ListingIntakeResult> {
  const trimmed = params.text.trim();
  if (trimmed.length < 20) throw new Error("listing text is too short to extract from");
  return storeAndExtractListing({
    workspaceId: params.workspaceId,
    filename: "pasted-listing.txt",
    bytes: new TextEncoder().encode(trimmed),
    mimeType: "text/plain",
    source: "manual",
  });
}

export async function intakeListingFile(params: {
  workspaceId: string;
  filename: string;
  bytes: Uint8Array;
  mimeType: string | null;
}): Promise<ListingIntakeResult> {
  return storeAndExtractListing({
    workspaceId: params.workspaceId,
    filename: params.filename,
    bytes: params.bytes,
    mimeType: params.mimeType ?? "application/octet-stream",
    source: "upload",
  });
}
