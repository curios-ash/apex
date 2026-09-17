CREATE TYPE "public"."deal_event_kind" AS ENUM('deal_opened', 'document', 'email', 'note', 'extract', 'dossier_version', 'share');--> statement-breakpoint
ALTER TYPE "public"."property_status" ADD VALUE 'prospecting' BEFORE 'active';--> statement-breakpoint
CREATE TABLE "deal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"kind" "deal_event_kind" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"ref_type" text,
	"ref_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "geocoder" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "inbound_tag" text;--> statement-breakpoint
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_notes" ADD CONSTRAINT "deal_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_notes" ADD CONSTRAINT "deal_notes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_notes" ADD CONSTRAINT "deal_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_events_workspace_idx" ON "deal_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "deal_events_property_created_idx" ON "deal_events" USING btree ("property_id","created_at");--> statement-breakpoint
CREATE INDEX "deal_notes_workspace_idx" ON "deal_notes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "deal_notes_property_idx" ON "deal_notes" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_inbound_tag_idx" ON "properties" USING btree ("workspace_id","inbound_tag") WHERE "properties"."inbound_tag" is not null;