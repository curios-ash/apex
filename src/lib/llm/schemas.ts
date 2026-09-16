import { z } from "zod";

import type { DocumentKind } from "./types";

// Per-type extraction schemas. Conventions mirror the database schema:
// money is integer cents, dates are ISO yyyy-mm-dd strings, and every field
// is nullable when the document may not state it — null means "not found",
// never a guess.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected yyyy-mm-dd")
  .nullable();

const cents = z.number().int().nullable();

export const transactionCategories = [
  "rent",
  "late_fee",
  "application_fee",
  "other_income",
  "mgmt_fee",
  "leasing_fee",
  "repair",
  "maintenance",
  "capex",
  "turnover",
  "utilities",
  "hoa",
  "property_tax",
  "insurance",
  "mortgage_principal",
  "mortgage_interest",
  "escrow",
  "legal",
  "marketing",
  "other_expense",
] as const;

const statementLine = z.object({
  date: isoDate,
  description: z.string(),
  // Signed: income positive, expense negative.
  amountCents: z.number().int(),
  category: z.enum(transactionCategories).nullable(),
});

export const pmStatementSchema = z.object({
  pmCompanyName: z.string().nullable(),
  propertyAddress: z.string().nullable(),
  periodStart: isoDate,
  periodEnd: isoDate,
  beginningBalanceCents: cents,
  endingBalanceCents: cents,
  // Total management fees charged in the period (positive cents).
  managementFeeCents: cents,
  // Total disbursed to the owner in the period (positive cents).
  ownerDrawCents: cents,
  lines: z.array(statementLine),
});

export const bankStatementSchema = z.object({
  bankName: z.string().nullable(),
  accountLast4: z.string().nullable(),
  periodStart: isoDate,
  periodEnd: isoDate,
  beginningBalanceCents: cents,
  endingBalanceCents: cents,
  lines: z.array(statementLine),
});

export const invoiceSchema = z.object({
  vendorName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: isoDate,
  dueDate: isoDate,
  totalCents: cents,
  lines: z.array(statementLine),
});

export const leaseSchema = z.object({
  tenantName: z.string().nullable(),
  propertyAddress: z.string().nullable(),
  unitLabel: z.string().nullable(),
  startDate: isoDate,
  endDate: isoDate,
  rentCents: cents,
  depositCents: cents,
});

export const insuranceSchema = z.object({
  carrier: z.string().nullable(),
  policyNumber: z.string().nullable(),
  annualPremiumCents: cents,
  coverageCents: cents,
  renewalDate: isoDate,
});

export const listingSchema = z.object({
  address: z.string().nullable(),
  listPriceCents: cents,
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  sqft: z.number().int().nullable(),
});

// v2 adds the underwriting fields a for-sale listing may state: current or
// market rent, annual property taxes, monthly HOA dues, year built, and
// whether the property is tenant-occupied. All nullable — null means the
// listing does not say, never a guess.
export const listingV2Schema = listingSchema.extend({
  rentCents: cents,
  propertyTaxAnnualCents: cents,
  hoaMonthlyCents: cents,
  yearBuilt: z.number().int().nullable(),
  tenantOccupied: z.boolean().nullable(),
});

export const EXTRACTION_SCHEMAS = {
  pm_statement: { version: "pm-statement-v1", schema: pmStatementSchema },
  bank_statement: { version: "bank-statement-v1", schema: bankStatementSchema },
  invoice: { version: "invoice-v1", schema: invoiceSchema },
  lease: { version: "lease-v1", schema: leaseSchema },
  insurance: { version: "insurance-v1", schema: insuranceSchema },
  listing: { version: "listing-v2", schema: listingV2Schema },
} as const;

// Superseded schema versions, kept so older extractions in the verify queue
// still resolve for correction.
const LEGACY_EXTRACTION_SCHEMAS: Record<string, { kind: ExtractableKind; schema: z.ZodType }> = {
  "listing-v1": { kind: "listing", schema: listingSchema },
};

export type ExtractableKind = keyof typeof EXTRACTION_SCHEMAS;

export function schemaForVersion(
  version: string,
): { kind: ExtractableKind; schema: z.ZodType } | null {
  for (const [kind, entry] of Object.entries(EXTRACTION_SCHEMAS)) {
    if (entry.version === version) return { kind: kind as ExtractableKind, schema: entry.schema };
  }
  return LEGACY_EXTRACTION_SCHEMAS[version] ?? null;
}

// documents.document_type uses slightly different names for two kinds.
export function kindToDocumentType(
  kind: DocumentKind,
):
  | "pm_statement"
  | "bank_statement"
  | "invoice"
  | "lease"
  | "insurance_policy"
  | "listing"
  | "other" {
  return kind === "insurance" ? "insurance_policy" : kind;
}
