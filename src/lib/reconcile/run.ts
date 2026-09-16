import { and, desc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  actualLines,
  budgetLines,
  documents,
  exceptions,
  extractions,
  pmAgreements,
  properties,
  transactions,
  type ExceptionEvidence,
} from "@/lib/db/schema";
import { sha256Hex } from "@/lib/hash";
import {
  monthEnd,
  reconcilePropertyMonth,
  type EngineBudgetLine,
  type EnginePmAgreement,
  type EngineTransaction,
  type RuleException,
  type TransactionCategory,
} from "@/reconcile";

// DB binding for the pure engine in src/reconcile/. Reconciliation is
// idempotent: transactions materialize from extractions under a stable
// external id, actual lines upsert, and exceptions upsert by fingerprint —
// open rows refresh, confirmed/dismissed rows are never touched, and open
// rows whose finding disappears are auto-resolved.

const STATEMENT_SCHEMA_VERSIONS = ["pm-statement-v1", "bank-statement-v1"] as const;

export interface ReconcileRunSummary {
  workspaceId: string;
  monthsReconciled: string[];
  transactionsMaterialized: number;
  duplicatesSkipped: number;
  actualLinesUpserted: number;
  exceptionsUpserted: number;
  exceptionsAutoResolved: number;
}

interface StatementLine {
  date: string | null;
  description: string;
  amountCents: number;
  category: TransactionCategory | null;
}

interface StatementFields {
  propertyAddress?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  lines?: StatementLine[];
}

function normalizeAddress(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Matches an extraction's propertyAddress to a property row by street line.
function resolvePropertyId(
  address: string | null | undefined,
  workspaceProperties: { id: string; addressLine1: string }[],
): string | null {
  if (!address) return null;
  const needle = normalizeAddress(address);
  for (const p of workspaceProperties) {
    const street = normalizeAddress(p.addressLine1);
    if (street && (needle.includes(street) || street.includes(needle))) return p.id;
  }
  return null;
}

// Turns verified/auto-passed statement extractions into transactions rows.
// externalId pins each line to its extraction, so re-runs never duplicate;
// a line already present from a *different* document (same statement
// forwarded twice with a new wrapper) is skipped as a cross-document dupe.
export async function materializeTransactions(workspaceId: string): Promise<{
  materialized: number;
  duplicatesSkipped: number;
}> {
  const rows = await db
    .select({ extraction: extractions, document: documents })
    .from(extractions)
    .innerJoin(documents, eq(extractions.documentId, documents.id))
    .where(
      and(
        eq(extractions.workspaceId, workspaceId),
        inArray(extractions.status, ["pending", "verified"]),
        inArray(extractions.schemaVersion, [...STATEMENT_SCHEMA_VERSIONS]),
      ),
    )
    .orderBy(desc(extractions.createdAt));

  // Latest usable extraction per document.
  const byDocument = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byDocument.has(row.document.id)) byDocument.set(row.document.id, row);
  }

  const workspaceProperties = await db
    .select({ id: properties.id, addressLine1: properties.addressLine1 })
    .from(properties)
    .where(eq(properties.workspaceId, workspaceId));

  const existing = await db
    .select({
      documentId: transactions.documentId,
      transactionDate: transactions.transactionDate,
      amountCents: transactions.amountCents,
      description: transactions.description,
      source: transactions.source,
    })
    .from(transactions)
    .where(eq(transactions.workspaceId, workspaceId));
  // Cross-document dedupe key -> set of document ids that already carry it.
  const seenElsewhere = new Map<string, Set<string>>();
  for (const t of existing) {
    const key = `${t.source}|${t.transactionDate}|${t.amountCents}|${t.description}`;
    if (!seenElsewhere.has(key)) seenElsewhere.set(key, new Set());
    if (t.documentId) seenElsewhere.get(key)!.add(t.documentId);
  }

  let materialized = 0;
  let duplicatesSkipped = 0;

  for (const { extraction, document } of byDocument.values()) {
    const fields = (extraction.payload as { fields: StatementFields }).fields;
    const lines = fields.lines ?? [];
    if (lines.length === 0) continue;

    let propertyId = document.propertyId;
    if (!propertyId) {
      propertyId = resolvePropertyId(fields.propertyAddress, workspaceProperties);
      if (propertyId) {
        await db.update(documents).set({ propertyId }).where(eq(documents.id, document.id));
      }
    }

    const source = extraction.schemaVersion === "pm-statement-v1" ? "pm_statement" : "bank";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const date = line.date ?? document.periodStart;
      if (!date) continue;

      const dupeKey = `${source}|${date}|${line.amountCents}|${line.description}`;
      const otherDocs = seenElsewhere.get(dupeKey);
      if (otherDocs && [...otherDocs].some((d) => d !== document.id)) {
        duplicatesSkipped += 1;
        continue;
      }

      const inserted = await db
        .insert(transactions)
        .values({
          workspaceId,
          propertyId,
          documentId: document.id,
          transactionDate: date,
          description: line.description,
          amountCents: line.amountCents,
          category: line.category ?? (line.amountCents >= 0 ? "other_income" : "other_expense"),
          source,
          externalId: `extraction:${extraction.id}:${i}`,
        })
        .onConflictDoNothing({
          target: [transactions.workspaceId, transactions.externalId],
        })
        .returning({ id: transactions.id });
      if (inserted.length > 0) {
        materialized += 1;
        if (!seenElsewhere.has(dupeKey)) seenElsewhere.set(dupeKey, new Set());
        seenElsewhere.get(dupeKey)!.add(document.id);
      }
    }
  }

  return { materialized, duplicatesSkipped };
}

