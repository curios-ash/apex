const TEXTUAL_EXTENSIONS = new Set(["txt", "csv", "md", "json", "eml", "text"]);
const TEXTUAL_MIME_PREFIXES = ["text/"];
const TEXTUAL_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/csv",
  "application/rtf",
]);

const MAX_TEXT_CHARS = 200_000;

// Decodes text-like files to a string for the LLM pipeline. Binary formats
// (PDF, images) return null — the real provider receives the raw bytes
// instead, and the mock marks the extraction low-confidence for review.
export function extractTextContent(
  bytes: Uint8Array,
  mimeType: string | null,
  filename: string,
): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeType?.toLowerCase() ?? "";
  const textual =
    TEXTUAL_EXTENSIONS.has(ext) ||
    TEXTUAL_MIME_PREFIXES.some((p) => mime.startsWith(p)) ||
    TEXTUAL_MIME_TYPES.has(mime);
  if (!textual) return null;
  const decoded = Buffer.from(bytes).toString("utf8");
  return decoded.slice(0, MAX_TEXT_CHARS);
}
