import { describe, expect, it } from "vitest";

import { buildTemplateDraft, type DraftContext } from "@/coordinator";

import { DRAFT_PROMPT_VERSION, getDrafterLlm, resetDrafterLlm } from "./drafter";

const CTX: DraftContext = {
  kind: "email_pm",
  propertyName: "421 Maple Street",
  pmCompanyName: "Sunset Property Management",
  exceptions: [
    {
      id: "11111111-2222-3333-4444-555555555555",
      shortId: "11111111",
      ruleId: "fee_drift_v1",
      severity: "warning",
      month: "2026-03-01",
      dollarImpactCents: 5_800,
      summary: "Management fee $290.00 vs $232.00 expected (8.00% of $2,900.00 collected income)",
      recommendedAction: "Ask Sunset Property Management for a credit of $58.00.",
    },
  ],
  obligation: null,
};

describe("getDrafterLlm", () => {
  it("uses the mock template provider when no API key is set", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    resetDrafterLlm();
    const llm = getDrafterLlm();
    const { draft, meta } = await llm.draft(CTX);
    expect(meta.provider).toBe("mock");
    expect(meta.promptVersion).toBe(DRAFT_PROMPT_VERSION);
    expect(draft).toEqual(buildTemplateDraft(CTX));
  });
});
