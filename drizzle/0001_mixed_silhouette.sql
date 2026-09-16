CREATE TYPE "public"."llm_call_purpose" AS ENUM('classify', 'extract');--> statement-breakpoint
CREATE TYPE "public"."llm_call_status" AS ENUM('success', 'error');--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid,
	"purpose" "llm_call_purpose" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_microdollars" bigint,
	"output_hash" text,
	"latency_ms" integer,
	"status" "llm_call_status" DEFAULT 'success' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_calls_workspace_idx" ON "llm_calls" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "llm_calls_document_idx" ON "llm_calls" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "llm_calls_workspace_created_idx" ON "llm_calls" USING btree ("workspace_id","created_at");