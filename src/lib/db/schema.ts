import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Conventions used across the whole schema:
// - Money is integer cents (bigint, mode number). Never float dollars.
// - Rates are integer basis points (650 = 6.50%) unless the column name says otherwise.
// - budget_lines / actual_lines `month` is a date truncated to the first of the month.
// - Every domain table carries workspace_id; all queries are workspace-scoped.

export const workspacePlanEnum = pgEnum("workspace_plan", ["free", "owner", "portfolio"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
]);
export const userRoleEnum = pgEnum("user_role", ["owner", "member", "cpa"]);
export const entityTypeEnum = pgEnum("entity_type", [
  "personal",
  "llc",
  "s_corp",
  "c_corp",
  "partnership",
  "trust",
]);
export const propertyTypeEnum = pgEnum("property_type", [
  "sfr",
  "condo",
  "townhome",
  "duplex",
  "triplex",
  "fourplex",
  "multi_5plus",
]);
export const propertyStatusEnum = pgEnum("property_status", [
  "active",
  "under_contract",
  "sold",
  "archived",
]);
export const unitStatusEnum = pgEnum("unit_status", ["vacant", "occupied", "turn", "down"]);
export const loanTypeEnum = pgEnum("loan_type", [
  "fixed",
  "arm",
  "interest_only",
  "heloc",
  "balloon",
]);
export const policyTypeEnum = pgEnum("policy_type", [
  "landlord_dwelling",
  "umbrella",
  "flood",
  "earthquake",
  "liability",
  "other",
]);
export const leaseStatusEnum = pgEnum("lease_status", [
  "draft",
  "active",
  "month_to_month",
  "expired",
  "terminated",
]);
export const documentTypeEnum = pgEnum("document_type", [
  "pm_statement",
  "bank_statement",
  "invoice",
  "lease",
  "insurance_policy",
  "listing",
  "management_agreement",
  "tax",
  "other",
]);
export const documentSourceEnum = pgEnum("document_source", ["email", "upload", "manual"]);
export const documentStatusEnum = pgEnum("document_status", [
  "received",
  "classified",
  "extracting",
  "extracted",
  "reconciled",
  "failed",
]);
export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",
  "needs_review",
  "verified",
  "rejected",
]);
export const transactionCategoryEnum = pgEnum("transaction_category", [
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
]);
export const transactionSourceEnum = pgEnum("transaction_source", [
  "bank",
  "pm_statement",
  "manual",
]);
export const exceptionSeverityEnum = pgEnum("exception_severity", ["info", "warning", "critical"]);
export const exceptionStatusEnum = pgEnum("exception_status", [
  "open",
  "confirmed",
  "dismissed",
  "resolved",
]);
export const actionTypeEnum = pgEnum("action_type", [
  "email_pm",
  "request_quote",
  "reminder",
  "ledger_adjustment",
  "call_pm",
  "other",
]);
// Drafts land as pending_approval and stay there until a human approves or
// rejects them — nothing is ever sent autonomously.
export const actionStatusEnum = pgEnum("action_status", [
  "pending_approval",
  "approved",
  "rejected",
  "sent",
  "completed",
  "cancelled",
]);
export const actorTypeEnum = pgEnum("actor_type", ["user", "agent", "system"]);
export const impactEntryTypeEnum = pgEnum("impact_entry_type", [
  "fee_recovered",
  "duplicate_charge_refunded",
  "unexplained_fee_reversed",
  "cost_avoided",
  "rent_recovered",
  "deposit_recovered",
  "other",
]);
export const confidenceLevelEnum = pgEnum("confidence_level", ["low", "medium", "high"]);
export const dossierStatusEnum = pgEnum("dossier_status", ["draft", "finalized", "archived"]);
export const obligationTypeEnum = pgEnum("obligation_type", [
  "lease_renewal",
  "insurance_renewal",
  "loan_arm_reset",
  "loan_maturity",
  "pm_agreement_renewal",
  "tax_deadline",
  "license_renewal",
  "other",
]);
export const obligationStatusEnum = pgEnum("obligation_status", ["pending", "done", "dismissed"]);
export const llmCallPurposeEnum = pgEnum("llm_call_purpose", [
  "classify",
  "extract",
  "narrate",
  "draft",
]);
export const llmCallStatusEnum = pgEnum("llm_call_status", ["success", "error"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Drives the inbound email alias: <slug>@in.<domain>
  slug: text("slug").notNull().unique(),
  plan: workspacePlanEnum("plan").notNull().default("free"),
  // Stripe billing (slice 6). Null until a Checkout session completes; the
  // webhook handler keeps plan/status/doors in sync from subscription events.
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").notNull().default("none"),
  // Total doors last reported to / received from Stripe (per-door pricing).
  billableDoors: integer("billable_doors"),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    fullName: text("full_name"),
    role: userRoleEnum("role").notNull().default("owner"),
    // Populated once Clerk/WorkOS is wired; null until then.
    externalAuthId: text("external_auth_id").unique(),
    ...timestamps,
  },
  (t) => [index("users_workspace_idx").on(t.workspaceId)],
);

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    entityType: entityTypeEnum("entity_type").notNull().default("llc"),
    state: text("state"),
    ein: text("ein"),
    ...timestamps,
  },
  (t) => [index("entities_workspace_idx").on(t.workspaceId)],
);

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(),
    propertyType: propertyTypeEnum("property_type").notNull().default("sfr"),
    status: propertyStatusEnum("status").notNull().default("active"),
    purchasePriceCents: bigint("purchase_price_cents", { mode: "number" }),
    purchaseDate: date("purchase_date"),
    currentValueCents: bigint("current_value_cents", { mode: "number" }),
    ...timestamps,
  },
  (t) => [index("properties_workspace_idx").on(t.workspaceId)],
);

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    bedrooms: doublePrecision("bedrooms"),
    bathrooms: doublePrecision("bathrooms"),
    sqft: integer("sqft"),
    marketRentCents: bigint("market_rent_cents", { mode: "number" }),
    status: unitStatusEnum("status").notNull().default("vacant"),
    ...timestamps,
  },
  (t) => [
    index("units_workspace_idx").on(t.workspaceId),
    index("units_property_idx").on(t.propertyId),
  ],
);

