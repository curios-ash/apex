import type { z } from "zod";

import { EXTRACTION_SCHEMAS } from "./schemas";
import type {
  ClassifyInput,
  ClassifyOutput,
  DocumentKind,
  DocumentLlm,
  ExtractInput,
  ExtractOutput,
  LlmCallMeta,
} from "./types";

// Deterministic mock provider. Used whenever no AI_GATEWAY_API_KEY /
// ANTHROPIC_API_KEY is present, so tests and CI never need credentials.
// It is a real (if narrow) rule-based parser: same inputs always produce the
// same outputs and confidences, which is what the golden-file tests pin.

export const MOCK_MODEL_ID = "mock-deterministic-v1";

function meta(promptVersion: string, startedAt: number): LlmCallMeta {
  return {
    provider: "mock",
    model: MOCK_MODEL_ID,
    promptVersion,
    inputTokens: null,
    outputTokens: null,
    latencyMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Parsing primitives
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function parseDateToIso(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(year, Number(m[1]), Number(m[2]));
  }

  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month) return iso(Number(m[3]), month, Number(m[2]));
  }

  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) return iso(Number(m[3]), month, Number(m[1]));
  }

  return null;
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseMoneyToCents(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [dollars, frac = ""] = s.split(".");
  const cents = Number(dollars) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

// ---------------------------------------------------------------------------
// Statement line parsing + category hints
// ---------------------------------------------------------------------------

type Category = (typeof import("./schemas").transactionCategories)[number];

interface ParsedLine {
  date: string | null;
  description: string;
  amountCents: number;
  category: Category | null;
  confidence: number;
}

const LINE_PATTERN =
  /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+(\(?-?\$?[\d,]+\.\d{2}\)?-?)$/;

const OWNER_DRAW_PATTERN =
  /owner (draw|disbursement|distribution)|distribution to owner/i;

const CATEGORY_RULES: [RegExp, Category, number][] = [
  [/management fee|mgmt fee/i, "mgmt_fee", 0.95],
  [/leasing fee/i, "leasing_fee", 0.9],
  [/application fee/i, "application_fee", 0.9],
  [/late fee/i, "late_fee", 0.9],
  [OWNER_DRAW_PATTERN, "other_expense", 0.75],
  [/repair|plumb|hvac|fix\b/i, "repair", 0.85],
  [/landscap|lawn|clean|maintenance|garden/i, "maintenance", 0.85],
  [/utilit|electric|water|gas\b|sewer/i, "utilities", 0.85],
  [/insurance/i, "insurance", 0.9],
  [/property tax|\btax\b/i, "property_tax", 0.85],
  [/\bhoa\b/i, "hoa", 0.9],
  [/legal|attorney/i, "legal", 0.85],
  [/\brent\b/i, "rent", 0.9],
  [/deposit/i, "other_income", 0.6],
];

function categorize(description: string, amountCents: number): [Category | null, number] {
  for (const [pattern, category, confidence] of CATEGORY_RULES) {
    if (pattern.test(description)) {
      // An inbound owner draw on a bank statement is a transfer in, not an expense.
      if (OWNER_DRAW_PATTERN.test(description) && amountCents > 0) {
        return ["other_income", 0.7];
      }
      return [category, confidence];
    }
  }
  return [null, 0.4];
}

function parseStatementLines(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const raw of text.split("\n")) {
    const m = LINE_PATTERN.exec(raw.trim());
    if (!m) continue;
    const amountCents = parseMoneyToCents(m[3]);
    if (amountCents === null) continue;
    const description = m[2]
      .replace(/\s+/g, " ")
      .trim()
      // Buildium-style type column between date and description.
      .replace(/^(receipt|charge|disbursement|payment)\s+/i, "");
    const [category, categoryConfidence] = categorize(description, amountCents);
    lines.push({
      date: parseDateToIso(m[1]),
      description,
      amountCents,
      category,
      confidence: Math.min(0.9, categoryConfidence),
    });
  }
  return lines;
}

function linesConfidence(lines: ParsedLine[]): number {
  if (lines.length === 0) return 0.5;
  return Math.min(...lines.map((l) => l.confidence));
}

