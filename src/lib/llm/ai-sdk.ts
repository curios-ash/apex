import { anthropic } from "@ai-sdk/anthropic";
import { gateway } from "@ai-sdk/gateway";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

import { DOCUMENT_KINDS } from "./types";
import type {
  ClassifyInput,
  ClassifyOutput,
  DocumentLlm,
  ExtractInput,
  ExtractOutput,
  LlmCallMeta,
} from "./types";

// Real provider: Vercel AI SDK through AI Gateway (preferred) or direct
// Anthropic. Selected in index.ts — this module is only constructed when a
// credential is present. The LLM classifies and extracts only; it never
// computes finance numbers.

export const CLASSIFY_PROMPT_VERSION = "classify-v1";

const MAX_TEXT_CHARS = 20_000;

const classifySchema = z.object({
  kind: z.enum(DOCUMENT_KINDS as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

interface ResolvedModel {
  provider: "gateway" | "anthropic";
  modelId: string;
  model: LanguageModel;
}

export function resolveModel(): ResolvedModel | null {
  const modelId = process.env.APEX_LLM_MODEL ?? "anthropic/claude-sonnet-5";
  if (process.env.AI_GATEWAY_API_KEY) {
    return { provider: "gateway", modelId, model: gateway(modelId) };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const directId = modelId.replace(/^anthropic\//, "");
    return { provider: "anthropic", modelId: directId, model: anthropic(directId) };
  }
  return null;
}

function usageTokens(usage: unknown): { input: number | null; output: number | null } {
  const u = usage as
    | {
        inputTokens?: number;
        outputTokens?: number;
        promptTokens?: number;
        completionTokens?: number;
      }
    | undefined;
  return {
    input: u?.inputTokens ?? u?.promptTokens ?? null,
    output: u?.outputTokens ?? u?.completionTokens ?? null,
  };
}

function documentContent(input: ClassifyInput, instructions: string) {
  if (input.text !== null) {
    return `${instructions}\n\nFilename: ${input.filename}\n\n<Document>\n${input.text.slice(0, MAX_TEXT_CHARS)}\n</Document>`;
  }
  if (input.bytes && input.mimeType) {
    return [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: `${instructions}\n\nFilename: ${input.filename}` },
          { type: "file" as const, data: input.bytes, mediaType: input.mimeType },
        ],
      },
    ];
  }
  return `${instructions}\n\nFilename: ${input.filename}\n\n(No decodable content available.)`;
}

export function createAiSdkDocumentLlm(resolved: ResolvedModel): DocumentLlm {
  return {
    async classify(input: ClassifyInput) {
      const startedAt = Date.now();
      const instructions = [
        "You classify documents for a rental-property audit tool.",
        `Choose exactly one kind: ${DOCUMENT_KINDS.join(", ")}.`,
        "pm_statement = property manager owner statement; bank_statement = bank account statement;",
        "invoice = vendor bill; lease = rental/lease agreement; insurance = policy or declarations;",
        "listing = property for-sale listing; other = anything else.",
        "Report confidence 0..1 and a one-sentence rationale.",
      ].join(" ");
      const content = documentContent(input, instructions);
      const result = await generateObject({
        model: resolved.model,
        schema: classifySchema,
        ...(typeof content === "string" ? { prompt: content } : { messages: content }),
      });
      const tokens = usageTokens(result.usage);
      const meta: LlmCallMeta = {
        provider: resolved.provider,
        model: resolved.modelId,
        promptVersion: CLASSIFY_PROMPT_VERSION,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        latencyMs: Date.now() - startedAt,
      };
      return { output: result.object as ClassifyOutput, meta };
    },

    async extract<S extends z.ZodType>(input: ExtractInput, schema: S, schemaVersion: string) {
      const startedAt = Date.now();
      const outputSchema = z.object({
        fields: schema,
        fieldConfidence: z.record(z.string(), z.number().min(0).max(1)),
      });
      const instructions = [
        `Extract structured data from this ${input.kind} document.`,
        "Money must be integer cents (e.g. $1,234.56 -> 123456), signed: income positive, expenses negative.",
        "Dates must be ISO yyyy-mm-dd. Use null for any field the document does not state — never guess.",
        "For every top-level field, report fieldConfidence 0..1 (1 = stated verbatim, lower = inferred).",
      ].join(" ");
      const content = documentContent(input, instructions);
      const result = await generateObject({
        model: resolved.model,
        schema: outputSchema,
        schemaName: schemaVersion,
        ...(typeof content === "string" ? { prompt: content } : { messages: content }),
      });
      const tokens = usageTokens(result.usage);
      const meta: LlmCallMeta = {
        provider: resolved.provider,
        model: resolved.modelId,
        promptVersion: schemaVersion,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        latencyMs: Date.now() - startedAt,
      };
      return {
        output: result.object as ExtractOutput<z.infer<S>>,
        meta,
      };
    },
  };
}