export const loans = pgTable(
  "loans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    lenderName: text("lender_name"),
    loanType: loanTypeEnum("loan_type").notNull().default("fixed"),
    originalPrincipalCents: bigint("original_principal_cents", { mode: "number" }).notNull(),
    currentBalanceCents: bigint("current_balance_cents", { mode: "number" }),
    interestRateBps: integer("interest_rate_bps").notNull(),
    termMonths: integer("term_months").notNull(),
    startDate: date("start_date"),
    monthlyPaymentCents: bigint("monthly_payment_cents", { mode: "number" }),
    escrowMonthlyCents: bigint("escrow_monthly_cents", { mode: "number" }),
    armResetDate: date("arm_reset_date"),
    ...timestamps,
  },
  (t) => [
    index("loans_workspace_idx").on(t.workspaceId),
    index("loans_property_idx").on(t.propertyId),
  ],
);

export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    carrier: text("carrier").notNull(),
    policyNumber: text("policy_number"),
    policyType: policyTypeEnum("policy_type").notNull().default("landlord_dwelling"),
    annualPremiumCents: bigint("annual_premium_cents", { mode: "number" }).notNull(),
    coverageCents: bigint("coverage_cents", { mode: "number" }),
    renewalDate: date("renewal_date"),
    ...timestamps,
  },
  (t) => [
    index("policies_workspace_idx").on(t.workspaceId),
    index("policies_property_idx").on(t.propertyId),
  ],
);

export const leases = pgTable(
  "leases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    tenantName: text("tenant_name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    rentCents: bigint("rent_cents", { mode: "number" }).notNull(),
    depositCents: bigint("deposit_cents", { mode: "number" }),
    status: leaseStatusEnum("status").notNull().default("draft"),
    ...timestamps,
  },
  (t) => [
    index("leases_workspace_idx").on(t.workspaceId),
    index("leases_unit_idx").on(t.unitId),
  ],
);

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trade: text("trade"),
    phone: text("phone"),
    email: text("email"),
    ...timestamps,
  },
  (t) => [index("vendors_workspace_idx").on(t.workspaceId)],
);

