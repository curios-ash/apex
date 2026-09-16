import { NextResponse } from "next/server";

import { ingestDocumentBytes, MAX_DOCUMENT_BYTES } from "@/lib/ingest/ingest";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// Upload a document into the active workspace: stores the file (Vercel Blob
// when BLOB_READ_WRITE_TOKEN is set, local disk otherwise), writes the
// documents row, and runs classify + extract inline.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Send multipart/form-data with a file field." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, message: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      { ok: false, message: `File exceeds the ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB limit.` },
      { status: 413 },
    );
  }

  const propertyIdRaw = form.get("propertyId");
  const propertyId = typeof propertyIdRaw === "string" && propertyIdRaw.length > 0
    ? propertyIdRaw
    : null;

  try {
    const workspace = await getActiveWorkspace();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await ingestDocumentBytes({
      workspaceId: workspace.id,
      filename: file.name || "upload",
      bytes,
      mimeType: file.type || null,
      source: "upload",
      propertyId,
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    console.error("document upload failed", error);
    return NextResponse.json(
      { ok: false, message: "Upload failed. Check the server logs." },
      { status: 500 },
    );
  }
}
