import { and, eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { sha256Hex } from "@/lib/hash";
import { buildStorageKey, getStorage } from "@/lib/storage";

import { processDocument } from "./process-document";

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export interface IngestResult {
  documentId: string;
  duplicate: boolean;
  status: string;
  documentType: string;
  filename: string;
}

// Stores the bytes, writes the documents row, and runs the LLM pipeline.
// Shared by POST /api/documents (upload) and POST /api/inbound-email.
// Duplicates (same workspace + sha256) return the existing row untouched.
export async function ingestDocumentBytes(params: {
  workspaceId: string;
  filename: string;
  bytes: Uint8Array;
  mimeType: string | null;
  source: "email" | "upload" | "manual";
  propertyId?: string | null;
  emailSubject?: string;
}): Promise<IngestResult> {
  const { workspaceId, filename, bytes, mimeType, source, propertyId, emailSubject } = params;

  if (bytes.length === 0) throw new Error("empty file");
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new Error(`file exceeds ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB limit`);
  }

  const sha256 = sha256Hex(bytes);
  const existing = await db
    .select()
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.sha256, sha256)))
    .limit(1);
  if (existing.length > 0) {
    return {
      documentId: existing[0].id,
      duplicate: true,
      status: existing[0].status,
      documentType: existing[0].documentType,
      filename: existing[0].originalFilename ?? filename,
    };
  }

  const id = crypto.randomUUID();
  const storage = getStorage();
  const storageKey = await storage.put(
    buildStorageKey(workspaceId, id, filename),
    bytes,
    mimeType ?? "application/octet-stream",
  );

  await db.insert(documents).values({
    id,
    workspaceId,
    propertyId: propertyId ?? null,
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
    metadata: { source, filename, sha256, storageBackend: storage.backend },
  });

  await processDocument(id, { emailSubject });

  const after = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return {
    documentId: id,
    duplicate: false,
    status: after[0]?.status ?? "received",
    documentType: after[0]?.documentType ?? "other",
    filename,
  };
}
