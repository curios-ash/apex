ALTER TYPE "public"."llm_call_purpose" ADD VALUE 'draft';--> statement-breakpoint
ALTER TYPE "public"."action_status" RENAME VALUE 'draft' TO 'pending_approval';--> statement-breakpoint
CREATE UNIQUE INDEX "obligations_source_idx" ON "obligations" USING btree ("workspace_id","obligation_type","related_id") WHERE "obligations"."related_id" is not null;