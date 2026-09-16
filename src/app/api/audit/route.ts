import { NextResponse } from "next/server";

import { auditStatement, type AuditLine } from "@/audit";
import { extractTextContent } from "@/lib/ingest/text";
import { EXTRACTION_SCHEMAS, getDocumentLlm } from "@/lib/llm";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// The free PM Statement Audit. Anonymous by design: the statement is
// processed in memory in this request and never written to the database or
// file storage — no documents row, no extraction row, nothing to delete
// afterwards. Rate-limited by IP.

export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_HOUR = 10;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const ip = clientIp(request);
  const limit = rateLimit(`audit:${ip}`, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: `That's ${RATE_LIMIT_PER_HOUR} audits this hour from your address — the free tool is rate-limited. Join the waitlist and we'll audit every statement, every month.`,
      },
      { status: 429, headers: { "retry-after": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "Send the statement as a file upload or pasted text.");
  }

  const feeRaw = String(formData.get("feePercent") ?? "").trim();
  const feePercent = Number(feeRaw.replace(/[%\s]/g, ""));
  if (!Number.isFinite(feePercent) || feePercent <= 0 || feePercent > 25) {
    return jsonError(400, "Enter the management fee from your agreement, e.g. 8 for 8%.");
  }
  const feeBps = Math.round(feePercent * 100);

  // Resolve the statement text: uploaded file (PDF or text) or pasted text.
  let text: string | null = null;
  let filename = "pasted-statement.txt";
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) return jsonError(400, "That file is over the 10 MB limit.");
    filename = file.name || "statement.pdf";
    const bytes = new Uint8Array(await file.arrayBuffer());
    text = await extractTextContent(bytes, file.type || null, filename);
    if (text === null) {
      return jsonError(
        422,
        "We couldn't read text from that PDF — it may be a scan. Paste the statement text instead.",
      );
    }
  } else {
    const pasted = String(formData.get("text") ?? "").trim();
    if (pasted.length < 40) {
      return jsonError(400, "Upload the statement PDF or paste its text (a few lines at least).");
    }
    text = pasted.slice(0, MAX_TEXT_CHARS);
  }

  // The LLM extracts the statement lines; the deterministic engine flags
  // them. No numbers are computed by the model.
  const entry = EXTRACTION_SCHEMAS.pm_statement;
  const llm = getDocumentLlm();
  let extraction;
  try {
    extraction = await llm.extract(
      { filename, text, mimeType: "text/plain", kind: "pm_statement" },
      entry.schema,
      entry.version,
    );
  } catch (error) {
    console.error("audit extraction failed", error);
    return jsonError(500, "Extraction failed on our side. Try again in a moment.");
  }

  const fields = extraction.output.fields as {
    pmCompanyName?: string | null;
    propertyAddress?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    lines?: {
      date: string | null;
      description: string;
      amountCents: number;
      category: AuditLine["category"];
    }[];
  };
  const lines: AuditLine[] = (fields.lines ?? []).map((l) => ({
    date: l.date,
    description: l.description,
    amountCents: l.amountCents,
    category: l.category ?? null,
  }));
  if (lines.length === 0) {
    return jsonError(
      422,
      "That doesn't look like an owner statement — we couldn't find any line items. Check that you uploaded the right document.",
    );
  }

  const result = auditStatement(lines, feeBps);
  const incomeCents = lines.filter((l) => l.amountCents > 0).reduce((s, l) => s + l.amountCents, 0);
  const mgmtFeeCents = lines
    .filter((l) => l.amountCents < 0 && l.category === "mgmt_fee")
    .reduce((s, l) => s + Math.abs(l.amountCents), 0);

  return NextResponse.json({
    ok: true,
    version: result.version,
    elapsedMs: Date.now() - startedAt,
    statement: {
      pmCompanyName: fields.pmCompanyName ?? null,
      propertyAddress: fields.propertyAddress ?? null,
      periodStart: fields.periodStart ?? null,
      periodEnd: fields.periodEnd ?? null,
      lineCount: result.lineCount,
      incomeCents,
      mgmtFeeCents,
      feeBps,
    },
    flags: result.flags,
    totalFlaggedCents: result.totalFlaggedCents,
  });
}
