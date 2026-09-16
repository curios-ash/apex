import { db } from "@/lib/db";
import { llmCalls } from "@/lib/db/schema";
import { canonicalJson, sha256Hex } from "@/lib/hash";

import { computeCostMicrodollars } from "./index";
import type { LlmCallMeta } from "./types";

// Logs every LLM call (prompt version, model, tokens/cost, output hash).
// Logging must never break ingestion, so failures are swallowed to stderr.
export async function logLlmCall(params: {
  workspaceId: string;
  documentId?: string | null;
  purpose: "classify" | "extract" | "narrate";
  meta: LlmCallMeta;
  output?: unknown;
  error?: string;
}): Promise<void> {
  const { workspaceId, documentId, purpose, meta, output, error } = params;
  try {
    await db.insert(llmCalls).values({
      workspaceId,
      documentId: documentId ?? null,
      purpose,
      provider: meta.provider,
      model: meta.model,
      promptVersion: meta.promptVersion,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      costMicrodollars: computeCostMicrodollars(
        meta.model,
        meta.inputTokens,
        meta.outputTokens,
      ),
      outputHash: error ? null : sha256Hex(canonicalJson(output ?? null)),
      latencyMs: meta.latencyMs,
      status: error ? "error" : "success",
      error: error ?? null,
    });
  } catch (logError) {
    console.error("failed to write llm_calls row", logError);
  }
}