function exceptionFingerprint(ex: RuleException): string {
  const evidenceIds = ex.evidence
    .map((e) => e.transactionId ?? e.documentId ?? e.note ?? "")
    .sort()
    .join("|");
  return sha256Hex(`${ex.ruleId}|${ex.propertyId}|${ex.month}|${evidenceIds}`);
}

// Runs the full loop for a workspace: materialize transactions, reconcile
// every property-month with activity (or one month when opts.month is set),
// persist actual lines + exceptions, and mark source documents reconciled.
export async function runReconciliation(
  workspaceId: string,
  opts: { month?: string; propertyId?: string } = {},
): Promise<ReconcileRunSummary> {
  const { materialized, duplicatesSkipped } = await materializeTransactions(workspaceId);

  const [propertyRows, transactionRows, budgetRows, agreementRows] = await Promise.all([
    db.select().from(properties).where(eq(properties.workspaceId, workspaceId)),
    db.select().from(transactions).where(eq(transactions.workspaceId, workspaceId)),
    db.select().from(budgetLines).where(eq(budgetLines.workspaceId, workspaceId)),
    db.select().from(pmAgreements).where(eq(pmAgreements.workspaceId, workspaceId)),
  ]);

  // Property-months with any transaction activity. Months with a budget but
  // no statement are skipped: absence of data is not a finding.
  const propertyMonths = new Map<string, { propertyId: string; month: string }>();
  for (const t of transactionRows) {
    if (!t.propertyId) continue;
    const month = `${t.transactionDate.slice(0, 7)}-01`;
    if (opts.month && month !== opts.month) continue;
    if (opts.propertyId && t.propertyId !== opts.propertyId) continue;
    propertyMonths.set(`${t.propertyId}|${month}`, { propertyId: t.propertyId, month });
  }

  let actualLinesUpserted = 0;
  let exceptionsUpserted = 0;
  let exceptionsAutoResolved = 0;
  const monthsReconciled = new Set<string>();

  for (const { propertyId, month } of [...propertyMonths.values()].sort()) {
    const property = propertyRows.find((p) => p.id === propertyId);
    if (!property) continue;

    const engineTransactions: EngineTransaction[] = transactionRows
      .filter((t) => t.propertyId === propertyId)
      .map((t) => ({
        id: t.id,
        propertyId: t.propertyId,
        transactionDate: t.transactionDate,
        description: t.description,
        amountCents: t.amountCents,
        category: t.category,
        source: t.source,
        documentId: t.documentId,
      }));
    const engineBudget: EngineBudgetLine[] = budgetRows
      .filter((b) => b.propertyId === propertyId)
      .map((b) => ({
        propertyId: b.propertyId ?? propertyId,
        category: b.category,
        month: b.month,
        amountCents: b.amountCents,
      }));

    const monthEndDate = monthEnd(month);
    const agreement =
      agreementRows
        .filter(
          (a) =>
            a.propertyId === propertyId &&
            (!a.startDate || a.startDate <= monthEndDate) &&
            (!a.endDate || a.endDate >= month),
        )
        .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))[0] ?? null;
    const engineAgreement: EnginePmAgreement | null = agreement
      ? {
          propertyId,
          pmCompanyName: agreement.pmCompanyName,
          feeBps: agreement.feeBps,
        }
      : null;

    const output = reconcilePropertyMonth({
      propertyId,
      propertyName: property.name,
      month,
      transactions: engineTransactions,
      budgetLines: engineBudget,
      pmAgreement: engineAgreement,
    });

    for (const line of output.actualLines) {
      await db
        .insert(actualLines)
        .values({
          workspaceId,
          propertyId,
          category: line.category,
          month,
          amountCents: line.amountCents,
          source: line.source,
        })
        .onConflictDoUpdate({
          target: [actualLines.workspaceId, actualLines.propertyId, actualLines.category, actualLines.month],
          set: { amountCents: line.amountCents, source: line.source },
        });
      actualLinesUpserted += 1;
    }

    const seenFingerprints: string[] = [];
    for (const ex of output.exceptions) {
      const fingerprint = exceptionFingerprint(ex);
      seenFingerprints.push(fingerprint);
      await db
        .insert(exceptions)
        .values({
          workspaceId,
          propertyId,
          ruleId: ex.ruleId,
          month: ex.month,
          fingerprint,
          severity: ex.severity,
          dollarImpactCents: ex.dollarImpactCents,
          summary: ex.summary,
          evidence: ex.evidence as ExceptionEvidence[],
          recommendedAction: ex.recommendedAction,
        })
        .onConflictDoUpdate({
          target: [
            exceptions.workspaceId,
            exceptions.propertyId,
            exceptions.ruleId,
            exceptions.month,
            exceptions.fingerprint,
          ],
          // Human decisions win: only still-open rows refresh on re-run.
          setWhere: eq(exceptions.status, "open"),
          set: {
            severity: ex.severity,
            dollarImpactCents: ex.dollarImpactCents,
            summary: ex.summary,
            evidence: ex.evidence as ExceptionEvidence[],
            recommendedAction: ex.recommendedAction,
            updatedAt: new Date(),
          },
        });
      exceptionsUpserted += 1;
    }

    // Open exceptions for this property-month whose finding no longer
    // reproduces (corrected extraction, changed budget) auto-resolve.
    const staleFilter =
      seenFingerprints.length > 0
        ? notInArray(exceptions.fingerprint, seenFingerprints)
        : undefined;
    const resolved = await db
      .update(exceptions)
      .set({ status: "resolved", updatedAt: new Date() })
      .where(
        and(
          eq(exceptions.workspaceId, workspaceId),
          eq(exceptions.propertyId, propertyId),
          eq(exceptions.month, month),
          eq(exceptions.status, "open"),
          ...(staleFilter ? [staleFilter] : []),
        ),
      )
      .returning({ id: exceptions.id });
    exceptionsAutoResolved += resolved.length;
    monthsReconciled.add(month);
  }

  if (monthsReconciled.size > 0) {
    const candidates = await db
      .select({ id: documents.id, periodStart: documents.periodStart })
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          eq(documents.status, "extracted"),
          isNotNull(documents.periodStart),
          inArray(documents.documentType, ["pm_statement", "bank_statement"]),
        ),
      );
    const reconciledIds = candidates
      .filter((d) => monthsReconciled.has(`${d.periodStart!.slice(0, 7)}-01`))
      .map((d) => d.id);
    if (reconciledIds.length > 0) {
      await db
        .update(documents)
        .set({ status: "reconciled" })
        .where(inArray(documents.id, reconciledIds));
    }
  }

  const summary: ReconcileRunSummary = {
    workspaceId,
    monthsReconciled: [...monthsReconciled].sort(),
    transactionsMaterialized: materialized,
    duplicatesSkipped,
    actualLinesUpserted,
    exceptionsUpserted,
    exceptionsAutoResolved,
  };

  await writeAuditLog({
    workspaceId,
    actorType: "system",
    action: "reconcile.completed",
    metadata: { ...summary, reconcileVersion: "reconcile-v1" },
  });

  return summary;
}
