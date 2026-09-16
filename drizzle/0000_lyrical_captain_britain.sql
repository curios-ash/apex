CREATE TYPE "public"."action_status" AS ENUM('draft', 'approved', 'rejected', 'sent', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."action_type" AS ENUM('email_pm', 'request_quote', 'reminder', 'ledger_adjustment', 'call_pm', 'other');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."document_source" AS ENUM('email', 'upload', 'manual');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('received', 'classified', 'extracting', 'extracted', 'reconciled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('pm_statement', 'bank_statement', 'invoice', 'lease', 'insurance_policy', 'listing', 'management_agreement', 'tax', 'other');--> statement-breakpoint
CREATE TYPE "public"."dossier_status" AS ENUM('draft', 'finalized', 'archived');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('personal', 'llc', 's_corp', 'c_corp', 'partnership', 'trust');--> statement-breakpoint
CREATE TYPE "public"."exception_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."exception_status" AS ENUM('open', 'confirmed', 'dismissed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('pending', 'needs_review', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."impact_entry_type" AS ENUM('fee_recovered', 'duplicate_charge_refunded', 'unexplained_fee_reversed', 'cost_avoided', 'rent_recovered', 'deposit_recovered', 'other');--> statement-breakpoint
CREATE TYPE "public"."lease_status" AS ENUM('draft', 'active', 'month_to_month', 'expired', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."loan_type" AS ENUM('fixed', 'arm', 'interest_only', 'heloc', 'balloon');--> statement-breakpoint
CREATE TYPE "public"."obligation_status" AS ENUM('pending', 'done', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."obligation_type" AS ENUM('lease_renewal', 'insurance_renewal', 'loan_arm_reset', 'loan_maturity', 'pm_agreement_renewal', 'tax_deadline', 'license_renewal', 'other');--> statement-breakpoint
CREATE TYPE "public"."policy_type" AS ENUM('landlord_dwelling', 'umbrella', 'flood', 'earthquake', 'liability', 'other');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('active', 'under_contract', 'sold', 'archived');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('sfr', 'condo', 'townhome', 'duplex', 'triplex', 'fourplex', 'multi_5plus');--> statement-breakpoint
CREATE TYPE "public"."transaction_category" AS ENUM('rent', 'late_fee', 'application_fee', 'other_income', 'mgmt_fee', 'leasing_fee', 'repair', 'maintenance', 'capex', 'turnover', 'utilities', 'hoa', 'property_tax', 'insurance', 'mortgage_principal', 'mortgage_interest', 'escrow', 'legal', 'marketing', 'other_expense');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('bank', 'pm_statement', 'manual');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('vacant', 'occupied', 'turn', 'down');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'member', 'cpa');--> statement-breakpoint
CREATE TYPE "public"."workspace_plan" AS ENUM('free', 'owner', 'portfolio');--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"exception_id" uuid,
	"action_type" "action_type" NOT NULL,
	"title" text NOT NULL,
	"draft_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "action_status" DEFAULT 'draft' NOT NULL,
	"dollar_amount_cents" bigint,
	"created_by" "actor_type" DEFAULT 'agent' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actual_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"category" "transaction_category" NOT NULL,
	"month" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"source" "transaction_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"dossier_id" uuid,
	"key" text NOT NULL,
	"value_num" double precision,
	"value_text" text,
	"unit" text,
	"source" text NOT NULL,
	"confidence" "confidence_level" DEFAULT 'medium' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"valid_from" date DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"category" "transaction_category" NOT NULL,
	"month" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"document_type" "document_type" DEFAULT 'other' NOT NULL,
	"source" "document_source" DEFAULT 'upload' NOT NULL,
	"status" "document_status" DEFAULT 'received' NOT NULL,
	"storage_key" text,
	"original_filename" text,
	"mime_type" text,
	"byte_size" integer,
	"sha256" text,
	"period_start" date,
	"period_end" date,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"title" text NOT NULL,
	"listing_url" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"finance_version" text NOT NULL,
	"status" "dossier_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"entity_type" "entity_type" DEFAULT 'llc' NOT NULL,
	"state" text,
	"ein" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"rule_id" text NOT NULL,
	"severity" "exception_severity" DEFAULT 'warning' NOT NULL,
	"dollar_impact_cents" bigint DEFAULT 0 NOT NULL,
	"status" "exception_status" DEFAULT 'open' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_action" text,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"schema_version" text NOT NULL,
	"extractor" text NOT NULL,
	"payload" jsonb NOT NULL,
	"confidence" double precision,
	"status" "extraction_status" DEFAULT 'pending' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impact_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"exception_id" uuid,
	"action_id" uuid,
	"entry_type" "impact_entry_type" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"description" text NOT NULL,
	"occurred_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"tenant_name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"rent_cents" bigint NOT NULL,
	"deposit_cents" bigint,
	"status" "lease_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"lender_name" text,
	"loan_type" "loan_type" DEFAULT 'fixed' NOT NULL,
	"original_principal_cents" bigint NOT NULL,
	"current_balance_cents" bigint,
	"interest_rate_bps" integer NOT NULL,
	"term_months" integer NOT NULL,
	"start_date" date,
	"monthly_payment_cents" bigint,
	"escrow_monthly_cents" bigint,
	"arm_reset_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"obligation_type" "obligation_type" NOT NULL,
	"related_id" uuid,
	"due_date" date NOT NULL,
	"notice_days" integer DEFAULT 60 NOT NULL,
	"status" "obligation_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"pm_company_name" text NOT NULL,
	"fee_bps" integer NOT NULL,
	"leasing_fee_cents" bigint,
	"renewal_fee_cents" bigint,
	"start_date" date,
	"end_date" date,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"carrier" text NOT NULL,
	"policy_number" text,
	"policy_type" "policy_type" DEFAULT 'landlord_dwelling' NOT NULL,
	"annual_premium_cents" bigint NOT NULL,
	"coverage_cents" bigint,
	"renewal_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_id" uuid,
	"name" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"property_type" "property_type" DEFAULT 'sfr' NOT NULL,
	"status" "property_status" DEFAULT 'active' NOT NULL,
	"purchase_price_cents" bigint,
	"purchase_date" date,
	"current_value_cents" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"unit_id" uuid,
	"document_id" uuid,
	"transaction_date" date NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"category" "transaction_category" DEFAULT 'other_expense' NOT NULL,
	"source" "transaction_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"label" text NOT NULL,
	"bedrooms" double precision,
	"bathrooms" double precision,
	"sqft" integer,
	"market_rent_cents" bigint,
	"status" "unit_status" DEFAULT 'vacant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"external_auth_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_external_auth_id_unique" UNIQUE("external_auth_id")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trade" text,
	"phone" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'landing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" "workspace_plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_exception_id_exceptions_id_fk" FOREIGN KEY ("exception_id") REFERENCES "public"."exceptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_lines" ADD CONSTRAINT "actual_lines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_lines" ADD CONSTRAINT "actual_lines_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumptions" ADD CONSTRAINT "assumptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumptions" ADD CONSTRAINT "assumptions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_ledger_entries" ADD CONSTRAINT "impact_ledger_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_ledger_entries" ADD CONSTRAINT "impact_ledger_entries_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_ledger_entries" ADD CONSTRAINT "impact_ledger_entries_exception_id_exceptions_id_fk" FOREIGN KEY ("exception_id") REFERENCES "public"."exceptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_ledger_entries" ADD CONSTRAINT "impact_ledger_entries_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_agreements" ADD CONSTRAINT "pm_agreements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_agreements" ADD CONSTRAINT "pm_agreements_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_workspace_idx" ON "actions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "actions_workspace_status_idx" ON "actions" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "actual_lines_workspace_idx" ON "actual_lines" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "actual_lines_unique_idx" ON "actual_lines" USING btree ("workspace_id","property_id","category","month");--> statement-breakpoint
CREATE INDEX "assumptions_workspace_idx" ON "assumptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "assumptions_property_idx" ON "assumptions" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assumptions_version_idx" ON "assumptions" USING btree ("workspace_id","property_id","key","version");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_idx" ON "audit_log" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_created_idx" ON "audit_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_lines_unique_idx" ON "budget_lines" USING btree ("workspace_id","property_id","category","month");--> statement-breakpoint
CREATE INDEX "documents_workspace_idx" ON "documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "documents_property_idx" ON "documents" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_workspace_sha256_idx" ON "documents" USING btree ("workspace_id","sha256");--> statement-breakpoint
CREATE INDEX "dossiers_workspace_idx" ON "dossiers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "entities_workspace_idx" ON "entities" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "exceptions_workspace_idx" ON "exceptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "exceptions_property_idx" ON "exceptions" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "exceptions_workspace_status_idx" ON "exceptions" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "extractions_workspace_idx" ON "extractions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "extractions_document_idx" ON "extractions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "impact_ledger_workspace_idx" ON "impact_ledger_entries" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "impact_ledger_property_idx" ON "impact_ledger_entries" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "leases_workspace_idx" ON "leases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "leases_unit_idx" ON "leases" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "loans_workspace_idx" ON "loans" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "loans_property_idx" ON "loans" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "obligations_workspace_idx" ON "obligations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "obligations_workspace_due_idx" ON "obligations" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE INDEX "pm_agreements_workspace_idx" ON "pm_agreements" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pm_agreements_property_idx" ON "pm_agreements" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "policies_workspace_idx" ON "policies" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "policies_property_idx" ON "policies" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "properties_workspace_idx" ON "properties" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "transactions_workspace_idx" ON "transactions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "transactions_property_idx" ON "transactions" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "transactions_workspace_date_idx" ON "transactions" USING btree ("workspace_id","transaction_date");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_workspace_external_idx" ON "transactions" USING btree ("workspace_id","external_id");--> statement-breakpoint
CREATE INDEX "units_workspace_idx" ON "units" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "units_property_idx" ON "units" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "users_workspace_idx" ON "users" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "vendors_workspace_idx" ON "vendors" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "waitlist_created_idx" ON "waitlist" USING btree ("created_at");