export const pmAgreements = pgTable(
  "pm_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    pmCompanyName: text("pm_company_name").notNull(),
    // Management fee as basis points of collected rent (800 = 8.00%).
    feeBps: integer("fee_bps").notNull(),
    leasingFeeCents: bigint("leasing_fee_cents", { mode: "number" }),
    renewalFeeCents: bigint("renewal_fee_cents", { mode: "number" }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    documentId: uuid("document_id"),
    ...timestamps,
  },
  (t) => [
    index("pm_agreements_workspace_idx").on(t.workspaceId),
    index("pm_agreements_property_idx").on(t.propertyId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    documentType: documentTypeEnum("document_type").notNull().default("other"),
    source: documentSourceEnum("source").notNull().default("upload"),
    status: documentStatusEnum("status").notNull().default("received"),
    storageKey: text("storage_key"),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size"),
    sha256: text("sha256"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_workspace_idx").on(t.workspaceId),
    index("documents_property_idx").on(t.propertyId),
    uniqueIndex("documents_workspace_sha256_idx").on(t.workspaceId, t.sha256),
  ],
);

export const extractions = pgTable(
  "extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // Zod schema name/version the payload was validated against.
    schemaVersion: text("schema_version").notNull(),
    // Model + prompt version, e.g. "claude-sonnet-5/pm-statement-v2".
    extractor: text("extractor").notNull(),
    payload: jsonb("payload").notNull(),
    confidence: doublePrecision("confidence"),
    status: extractionStatusEnum("status").notNull().default("pending"),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("extractions_workspace_idx").on(t.workspaceId),
    index("extractions_document_idx").on(t.documentId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    transactionDate: date("transaction_date").notNull(),
    description: text("description").notNull(),
    // Signed: income positive, expense negative.
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    category: transactionCategoryEnum("category").notNull().default("other_expense"),
    source: transactionSourceEnum("source").notNull().default("manual"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_workspace_idx").on(t.workspaceId),
    index("transactions_property_idx").on(t.propertyId),
    index("transactions_workspace_date_idx").on(t.workspaceId, t.transactionDate),
    uniqueIndex("transactions_workspace_external_idx").on(t.workspaceId, t.externalId),
  ],
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
    category: transactionCategoryEnum("category").notNull(),
    month: date("month").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("budget_lines_unique_idx").on(t.workspaceId, t.propertyId, t.category, t.month),
  ],
);

export const actualLines = pgTable(
  "actual_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
    category: transactionCategoryEnum("category").notNull(),
    month: date("month").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    source: transactionSourceEnum("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("actual_lines_workspace_idx").on(t.workspaceId),
    uniqueIndex("actual_lines_unique_idx").on(t.workspaceId, t.propertyId, t.category, t.month),
  ],
);

export type ExceptionEvidence = {
  documentId?: string;
  transactionId?: string;
  page?: number;
  bbox?: [number, number, number, number];
  note?: string;
};

export const exceptions = pgTable(
  "exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    // Deterministic rule that fired, e.g. "fee_drift_v1".
    ruleId: text("rule_id").notNull(),
    // Month (first-of-month date) the finding belongs to; rules that span
    // periods (e.g. work-order aging) use the last-seen month.
    month: date("month"),
    // sha256 of rule + property + month + sorted evidence ids. Re-running
    // reconciliation upserts open exceptions instead of duplicating them.
    fingerprint: text("fingerprint").notNull().default(""),
    severity: exceptionSeverityEnum("severity").notNull().default("warning"),
    dollarImpactCents: bigint("dollar_impact_cents", { mode: "number" }).notNull().default(0),
    // Deterministic one-line finding, e.g. "Management fee $290.00 vs $232.00 expected (8% of collected income)".
    summary: text("summary").notNull().default(""),
    status: exceptionStatusEnum("status").notNull().default("open"),
    evidence: jsonb("evidence").$type<ExceptionEvidence[]>().notNull().default([]),
    recommendedAction: text("recommended_action"),
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("exceptions_workspace_idx").on(t.workspaceId),
    index("exceptions_property_idx").on(t.propertyId),
    index("exceptions_workspace_status_idx").on(t.workspaceId, t.status),
    uniqueIndex("exceptions_fingerprint_idx").on(
      t.workspaceId,
      t.propertyId,
      t.ruleId,
      t.month,
      t.fingerprint,
    ),
  ],
);

// One generated Owner Review per property per month. `figures` is the exact
// engine-output snapshot the narrative was grounded in — every number in
// `narrative` must trace back to it (the LLM never computes numbers).
export const monthlyReviews = pgTable(
  "monthly_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    narrative: text("narrative").notNull(),
    figures: jsonb("figures").notNull().default({}),
    // e.g. "mock-deterministic-v1/review-narrative-v1"
    generator: text("generator").notNull(),
    // True when the generated text failed the groundedness check and the
    // deterministic template was stored instead.
    usedFallback: boolean("used_fallback").notNull().default(false),
    generatedBy: uuid("generated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("monthly_reviews_workspace_idx").on(t.workspaceId),
    uniqueIndex("monthly_reviews_unique_idx").on(t.workspaceId, t.propertyId, t.month),
  ],
);

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    exceptionId: uuid("exception_id").references(() => exceptions.id, { onDelete: "set null" }),
    actionType: actionTypeEnum("action_type").notNull(),
    title: text("title").notNull(),
    // Email body, recipients, quote scope — whatever the Coordinator drafted.
    draftPayload: jsonb("draft_payload").notNull().default({}),
    status: actionStatusEnum("status").notNull().default("pending_approval"),
    dollarAmountCents: bigint("dollar_amount_cents", { mode: "number" }),
    createdBy: actorTypeEnum("created_by").notNull().default("agent"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("actions_workspace_idx").on(t.workspaceId),
    index("actions_workspace_status_idx").on(t.workspaceId, t.status),
  ],
);