function toOutputLines(lines: ParsedLine[]) {
  return lines.map(({ date, description, amountCents, category }) => ({
    date,
    description,
    amountCents,
    category,
  }));
}

// ---------------------------------------------------------------------------
// Shared field finders
// ---------------------------------------------------------------------------

function findBalance(
  text: string,
  kind: "beginning" | "ending",
): { value: number | null; confidence: number } {
  const words = kind === "beginning" ? "beginning|opening" : "ending|closing";
  const m = new RegExp(`(?:${words}) balance[:\\s]+(\\(?-?\\$?[\\d,]+\\.\\d{2}\\)?-?)`, "i").exec(
    text,
  );
  if (!m) return { value: null, confidence: 0.3 };
  return { value: parseMoneyToCents(m[1]), confidence: 0.97 };
}

function findPeriod(text: string): {
  start: string | null;
  end: string | null;
  confidence: number;
} {
  const m =
    /statement (?:period|date range)[:\s]+([^\n–-]+?)\s*[-–]\s*([^\n]+)/i.exec(text);
  if (m) {
    const start = parseDateToIso(m[1]);
    const end = parseDateToIso(m[2]);
    if (start && end) return { start, end, confidence: 0.98 };
  }
  return { start: null, end: null, confidence: 0.3 };
}

function findPropertyAddress(text: string): { value: string | null; confidence: number } {
  const m = /^property[:\s]+(.+)$/im.exec(text);
  if (!m) return { value: null, confidence: 0.3 };
  return { value: m[1].trim(), confidence: 0.95 };
}

function findPmCompany(text: string): { value: string | null; confidence: number } {
  const labeled = /^management company[:\s]+(.+)$/im.exec(text);
  if (labeled) return { value: labeled[1].trim(), confidence: 0.9 };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!/property management/i.test(line)) continue;
    if (/statement|appfolio|buildium|propertyware/i.test(line)) continue;
    if (line.length > 80) continue;
    return { value: line, confidence: 0.85 };
  }
  return { value: null, confidence: 0.3 };
}

function sumMatching(
  lines: ParsedLine[],
  pattern: RegExp,
): { value: number | null; confidence: number } {
  const matching = lines.filter((l) => pattern.test(l.description));
  if (matching.length === 0) return { value: null, confidence: 0.3 };
  const total = matching.reduce((sum, l) => sum + Math.abs(l.amountCents), 0);
  // Summed from line items rather than a labeled total — verify against the source.
  return { value: total, confidence: 0.8 };
}

// ---------------------------------------------------------------------------
// Per-kind extractors
// ---------------------------------------------------------------------------

type Fields = Record<string, unknown>;

function extractPmStatement(text: string): ExtractOutput<Fields> {
  const lines = parseStatementLines(text);
  const period = findPeriod(text);
  const beginning = findBalance(text, "beginning");
  const ending = findBalance(text, "ending");
  const pm = findPmCompany(text);
  const address = findPropertyAddress(text);
  const mgmtFee = sumMatching(lines, /management fee|mgmt fee/i);
  const ownerDraw = sumMatching(lines, OWNER_DRAW_PATTERN);
  return {
    fields: {
      pmCompanyName: pm.value,
      propertyAddress: address.value,
      periodStart: period.start,
      periodEnd: period.end,
      beginningBalanceCents: beginning.value,
      endingBalanceCents: ending.value,
      managementFeeCents: mgmtFee.value,
      ownerDrawCents: ownerDraw.value,
      lines: toOutputLines(lines),
    },
    fieldConfidence: {
      pmCompanyName: pm.confidence,
      propertyAddress: address.confidence,
      periodStart: period.confidence,
      periodEnd: period.confidence,
      beginningBalanceCents: beginning.confidence,
      endingBalanceCents: ending.confidence,
      managementFeeCents: mgmtFee.confidence,
      ownerDrawCents: ownerDraw.confidence,
      lines: linesConfidence(lines),
    },
  };
}

