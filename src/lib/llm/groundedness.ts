// Generic groundedness check for LLM prose: every $ amount or percent the
// model emits must trace back to the payload it was given. Allowed values are
// the payload's *Cents numeric fields plus any $/percent tokens already inside
// its strings (engine-generated summaries are grounded by construction, so
// quoting them verbatim is always safe). Used by the review narrative and the
// Coordinator drafter — the LLM explains and drafts, it never computes.

const MONEY_TOKEN = /-?\$[\d,]+(?:\.\d{1,2})?/g;
const PERCENT_TOKEN = /(\d+(?:\.\d+)?)%/g;

export interface AllowedValues {
  cents: Set<number>;
  percents: Set<number>;
}

export function parseMoneyToken(token: string): number {
  const negative = token.startsWith("-");
  const s = token.replace(/^-?\$/, "").replace(/,/g, "");
  const [dollars, frac = ""] = s.split(".");
  const cents = Number(dollars) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function collectAllowedValues(payload: unknown): AllowedValues {
  const cents = new Set<number>([0]);
  const percents = new Set<number>();

  function walk(value: unknown, key?: string): void {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (key?.endsWith("Cents")) cents.add(value);
      // Ratio fields whose percent form is fair game in prose (0.5 -> 50%).
      if (key === "variancePct") percents.add(Math.round(Math.abs(value) * 100));
      return;
    }
    if (typeof value === "string") {
      for (const m of value.matchAll(MONEY_TOKEN)) cents.add(parseMoneyToken(m[0]));
      for (const m of value.matchAll(PERCENT_TOKEN)) percents.add(Number(m[1]));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v));
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  }
  walk(payload);
  return { cents, percents };
}

// Returns the offending tokens; empty means the text is grounded.
export function findUngroundedTokens(text: string, allowed: AllowedValues): string[] {
  const offenders: string[] = [];
  for (const m of text.matchAll(MONEY_TOKEN)) {
    if (!allowed.cents.has(parseMoneyToken(m[0]))) offenders.push(m[0]);
  }
  for (const m of text.matchAll(PERCENT_TOKEN)) {
    if (!allowed.percents.has(Number(m[1]))) offenders.push(m[0]);
  }
  return [...new Set(offenders)];
}