export const impactLedgerEntries = pgTable(
  "impact_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    exceptionId: uuid("exception_id").references(() => exceptions.id, { onDelete: "set null" }),
    actionId: uuid("action_id").references(() => actions.id, { onDelete: "set null" }),
    entryType: impactEntryTypeEnum("entry_type").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    // Counts toward the ledger total only after the owner confirms the outcome.
    confirmed: boolean("confirmed").notNull().default(false),
    description: text("description").notNull(),
    occurredOn: date("occurred_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("impact_ledger_workspace_idx").on(t.workspaceId),
    index("impact_ledger_property_idx").on(t.propertyId),
  ],
);

export const assumptions = pgTable(
  "assumptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
    dossierId: uuid("dossier_id"),
    // e.g. "rent_growth", "vacancy_rate", "exit_cap_rate"
    key: text("key").notNull(),
    valueNum: doublePrecision("value_num"),
    valueText: text("value_text"),
    unit: text("unit"),
    // Where the number came from: URL, document id, "manual", comp source.
    source: text("source").notNull(),
    confidence: confidenceLevelEnum("confidence").notNull().default("medium"),
    version: integer("version").notNull().default(1),
    validFrom: date("valid_from").notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assumptions_workspace_idx").on(t.workspaceId),
    index("assumptions_property_idx").on(t.propertyId),
    index("assumptions_dossier_idx").on(t.dossierId),
    uniqueIndex("assumptions_version_idx").on(t.workspaceId, t.propertyId, t.key, t.version),
    // propertyId is null for dossier-scoped rows, which the index above
    // treats as distinct — so dossier versions get their own partial index.
    uniqueIndex("assumptions_dossier_version_idx")
      .on(t.workspaceId, t.dossierId, t.key, t.version)
      .where(sql`${t.dossierId} is not null`),
  ],
);

export const dossiers = pgTable(
  "dossiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    listingUrl: text("listing_url"),
    // The listing document (uploaded PDF or pasted text) the assumptions were
    // extracted from; null for fully manual dossiers.
    sourceDocumentId: uuid("source_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    // Snapshot of the pro forma output, computed by the finance engine only.
    payload: jsonb("payload").notNull().default({}),
    // Formula set version that produced `payload`, e.g. "finance-v1".
    financeVersion: text("finance_version").notNull(),
    status: dossierStatusEnum("status").notNull().default("draft"),
    // Token-gated public read-only link (/share/dossiers/<token>). Null = not shared.
    shareToken: text("share_token"),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("dossiers_workspace_idx").on(t.workspaceId),
    uniqueIndex("dossiers_share_token_idx").on(t.shareToken),
  ],
);

export const obligations = pgTable(
  "obligations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
    obligationType: obligationTypeEnum("obligation_type").notNull(),
    // Polymorphic pointer to the lease / policy / loan / pm_agreement row.
    relatedId: uuid("related_id"),
    dueDate: date("due_date").notNull(),
    noticeDays: integer("notice_days").notNull().default(60),
    status: obligationStatusEnum("status").notNull().default("pending"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("obligations_workspace_idx").on(t.workspaceId),
    index("obligations_workspace_due_idx").on(t.workspaceId, t.dueDate),
    // One obligation per source row (lease/policy/agreement) so the
    // derivation sync can upsert idempotently.
    uniqueIndex("obligations_source_idx")
      .on(t.workspaceId, t.obligationType, t.relatedId)
      .where(sql`${t.relatedId} is not null`),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorType: actorTypeEnum("actor_type").notNull(),
    // e.g. "action.approved", "document.received", "exception.confirmed"
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_workspace_idx").on(t.workspaceId),
    index("audit_log_workspace_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

// Every LLM call is logged here: prompt version, model, tokens/cost, output hash.
// Cost is integer micro-dollars (1e-6 USD) so fractional-cent calls stay exact.
export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    purpose: llmCallPurposeEnum("purpose").notNull(),
    // "mock" | "gateway" | "anthropic"
    provider: text("provider").notNull(),
    // e.g. "mock-deterministic-v1", "anthropic/claude-sonnet-5"
    model: text("model").notNull(),
    // e.g. "classify-v1", "pm-statement-v1"
    promptVersion: text("prompt_version").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costMicrodollars: bigint("cost_microdollars", { mode: "number" }),
    // sha256 hex of the canonical JSON output, for dedupe and drift detection.
    outputHash: text("output_hash"),
    latencyMs: integer("latency_ms"),
    status: llmCallStatusEnum("status").notNull().default("success"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("llm_calls_workspace_idx").on(t.workspaceId),
    index("llm_calls_document_idx").on(t.documentId),
    index("llm_calls_workspace_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

// Pre-signup marketing capture; intentionally NOT workspace-scoped.
export const waitlist = pgTable(
  "waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    source: text("source").notNull().default("landing"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("waitlist_created_idx").on(t.createdAt)],
);
