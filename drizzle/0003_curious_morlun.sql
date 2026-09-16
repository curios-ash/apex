ALTER TABLE "dossiers" ADD COLUMN "source_document_id" uuid;--> statement-breakpoint
ALTER TABLE "dossiers" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "dossiers" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assumptions_dossier_idx" ON "assumptions" USING btree ("dossier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assumptions_dossier_version_idx" ON "assumptions" USING btree ("workspace_id","dossier_id","key","version") WHERE "assumptions"."dossier_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "dossiers_share_token_idx" ON "dossiers" USING btree ("share_token");