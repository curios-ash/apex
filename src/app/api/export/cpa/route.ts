import { NextResponse } from "next/server";

import { buildWorkspaceCpaZip, normalizeMonthParam } from "@/lib/export/cpa";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// Deterministic CPA package (ledger + exceptions + actuals). No LLM.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const propertyId = url.searchParams.get("propertyId") || null;
  const month = normalizeMonthParam(url.searchParams.get("month"));

  try {
    const workspace = await getActiveWorkspace();
    const zip = await buildWorkspaceCpaZip({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      propertyId,
      month,
    });
    return new Response(Buffer.from(zip.bytes), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${zip.filename}"`,
        "cache-control": "private, no-store",
        "x-apex-export-empty": zip.empty ? "1" : "0",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
