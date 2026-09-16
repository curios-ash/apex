import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { readStoredFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Serves the stored source file for a document (linked from /verify).
// Pre-auth this is an internal tool; once auth lands it must check the
// caller's workspace membership.
export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
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
