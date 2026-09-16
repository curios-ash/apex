import { extractPdfText } from "@/lib/pdf";

const TEXTUAL_EXTENSIONS = new Set(["txt", "csv", "md", "json", "eml", "text"]);
const TEXTUAL_MIME_PREFIXES = ["text/"];
const TEXTUAL_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/csv",
  "application/rtf",
]);

const MAX_TEXT_CHARS = 200_000;

function isPdf(mimeType: string, ext: string): boolean {
  return ext === "pdf" || mimeType === "application/pdf";
}

// Decodes a document to text for the LLM pipeline. Text-like files decode
// directly; PDFs go through local text extraction (pdf.js). Anything else
// (scanned PDFs with no text layer, images) returns null — the real provider
// receives the raw bytes instead, and the mock marks the extraction
// low-confidence for review.
export async function extractTextContent(
  bytes: Uint8Array,
  mimeType: string | null,
  filename: string,
): Promise<string | null> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeType?.toLowerCase() ?? "";

  if (isPdf(mime, ext)) {
    const text = await extractPdfText(bytes);
    return text ? text.slice(0, MAX_TEXT_CHARS) : null;
  }

  const textual =
    TEXTUAL_EXTENSIONS.has(ext) ||
    TEXTUAL_MIME_PREFIXES.some((p) => mime.startsWith(p)) ||
    TEXTUAL_MIME_TYPES.has(mime);
  if (!textual) return null;
  const decoded = Buffer.from(bytes).toString("utf8");
  return decoded.slice(0, MAX_TEXT_CHARS);
}
