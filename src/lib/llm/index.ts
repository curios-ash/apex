import { createAiSdkDocumentLlm, resolveModel } from "./ai-sdk";
import { createMockDocumentLlm } from "./mock";
import type { DocumentLlm } from "./types";

// Provider selection: AI Gateway when AI_GATEWAY_API_KEY is set, direct
// Anthropic when only ANTHROPIC_API_KEY is set, and the deterministic mock
// otherwise — so tests and CI never need credentials.

let cached: DocumentLlm | null = null;

export function getDocumentLlm(): DocumentLlm {
  if (cached) return cached;
  const resolved = resolveModel();
  cached = resolved ? createAiSdkDocumentLlm(resolved) : createMockDocumentLlm();
  return cached;
}

// Test hook: reset the cached provider after changing env vars.
export function resetDocumentLlm(): void {
  cached = null;
}

// Approximate USD per 1M tokens, used only for cost logging (llm-pricing-v1).
// Multiply tokens by these rates to get micro-dollars directly.
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "anthropic/claude-fable-5-1": { input: 5, output: 25 },
  "claude-fable-5-1": { input: 5, output: 25 },
};

export function computeCostMicrodollars(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  const price = PRICE_PER_MTOK[model];
  if (!price || inputTokens === null || outputTokens === null) return null;
  return Math.round(inputTokens * price.input + outputTokens * price.output);
}

export * from "./types";
export { EXTRACTION_SCHEMAS, kindToDocumentType, schemaForVersion } from "./schemas";
export {
  DEFAULT_REVIEW_THRESHOLD,
  extractionStatusFor,
  lowConfidenceFields,
  overallConfidence,
  reviewThreshold,
} from "./confidence";
export {
  REVIEW_PROMPT_VERSION,
  buildTemplateNarrative,
  findUngroundedNumbers,
  getNarrativeLlm,
  resetNarrativeLlm,
  type NarrativeLlm,
  type ReviewFigures,
} from "./narrative";
