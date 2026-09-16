import path from "node:path";

// PDF text extraction via pdf.js (legacy Node build). Text-only: no canvas,
// no rendering. Items are grouped into visual lines by their Y coordinate so
// columnar statements (AppFolio/Buildium style) come out as one line per row,
// which is what the extraction parsers expect.
//
// Dynamic import so the (large) library loads only when a PDF actually
// arrives, and so non-PDF paths never pay for it.

const STANDARD_FONTS = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "standard_fonts",
) + path.sep;

interface PdfTextItem {
  str: string;
  transform: number[];
}

const Y_TOLERANCE = 2;

export async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = getDocument({
      data: bytes,
      isEvalSupported: false,
      standardFontDataUrl: STANDARD_FONTS,
      // Text extraction only — skip the worker (runs in-process).
      disableWorker: true,
    } as Parameters<typeof getDocument>[0]);
    const doc = await loadingTask.promise;
    try {
      const lines: string[] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        const items = (content.items as PdfTextItem[]).filter(
          (item) => typeof item.str === "string",
        );
        // Group by Y (transform[5]); within a line, order by X (transform[4]).
        const rows: { y: number; parts: { x: number; str: string }[] }[] = [];
        for (const item of items) {
          const x = item.transform[4] ?? 0;
          const y = item.transform[5] ?? 0;
          const row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
          if (row) {
            row.parts.push({ x, str: item.str });
          } else {
            rows.push({ y, parts: [{ x, str: item.str }] });
          }
        }
        rows.sort((a, b) => b.y - a.y);
        for (const row of rows) {
          row.parts.sort((a, b) => a.x - b.x);
          const line = row.parts
            .map((p) => p.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          if (line) lines.push(line);
        }
      }
      return lines.length > 0 ? lines.join("\n") : null;
    } finally {
      await loadingTask.destroy();
    }
  } catch (error) {
    console.error("pdf text extraction failed", error);
    return null;
  }
}
