import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { documents, extractions } from "@/lib/db/schema";
import {
  EXTRACTION_SCHEMAS,
  extractionStatusFor,
  getDocumentLlm,
  kindToDocumentType,
  overallConfidence,
  reviewThreshold,
} from "@/lib/llm";
import { logLlmCall } from "@/lib/llm/log";
import type { LlmCallMeta } from "@/lib/llm/types";
import { runReconciliation } from "@/lib/reconcile/run";
import { readStoredFile } from "@/lib/storage";

import { extractTextContent } from "./text";

function failedCallMeta(promptVersion: string, startedAt: number): LlmCallMeta {
  return {
    provider: "unknown",
    model: "unknown",
    promptVersion,
    inputTokens: null,
    outputTokens: null,
    latencyMs: Date.now() - startedAt,
  };
}

async function markFailed(documentId: string): Promise<void> {
  await db.update(documents).set({ status: "failed" }).where(eq(documents.id, documentId));
}

// Runs classify -> extract for one document, writing llm_calls and an
// extractions row. Called inline from the upload and inbound-email routes
// (R0); Vercel Workflow durable execution replaces the inline call in R1.
export async function processDocument(
  documentId: string,
  opts: { emailSubject?: string } = {},
): Promise<void> {
  const rows = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  const doc = rows[0];
  if (!doc) return;

  const filename = doc.originalFilename ?? "document";
  const llm = getDocumentLlm();

  try {
    const bytes = doc.storageKey ? await readStoredFile(doc.storageKey) : null;
    const text = bytes
      ? await extractTextContent(bytes, doc.mimeType, filename)
      : null;

    const input = {
      filename,
      text,
      mimeType: doc.mimeType,
      bytes: text === null ? (bytes ?? undefined) : undefined,
      emailSubject: opts.emailSubject,
    };

    const classifyStarted = Date.now();
    let classification;
    try {
      classification = await llm.classify(input);
    } catch (error) {
      await logLlmCall({
        workspaceId: doc.workspaceId,
        documentId,
        purpose: "classify",
        meta: failedCallMeta("classify-v1", classifyStarted),
        error: String(error),
      });
      await markFailed(documentId);
      return;
    }
    await logLlmCall({
      workspaceId: doc.workspaceId,
      documentId,
      purpose: "classify",
      meta: classification.meta,
      output: classification.output,
    });

    await db
      .update(documents)
      .set({
        documentType: kindToDocumentType(classification.output.kind),
        status: "classified",
      })
      .where(eq(documents.id, documentId));

    if (classification.output.kind === "other") return;

    const entry = EXTRACTION_SCHEMAS[classification.output.kind];
    await db.update(documents).set({ status: "extracting" }).where(eq(documents.id, documentId));

    const extractStarted = Date.now();
    let extraction;
    try {
      extraction = await llm.extract(
        { ...input, kind: classification.output.kind },
        entry.schema,
        entry.version,
      );
    } catch (error) {
      await logLlmCall({
        workspaceId: doc.workspaceId,
        documentId,
        purpose: "extract",
        meta: failedCallMeta(entry.version, extractStarted),
        error: String(error),
      });
      await markFailed(documentId);
      return;
    }
    await logLlmCall({
      workspaceId: doc.workspaceId,
      documentId,
      purpose: "extract",
      meta: extraction.meta,
      output: extraction.output,
    });

    const status = extractionStatusFor(extraction.output.fieldConfidence, reviewThreshold());
    const [extractionRow] = await db
      .insert(extractions)
      .values({
        workspaceId: doc.workspaceId,
        documentId,
        schemaVersion: entry.version,
        extractor: `${extraction.meta.model}/${extraction.meta.promptVersion}`,
        payload: {
          fields: extraction.output.fields,
          fieldConfidence: extraction.output.fieldConfidence,
        },
        confidence: overallConfidence(extraction.output.fieldConfidence),
        status,
      })
      .returning({ id: extractions.id });

    if (doc.propertyId && extractionRow) {
      const { recordDealEvent } = await import("@/lib/deals/events");
      await recordDealEvent({
        workspaceId: doc.workspaceId,
        propertyId: doc.propertyId,
        kind: "extract",
        title: "Listing fields extracted",
        summary: `${kindToDocumentType(classification.output.kind)} · ${status}`,
        refType: "extraction",
        refId: extractionRow.id,
        metadata: {
          documentId,
          schemaVersion: entry.version,
          status,
          documentType: kindToDocumentType(classification.output.kind),
        },
      });
    }

    const fields = extraction.output.fields as {
      periodStart?: string | null;
      periodEnd?: string | null;
    };
    await db
      .update(documents)
      .set({
        status: "extracted",
        periodStart: fields.periodStart ?? null,
        periodEnd: fields.periodEnd ?? null,
      })
      .where(eq(documents.id, documentId));

    // Auto-passed extractions feed reconciliation immediately; anything in
    // the verify queue reconciles after the human decision instead.
    if (status === "pending") {
      await runReconciliation(doc.workspaceId).catch((error) =>
        console.error("reconciliation after ingest failed", error),
      );
    }
  } catch (error) {
    console.error(`processDocument ${documentId} failed`, error);
    await markFailed(documentId);
  }
}
