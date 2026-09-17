import { and, desc, eq } from "drizzle-orm";

import {
  buildCpaPackageFiles,
  packageFilename,
  zipCpaPackage,
  type CpaActualRow,
  type CpaExceptionRow,
  type CpaLedgerRow,
} from "@/export";
import { db } from "@/lib/db";
import {
  actualLines,
  exceptions,
  impactLedgerEntries,
  properties,
  type ExceptionEvidence,
} from "@/lib/db/schema";

function evidenceNotes(items: ExceptionEvidence[] | null | undefined): string {
  if (!items || items.length === 0) return "";
  return items
    .map((item) => {
      const parts: string[] = [];
      if (item.note) parts.push(item.note);
      if (item.documentId) parts.push(`doc:${item.documentId}`);
      if (item.transactionId) parts.push(`tx:${item.transactionId}`);
      if (item.page !== undefined) parts.push(`page:${item.page}`);
      return parts.join(" ");
    })
    .filter(Boolean)
    .join(" | ");
}

export { normalizeExportMonth as normalizeMonthParam } from "@/export";

export async function buildWorkspaceCpaZip(params: {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  propertyId: string | null;
  month: string | null;
  now?: Date;
}): Promise<{ filename: string; bytes: Uint8Array; empty: boolean }> {
  const { workspaceId, propertyId, month } = params;
  const now = params.now ?? new Date();

  const propertyRows = await db
    .select()
    .from(properties)
    .where(eq(properties.workspaceId, workspaceId));
  const propertyNameById = new Map(propertyRows.map((p) => [p.id, p.name]));
  const selectedProperty = propertyId
    ? propertyRows.find((p) => p.id === propertyId) ?? null
    : null;
  if (propertyId && !selectedProperty) {
    throw new Error("Property not found in this workspace.");
  }

  const ledgerWhere = [eq(impactLedgerEntries.workspaceId, workspaceId)];
  if (propertyId) ledgerWhere.push(eq(impactLedgerEntries.propertyId, propertyId));

  const exceptionWhere = [eq(exceptions.workspaceId, workspaceId)];
  if (propertyId) exceptionWhere.push(eq(exceptions.propertyId, propertyId));
  if (month) exceptionWhere.push(eq(exceptions.month, month));

  const actualWhere = [eq(actualLines.workspaceId, workspaceId)];
  if (propertyId) actualWhere.push(eq(actualLines.propertyId, propertyId));
  if (month) actualWhere.push(eq(actualLines.month, month));

  const [ledgerRows, exceptionRows, actualRows] = await Promise.all([
    db
      .select()
      .from(impactLedgerEntries)
      .where(and(...ledgerWhere))
      .orderBy(desc(impactLedgerEntries.occurredOn)),
    db
      .select()
      .from(exceptions)
      .where(and(...exceptionWhere))
      .orderBy(desc(exceptions.dollarImpactCents)),
    db
      .select()
      .from(actualLines)
      .where(and(...actualWhere))
      .orderBy(actualLines.month),
  ]);

  const ledger: CpaLedgerRow[] = ledgerRows
    .filter((row) => {
      if (!month) return true;
      return row.occurredOn.slice(0, 7) === month.slice(0, 7);
    })
    .map((row) => ({
      occurredOn: row.occurredOn,
      propertyName: row.propertyId ? (propertyNameById.get(row.propertyId) ?? null) : null,
      entryType: row.entryType,
      description: row.description,
      amountCents: row.amountCents,
      confirmed: row.confirmed,
      exceptionId: row.exceptionId,
    }));

  const exceptionMapped: CpaExceptionRow[] = exceptionRows.map((row) => ({
    id: row.id,
    propertyName: row.propertyId ? (propertyNameById.get(row.propertyId) ?? null) : null,
    month: row.month,
    ruleId: row.ruleId,
    severity: row.severity,
    status: row.status,
    summary: row.summary,
    dollarImpactCents: row.dollarImpactCents,
    recommendedAction: row.recommendedAction,
    evidenceNotes: evidenceNotes(row.evidence),
  }));

  const actuals: CpaActualRow[] = actualRows.map((row) => ({
    propertyName: row.propertyId ? (propertyNameById.get(row.propertyId) ?? null) : null,
    month: row.month,
    category: row.category,
    amountCents: row.amountCents,
    source: row.source,
  }));

  const input = {
    workspaceName: params.workspaceName,
    workspaceSlug: params.workspaceSlug,
    property: selectedProperty ? { id: selectedProperty.id, name: selectedProperty.name } : null,
    month,
    generatedAt: now,
    ledger,
    exceptions: exceptionMapped,
    actuals,
  };

  const files = buildCpaPackageFiles(input);
  return {
    filename: packageFilename(input),
    bytes: zipCpaPackage(files, now),
    empty: ledger.length === 0 && exceptionMapped.length === 0 && actuals.length === 0,
  };
}
