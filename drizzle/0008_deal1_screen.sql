ALTER TABLE "workspaces" ADD COLUMN "deal1_subscription_status" "subscription_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
CREATE TABLE "deal1_gates" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"place" text NOT NULL,
	"wide_ceiling_cents" bigint NOT NULL,
	"pass_line_cents" bigint NOT NULL,
	"min_units" integer NOT NULL,
	"max_units" integer NOT NULL,
	"fully_leased_required" boolean NOT NULL,
	"no_heavy_rehab_required" boolean NOT NULL,
	"down_payment_rate" double precision NOT NULL,
	"annual_rate" double precision NOT NULL,
	"dscr_gate" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "deal1_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"address" text NOT NULL,
	"address_norm" text NOT NULL,
	"purchase_price_cents" bigint NOT NULL,
	"purchase_price_source" text NOT NULL,
	"monthly_rent_cents" bigint NOT NULL,
	"monthly_rent_source" text NOT NULL,
	"vacancy_rate" double precision NOT NULL,
	"vacancy_source" text NOT NULL,
	"annual_operating_expenses_cents" bigint NOT NULL,
	"opex_source" text NOT NULL,
	"annual_rate" double precision NOT NULL,
	"annual_rate_source" text NOT NULL,
	"units" integer NOT NULL,
	"units_source" text NOT NULL,
	"fully_leased" boolean NOT NULL,
	"fully_leased_source" text NOT NULL,
	"heavy_rehab" boolean NOT NULL,
	"heavy_rehab_source" text NOT NULL,
	"noi_cents" bigint NOT NULL,
	"dscr" double precision,
	"cash_flow_cents" bigint NOT NULL,
	"annual_debt_service_cents" bigint NOT NULL,
	"price_pass" boolean NOT NULL,
	"dscr_pass" boolean NOT NULL,
	"line_pass" boolean NOT NULL,
	"pass_line_cents" bigint NOT NULL,
	"dscr_gate" double precision NOT NULL,
	"decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "deal1_gates" ADD CONSTRAINT "deal1_gates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal1_checks" ADD CONSTRAINT "deal1_checks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal1_checks_workspace_address_idx" ON "deal1_checks" USING btree ("workspace_id","address_norm");--> statement-breakpoint
CREATE INDEX "deal1_checks_workspace_idx" ON "deal1_checks" USING btree ("workspace_id");