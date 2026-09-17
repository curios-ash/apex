import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { readStoredFile } from "@/lib/storage";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// Serves the stored source file for a document (linked from /verify and
// /evidence). Scoped to the active workspace.
export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  const workspace = await getActiveWorkspace();
  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.workspaceId, workspace.id)))
    .limit(1);
  const doc = rows[0];
  if (!doc || !doc.storageKey) {
    return NextResponse.json({ ok: false, message: "Document not found." }, { status: 404 });
  }

  const bytes = await readStoredFile(doc.storageKey);
  if (!bytes) {
    return NextResponse.json(
      { ok: false, message: "Stored file is unavailable." },
      { status: 404 },
    );
  }

  const filename = (doc.originalFilename ?? "document").replace(/"/g, "'");
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": doc.mimeType ?? "application/octet-stream",
      "content-disposition": `inline; filename="${filename}"`,
      "content-length": String(bytes.length),
      "cache-control": "private, no-store",
    },
  });
}
