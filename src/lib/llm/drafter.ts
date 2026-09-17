import { generateObject } from "ai";
import { z } from "zod";

import {
  buildTemplateDraft,
  type CoordinatorDraft,
  type DraftContext,
} from "@/coordinator";

import { DEFAULT_EXTRACTION_MODEL, resolveModelFor } from "./ai-sdk";
import type { LlmCallMeta } from "./types";

// The Coordinator's drafting LLM. Like the review narrative, it only ever
// explains engine findings — the context JSON carries every number it may
// use, and callers check the output against that context (groundedness.ts),
// falling back to the deterministic template. The mock provider IS the
// template, so local runs and CI need no credentials.

export const DRAFT_PROMPT_VERSION = "coordinator-draft-v1";
// Same pin as extraction — drafts still go through groundedness fallback.
export const DEFAULT_DRAFT_MODEL = DEFAULT_EXTRACTION_MODEL;

export interface DrafterLlm {
  draft(ctx: DraftContext): Promise<{ draft: CoordinatorDraft; meta: LlmCallMeta }>;
}

function mockDrafterLlm(): DrafterLlm {
  return {
    async draft(ctx) {
      const startedAt = Date.now();
      return {
        draft: buildTemplateDraft(ctx),
        meta: {
          provider: "mock",
          model: "mock-deterministic-v1",
          promptVersion: DRAFT_PROMPT_VERSION,
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - startedAt,
        },
      };
    },
  };
}

const draftSchema = z.object({
  to: z.string().nullable(),
  subject: z.string().nullable(),
  body: z.string(),
});

function aiSdkDrafterLlm(resolved: {
  provider: "gateway" | "anthropic";
  modelId: string;
  model: Parameters<typeof generateObject>[0]["model"];
}): DrafterLlm {
  return {
    async draft(ctx) {
      const startedAt = Date.now();
      const result = await generateObject({
        model: resolved.model,
        schema: draftSchema,
        schemaName: DRAFT_PROMPT_VERSION,
        system: [
          "You are the Coordinator for a rental-property audit tool. You draft PM follow-up",
          "emails, quote requests, and owner reminders into an approval queue. Nothing is ever",
          "sent automatically — a human reviews, edits, and sends from their own mail client.",
          "Every dollar amount and percentage you write MUST appear verbatim in the CONTEXT JSON",
          "below. Never compute, derive, round, or estimate a number.",
          "Cite findings by their bracketed short id, e.g. [a1b2c3d4], and keep the trailing",
          "reference line intact. Be professional, concise, and firm.",
          "Set `to` only when the context contains an email address, otherwise null.",
          "For kind=reminder the draft is an owner-facing note: set to and subject to null.",
        ].join(" "),
        prompt: `CONTEXT JSON:\n${JSON.stringify(ctx, null, 2)}`,
      });
      return {
        draft: result.object as CoordinatorDraft,
        meta: {
          provider: resolved.provider,
          model: resolved.modelId,
          promptVersion: DRAFT_PROMPT_VERSION,
          inputTokens: (result.usage as { inputTokens?: number })?.inputTokens ?? null,
          outputTokens: (result.usage as { outputTokens?: number })?.outputTokens ?? null,
          latencyMs: Date.now() - startedAt,
        },
      };
    },
  };
}

let cached: DrafterLlm | null = null;

export function getDrafterLlm(): DrafterLlm {
  if (cached) return cached;
  const resolved = resolveModelFor("APEX_DRAFT_MODEL", DEFAULT_DRAFT_MODEL);
  cached = resolved ? aiSdkDrafterLlm(resolved) : mockDrafterLlm();
  return cached;
}

// Test hook, mirrors resetNarrativeLlm.
export function resetDrafterLlm(): void {
  cached = null;
}
