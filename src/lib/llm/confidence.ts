// Confidence policy for the verify queue. Pure functions, unit-tested.

export const DEFAULT_REVIEW_THRESHOLD = 0.85;

export function reviewThreshold(): number {
  const raw = process.env.EXTRACTION_REVIEW_THRESHOLD;
  if (!raw) return DEFAULT_REVIEW_THRESHOLD;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1
    ? parsed
    : DEFAULT_REVIEW_THRESHOLD;
}

// Mean of per-field confidences, rounded to 3 decimals for stable storage.
export function overallConfidence(fieldConfidence: Record<string, number>): number {
  const values = Object.values(fieldConfidence);
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(mean * 1000) / 1000;
}

export function lowConfidenceFields(
  fieldConfidence: Record<string, number>,
  threshold = DEFAULT_REVIEW_THRESHOLD,
): string[] {
  return Object.entries(fieldConfidence)
    .filter(([, c]) => c < threshold)
    .map(([name]) => name)
    .sort();
}

// Any field below the threshold sends the extraction to the verify queue.
export function extractionStatusFor(
  fieldConfidence: Record<string, number>,
  threshold = DEFAULT_REVIEW_THRESHOLD,
): "needs_review" | "pending" {
  return lowConfidenceFields(fieldConfidence, threshold).length > 0
    ? "needs_review"
    : "pending";
}
