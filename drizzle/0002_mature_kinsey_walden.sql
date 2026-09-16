ALTER TYPE "public"."llm_call_purpose" ADD VALUE 'narrate';--> statement-breakpoint
CREATE TABLE "monthly_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"month" date NOT NULL,
	"narrative" text NOT NULL,
	"figures" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generator" text NOT NULL,
	"used_fallback" boolean DEFAULT false NOT NULL,
	"generated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exceptions" ADD COLUMN "month" date;--> statement-breakpoint
ALTER TABLE "exceptions" ADD COLUMN "fingerprint" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "exceptions" ADD COLUMN "summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_reviews" ADD CONSTRAINT "monthly_reviews_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reviews" ADD CONSTRAINT "monthly_reviews_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reviews" ADD CONSTRAINT "monthly_reviews_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monthly_reviews_workspace_idx" ON "monthly_reviews" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_reviews_unique_idx" ON "monthly_reviews" USING btree ("workspace_id","property_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "exceptions_fingerprint_idx" ON "exceptions" USING btree ("workspace_id","property_id","rule_id","month","fingerprint");