function extractBankStatement(text: string): ExtractOutput<Fields> {
  const lines = parseStatementLines(text);
  const period = findPeriod(text);
  const beginning = findBalance(text, "beginning");
  const ending = findBalance(text, "ending");

  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const bankName = /bank|credit union|savings/i.test(firstLine)
    ? { value: firstLine, confidence: 0.9 }
    : { value: null, confidence: 0.3 };

  const accountMatch =
    /account (?:number|ending)[:\s#]*[*x•]*(\d{4})/i.exec(text) ??
    /\*{2,}(\d{4})/.exec(text);
  const accountLast4 = accountMatch
    ? { value: accountMatch[1], confidence: 0.95 }
    : { value: null, confidence: 0.3 };

  return {
    fields: {
      bankName: bankName.value,
      accountLast4: accountLast4.value,
      periodStart: period.start,
      periodEnd: period.end,
      beginningBalanceCents: beginning.value,
      endingBalanceCents: ending.value,
      lines: toOutputLines(lines),
    },
    fieldConfidence: {
      bankName: bankName.confidence,
      accountLast4: accountLast4.confidence,
      periodStart: period.confidence,
      periodEnd: period.confidence,
      beginningBalanceCents: beginning.confidence,
      endingBalanceCents: ending.confidence,
      lines: linesConfidence(lines),
    },
  };
}

function extractInvoice(text: string): ExtractOutput<Fields> {
  const lines = parseStatementLines(text);

  const numberMatch = /invoice (?:number|no|#)[:\s]*([\w-]+)/i.exec(text);
  const invoiceDateMatch = /invoice date[:\s]+([^\n]+)/i.exec(text);
  const dueDateMatch = /due date[:\s]+([^\n]+)/i.exec(text);
  const totalMatch = /total(?: due)?[:\s]+(\(?-?\$?[\d,]+\.\d{2}\)?-?)/i.exec(text);

  const nonEmpty = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const vendorLine = nonEmpty.find((l) => !/^invoice\b/i.test(l)) ?? null;

  const invoiceDate = invoiceDateMatch ? parseDateToIso(invoiceDateMatch[1]) : null;
  const dueDate = dueDateMatch ? parseDateToIso(dueDateMatch[1]) : null;

  return {
    fields: {
      vendorName: vendorLine,
      invoiceNumber: numberMatch ? numberMatch[1] : null,
      invoiceDate,
      dueDate,
      totalCents: totalMatch ? parseMoneyToCents(totalMatch[1]) : null,
      lines: toOutputLines(lines),
    },
    fieldConfidence: {
      vendorName: vendorLine ? 0.8 : 0.3,
      invoiceNumber: numberMatch ? 0.95 : 0.3,
      invoiceDate: invoiceDate ? 0.95 : 0.3,
      dueDate: dueDate ? 0.95 : 0.3,
      totalCents: totalMatch ? 0.97 : 0.3,
      lines: linesConfidence(lines),
    },
  };
}

function extractLease(text: string): ExtractOutput<Fields> {
  const tenant = /tenant[:\s]+([^\n]+)/i.exec(text);
  const address = /(?:property|premises)[:\s]+([^\n]+)/i.exec(text);
  const unit = /unit[:\s#]+([^\s,]+)/i.exec(text);
  const start = /(?:lease )?(?:term )?(?:start|from)[:\s]+([^\n]+)/i.exec(text);
  const end = /(?:lease )?(?:term )?(?:end|to)[:\s]+([^\n]+)/i.exec(text);
  const rent = /(?:monthly )?rent[:\s]+(\(?\$?[\d,]+\.\d{2}\)?)/i.exec(text);
  const deposit = /(?:security )?deposit[:\s]+(\(?\$?[\d,]+\.\d{2}\)?)/i.exec(text);

  const startDate = start ? parseDateToIso(start[1]) : null;
  const endDate = end ? parseDateToIso(end[1]) : null;

  return {
    fields: {
      tenantName: tenant ? tenant[1].trim() : null,
      propertyAddress: address ? address[1].trim() : null,
      unitLabel: unit ? unit[1].trim() : null,
      startDate,
      endDate,
      rentCents: rent ? parseMoneyToCents(rent[1]) : null,
      depositCents: deposit ? parseMoneyToCents(deposit[1]) : null,
    },
    fieldConfidence: {
      tenantName: tenant ? 0.9 : 0.3,
      propertyAddress: address ? 0.9 : 0.3,
      unitLabel: unit ? 0.85 : 0.3,
      startDate: startDate ? 0.9 : 0.3,
      endDate: endDate ? 0.9 : 0.3,
      rentCents: rent ? 0.95 : 0.3,
      depositCents: deposit ? 0.9 : 0.3,
    },
  };
}

function extractInsurance(text: string): ExtractOutput<Fields> {
  const carrier = /(?:carrier|insurer|insurance company)[:\s]+([^\n]+)/i.exec(text);
  const policyNumber = /policy (?:number|no|#)[:\s]*(\S+)/i.exec(text);
  const premium = /(?:annual )?premium[:\s]+(\(?\$?[\d,]+\.\d{2}\)?)/i.exec(text);
  const coverage = /coverage[:\s]+(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i.exec(text);
  const renewal = /renewal date[:\s]+([^\n]+)/i.exec(text);

  const renewalDate = renewal ? parseDateToIso(renewal[1]) : null;

  return {
    fields: {
      carrier: carrier ? carrier[1].trim() : null,
      policyNumber: policyNumber ? policyNumber[1] : null,
      annualPremiumCents: premium ? parseMoneyToCents(premium[1]) : null,
      coverageCents: coverage ? parseMoneyToCents(coverage[1]) : null,
      renewalDate,
    },
    fieldConfidence: {
      carrier: carrier ? 0.85 : 0.3,
      policyNumber: policyNumber ? 0.95 : 0.3,
      annualPremiumCents: premium ? 0.95 : 0.3,
      coverageCents: coverage ? 0.9 : 0.3,
      renewalDate: renewalDate ? 0.9 : 0.3,
    },
  };
}

function extractListing(text: string): ExtractOutput<Fields> {
  const address = /address[:\s]+([^\n]+)/i.exec(text);
  const price = /(?:list|asking) price[:\s]+\$?([\d,]+)/i.exec(text);
  const beds = /(\d+(?:\.\d+)?)\s*(?:bed|br)\b/i.exec(text);
  const baths = /(\d+(?:\.\d+)?)\s*(?:bath|ba)\b/i.exec(text);
  const sqft = /([\d,]+)\s*sq ?ft/i.exec(text);

  return {
    fields: {
      address: address ? address[1].trim() : null,
      listPriceCents: price ? parseMoneyToCents(`${price[1]}.00`) : null,
      bedrooms: beds ? Number(beds[1]) : null,
      bathrooms: baths ? Number(baths[1]) : null,
      sqft: sqft ? Number(sqft[1].replace(/,/g, "")) : null,
    },
    fieldConfidence: {
      address: address ? 0.85 : 0.3,
      listPriceCents: price ? 0.95 : 0.3,
      bedrooms: beds ? 0.9 : 0.3,
      bathrooms: baths ? 0.9 : 0.3,
      sqft: sqft ? 0.9 : 0.3,
    },
  };
}

const EXTRACTORS: Record<
  string,
  (text: string) => ExtractOutput<Fields>
> = {
  pm_statement: extractPmStatement,
  bank_statement: extractBankStatement,
  invoice: extractInvoice,
  lease: extractLease,
  insurance: extractInsurance,
  listing: extractListing,
};

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

const CLASSIFY_RULES: [DocumentKind, RegExp, number][] = [
  ["pm_statement", /owner statement/i, 3],
  ["pm_statement", /appfolio|buildium|propertyware/i, 3],
  ["pm_statement", /owner (draw|disbursement|distribution)/i, 2],
  ["pm_statement", /property management/i, 1],
  ["pm_statement", /management fee/i, 1],
  ["bank_statement", /bank statement/i, 3],
  ["bank_statement", /deposits and (credits|additions)|withdrawals and (debits|subtractions)/i, 3],
  ["bank_statement", /account (number|ending)/i, 2],
  ["bank_statement", /routing/i, 2],
  ["bank_statement", /beginning balance|opening balance/i, 1],
  ["invoice", /invoice (number|no|#)/i, 3],
  ["invoice", /\binvoice\b/i, 2],
  ["invoice", /amount due|total due|remit to|bill to/i, 2],
  ["lease", /lease agreement|rental agreement/i, 3],
  ["lease", /security deposit/i, 2],
  ["lease", /\btenant\b|\blandlord\b|\blessor\b|\blessee\b/i, 1],
  ["insurance", /declarations page|insurance policy/i, 3],
  ["insurance", /policy (number|period)/i, 2],
  ["insurance", /premium|coverage|insured/i, 1],
  ["listing", /for sale|list price|asking price/i, 3],
  ["listing", /mls#\s*\w+|mls number/i, 3],
  ["listing", /\d\s*(?:bed|br)\b[^\n]*\d\s*(?:bath|ba)\b/i, 2],
  ["listing", /sq ?ft|square feet/i, 1],
];

const FILENAME_RULES: [DocumentKind, RegExp][] = [
  ["pm_statement", /pm[-_. ]?statement|owner[-_. ]?statement/i],
  ["bank_statement", /bank[-_. ]?statement/i],
  ["invoice", /invoice/i],
  ["lease", /lease/i],
  ["insurance", /insurance|policy/i],
  ["listing", /listing/i],
];

function classifyConfidence(score: number): number {
  if (score >= 6) return 0.95;
  if (score >= 4) return 0.88;
  if (score >= 2) return 0.75;
  if (score >= 1) return 0.6;
  return 0.3;
}

export function mockClassify(input: ClassifyInput): ClassifyOutput {
  const scores = new Map<DocumentKind, number>();
  const bump = (kind: DocumentKind, points: number) =>
    scores.set(kind, (scores.get(kind) ?? 0) + points);

  const corpus = `${input.emailSubject ?? ""}\n${input.text?.slice(0, 20000) ?? ""}`;
  for (const [kind, pattern, points] of CLASSIFY_RULES) {
    if (pattern.test(corpus)) bump(kind, points);
  }
  for (const [kind, pattern] of FILENAME_RULES) {
    if (pattern.test(input.filename)) bump(kind, 2);
  }

  let best: DocumentKind = "other";
  let bestScore = 0;
  for (const [kind, score] of scores) {
    if (score > bestScore) {
      best = kind;
      bestScore = score;
    }
  }

  if (bestScore === 0) {
    return { kind: "other", confidence: 0.3, rationale: "mock: no keyword rules matched" };
  }
  return {
    kind: best,
    confidence: classifyConfidence(bestScore),
    rationale: `mock: keyword score ${bestScore}`,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function createMockDocumentLlm(): DocumentLlm {
  return {
    async classify(input) {
      const startedAt = Date.now();
      return { output: mockClassify(input), meta: meta("classify-v1", startedAt) };
    },

    async extract<S extends z.ZodType>(input: ExtractInput, schema: S, schemaVersion: string) {
      const startedAt = Date.now();
      const entry = EXTRACTION_SCHEMAS[input.kind as keyof typeof EXTRACTION_SCHEMAS];
      if (!entry) throw new Error(`mock provider has no extractor for kind ${input.kind}`);

      const extractor = EXTRACTORS[input.kind];
      // Binary document (e.g. PDF) with no decodable text: parse empty text so
      // every field comes back null, then floor confidences so the extraction
      // lands in the verify queue for a human.
      const binary = input.text === null;
      const raw = extractor(input.text ?? "");
      if (binary) {
        raw.fieldConfidence = Object.fromEntries(
          Object.keys(raw.fieldConfidence).map((k) => [k, 0.2]),
        );
      }
      // Guarantee the mock output conforms to the same schema the real
      // provider is constrained to.
      const fields = schema.parse(raw.fields);
      return {
        output: { fields, fieldConfidence: raw.fieldConfidence } as ExtractOutput<z.infer<S>>,
        meta: meta(schemaVersion, startedAt),
      };
    },
  };
}
