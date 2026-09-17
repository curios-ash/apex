import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  documents,
  exceptions,
  transactions,
  type ExceptionEvidence,
} from "@/lib/db/schema";

export interface EvidenceHighlight {
  page: number | null;
  bbox: [number, number, number, number] | null;
  note: string | null;
  transactionId: string | null;
  exceptionId: string | null;
}

export interface LoadedEvidence {
  document: typeof documents.$inferSelect | null;
  exception: typeof exceptions.$inferSelect | null;
  transaction: typeof transactions.$inferSelect | null;
  citingExceptions: Array<{
    id: string;
    ruleId: string;
    summary: string;
    dollarImpactCents: number;
    status: string;
    evidence: ExceptionEvidence[];
  }>;
  highlights: EvidenceHighlight[];
  error: string | null;
}

function asBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return [value[0], value[1], value[2], value[3]];
}

export async function loadEvidenceView(params: {
  workspaceId: string;
  documentId: string | null;
  exceptionId: string | null;
  transactionId: string | null;
}): Promise<LoadedEvidence> {
  const { workspaceId, documentId, exceptionId, transactionId } = params;

  const result: LoadedEvidence = {
    document: null,
    exception: null,
    transaction: null,
    citingExceptions: [],
    highlights: [],
    error: null,
  };

  if (!documentId && !exceptionId && !transactionId) {
    return result;
  }

  if (exceptionId) {
    const [ex] = await db
      .select()
      .from(exceptions)
      .where(and(eq(exceptions.id, exceptionId), eq(exceptions.workspaceId, workspaceId)))
      .limit(1);
    result.exception = ex ?? null;
    if (!ex) result.error = "That exception is not in this workspace.";
  }

  if (transactionId) {
    const [tx] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.workspaceId, workspaceId)))
      .limit(1);
    result.transaction = tx ?? null;
    if (!tx && !result.error) result.error = "That transaction is not in this workspace.";
  }

  const resolvedDocumentId =
    documentId ??
    result.exception?.evidence.find((e) => e.documentId)?.documentId ??
    result.transaction?.documentId ??
    null;

  if (resolvedDocumentId) {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, resolvedDocumentId), eq(documents.workspaceId, workspaceId)))
      .limit(1);
    result.document = doc ?? null;
    if (!doc && !result.error) result.error = "That source document is not in this workspace.";
  }

  const allExceptions = await db
    .select()
    .from(exceptions)
    .where(eq(exceptions.workspaceId, workspaceId));

  const targetDocId = result.document?.id ?? null;
  result.citingExceptions = allExceptions
    .filter((ex) => {
      if (result.exception && ex.id === result.exception.id) return true;
      if (targetDocId && ex.evidence.some((e) => e.documentId === targetDocId)) return true;
      if (transactionId && ex.evidence.some((e) => e.transactionId === transactionId)) return true;
      return false;
    })
    .map((ex) => ({
      id: ex.id,
      ruleId: ex.ruleId,
      summary: ex.summary,
      dollarImpactCents: ex.dollarImpactCents,
      status: ex.status,
      evidence: ex.evidence,
    }));

  const focusException = result.exception;
  const evidenceItems: Array<ExceptionEvidence & { exceptionId: string }> = [];
  if (focusException) {
    for (const item of focusException.evidence) {
      evidenceItems.push({ ...item, exceptionId: focusException.id });
    }
  } else {
    for (const ex of result.citingExceptions) {
      for (const item of ex.evidence) {
        if (targetDocId && item.documentId && item.documentId !== targetDocId) continue;
        evidenceItems.push({ ...item, exceptionId: ex.id });
      }
    }
  }

  result.highlights = evidenceItems.map((item) => ({
    page: item.page ?? null,
    bbox: asBbox(item.bbox),
    note: item.note ?? null,
    transactionId: item.transactionId ?? null,
    exceptionId: item.exceptionId,
  }));

  return result;
}

export function evidenceHref(opts: {
  documentId?: string | null;
  exceptionId?: string | null;
  transactionId?: string | null;
  page?: number | null;
}): string {
  const params = new URLSearchParams();
  if (opts.documentId) params.set("documentId", opts.documentId);
  if (opts.exceptionId) params.set("exceptionId", opts.exceptionId);
  if (opts.transactionId) params.set("transactionId", opts.transactionId);
  if (opts.page !== undefined && opts.page !== null) params.set("page", String(opts.page));
  const q = params.toString();
  return q ? `/evidence?${q}` : "/evidence";
}
