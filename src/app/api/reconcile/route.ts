import { NextResponse } from "next/server";

import { runReconciliation } from "@/lib/reconcile/run";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// Manual reconciliation trigger for the active workspace (R0). Body is
// optional JSON: { "month": "yyyy-mm-01" } to scope the run.
export async function POST(request: Request) {
  let month: string | undefined;
  try {
    const body = await request.json();
    if (body && typeof body.month === "string" && /^\d{4}-\d{2}-01$/.test(body.month)) {
      month = body.month;
    }
  } catch {
    // Empty body reconciles everything.
  }

  try {
    const workspace = await getActiveWorkspace();
    const summary = await runReconciliation(workspace.id, { month });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("reconciliation run failed", error);
    return NextResponse.json(
      { ok: false, message: "Reconciliation failed. Check the server logs." },
      { status: 500 },
    );
  }
}
