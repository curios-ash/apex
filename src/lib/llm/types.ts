import type { z } from "zod";

// The LLM classifies and extracts only — it never computes finance numbers.
// Classification kinds are the plan's vocabulary; `kindToDocumentType` in
// schemas.ts maps them onto the documents table enum.

export type DocumentKind =
  | "pm_statement"
  | "bank_statement"
  | "invoice"
  | "lease"
  | "insurance"
  | "listing"
  | "other";

export const DOCUMENT_KINDS: DocumentKind[] = [
  "pm_statement",
  "bank_statement",
  "invoice",
  "lease",
  "insurance",
  "listing",
  "other",
];

export interface ClassifyInput {
  filename: string;
  // Decoded text when the file is text-like; null for binary (e.g. PDF).
  text: string | null;
  mimeType: string | null;
  // Raw bytes so real providers can send PDFs/images to the model.
  bytes?: Uint8Array;
  emailSubject?: string;
}

export interface ClassifyOutput {
  kind: DocumentKind;
  confidence: number;
  rationale: string;
}

export interface ExtractInput extends ClassifyInput {
  kind: Exclude<DocumentKind, "other">;
}

export interface ExtractOutput<TFields> {
  fields: TFields;
  // Per-field confidence, 0..1, keyed by top-level field name.
  fieldConfidence: Record<string, number>;
}

export interface LlmCallMeta {
  // "unknown" when the call threw before the provider produced metadata.
  provider: "mock" | "gateway" | "anthropic" | "unknown";
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface DocumentLlm {
  classify(input: ClassifyInput): Promise<{ output: ClassifyOutput; meta: LlmCallMeta }>;
  extract<S extends z.ZodType>(
    input: ExtractInput,
    schema: S,
    schemaVersion: string,
  ): Promise<{ output: ExtractOutput<z.infer<S>>; meta: LlmCallMeta }>;
}
