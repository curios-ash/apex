import { centsToUsd, toCsv } from "./csv";
import { utf8, zipStore, type ZipEntry } from "./zip";

export const CPA_EXPORT_VERSION = "cpa-export-v1" as const;

export function normalizeExportMonth(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ym = /^(\d{4})-(\d{2})$/.exec(raw);
  if (ym) return `${ym[1]}-${ym[2]}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw.slice(0, 7)}-01`;
  return null;
}

export interface CpaExportProperty {
  id: string;
  name: string;
}

export interface CpaLedgerRow {
  occurredOn: string;
  propertyName: string | null;
  entryType: string;
  description: string;
  amountCents: number;
  confirmed: boolean;
  exceptionId: string | null;
}

export interface CpaExceptionRow {
  id: string;
  propertyName: string | null;
  month: string | null;
  ruleId: string;
  severity: string;
  status: string;
  summary: string;
  dollarImpactCents: number;
  recommendedAction: string | null;
  evidenceNotes: string;
}

export interface CpaActualRow {
  propertyName: string | null;
  month: string;
  category: string;
  amountCents: number;
  source: string;
}

export interface CpaExportInput {
  workspaceName: string;
  workspaceSlug: string;
  property: CpaExportProperty | null;
  month: string | null;
  generatedAt: Date;
  ledger: CpaLedgerRow[];
  exceptions: CpaExceptionRow[];
  actuals: CpaActualRow[];
}

export interface CpaPackageFile {
  name: string;
  text: string;
}

export function buildCpaPackageFiles(input: CpaExportInput): CpaPackageFile[] {
  const ledgerCsv = toCsv(
    [
      "occurred_on",
      "property",
      "entry_type",
      "description",
      "amount_cents",
      "amount_usd",
      "confirmed",
      "exception_id",
    ],
    input.ledger.map((r) => [
      r.occurredOn,
      r.propertyName,
      r.entryType,
      r.description,
      r.amountCents,
      centsToUsd(r.amountCents),
      r.confirmed,
      r.exceptionId,
    ]),
  );

  const exceptionsCsv = toCsv(
    [
      "id",
      "property",
      "month",
      "rule_id",
      "severity",
      "status",
      "summary",
      "dollar_impact_cents",
      "dollar_impact_usd",
      "recommended_action",
      "evidence_notes",
    ],
    input.exceptions.map((r) => [
      r.id,
      r.propertyName,
      r.month,
      r.ruleId,
      r.severity,
      r.status,
      r.summary,
      r.dollarImpactCents,
      centsToUsd(r.dollarImpactCents),
      r.recommendedAction,
      r.evidenceNotes,
    ]),
  );

  const actualsCsv = toCsv(
    ["property", "month", "category", "amount_cents", "amount_usd", "source"],
    input.actuals.map((r) => [
      r.propertyName,
      r.month,
      r.category,
      r.amountCents,
      centsToUsd(r.amountCents),
      r.source,
    ]),
  );

  const manifest = {
    schemaVersion: CPA_EXPORT_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    workspace: { name: input.workspaceName, slug: input.workspaceSlug },
    filters: {
      propertyId: input.property?.id ?? null,
      propertyName: input.property?.name ?? null,
      month: input.month,
    },
    counts: {
      ledger: input.ledger.length,
      exceptions: input.exceptions.length,
      actuals: input.actuals.length,
    },
    note: "All dollar figures are integer cents from the ledger, exception, and actuals tables. No LLM computed these numbers.",
  };

  const readme = [
    "Apex CPA export",
    "",
    `Workspace: ${input.workspaceName} (${input.workspaceSlug})`,
    `Property: ${input.property?.name ?? "all properties"}`,
    `Month: ${input.month ?? "all months"}`,
    `Generated: ${input.generatedAt.toISOString()}`,
    "",
    "Files:",
    "- ledger.csv — confirmed and unconfirmed impact-ledger rows",
    "- exceptions.csv — reconciliation findings for the selected scope",
    "- actuals.csv — monthly actual_lines (signed cents; income positive)",
    "- manifest.json — filters and row counts",
    "",
    "amount_usd is cents/100 with two decimals, derived from amount_cents.",
    "Do not treat narrative text (if any) as a source of numbers.",
    "",
  ].join("\n");

  return [
    { name: "README.txt", text: readme },
    { name: "manifest.json", text: JSON.stringify(manifest, null, 2) + "\n" },
    { name: "ledger.csv", text: ledgerCsv },
    { name: "exceptions.csv", text: exceptionsCsv },
    { name: "actuals.csv", text: actualsCsv },
  ];
}

export function packageFilename(input: Pick<CpaExportInput, "workspaceSlug" | "property" | "month">): string {
  const propertyPart = input.property
    ? input.property.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "property"
    : "workspace";
  const monthPart = input.month ? input.month.slice(0, 7) : "all-months";
  return `apex-cpa-${input.workspaceSlug}-${propertyPart}-${monthPart}.zip`;
}

export function zipCpaPackage(files: readonly CpaPackageFile[], now: Date): Uint8Array {
  const entries: ZipEntry[] = files.map((f) => ({ name: f.name, data: utf8(f.text) }));
  return zipStore(entries, now);
}
