import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FilePlus2, Link2 } from "lucide-react";

import type { DossierPayload } from "@/dossier";
import { db } from "@/lib/db";
import { dossiers } from "@/lib/db/schema";
import { formatCents, formatDateTime, formatMultiple, formatPercent } from "@/lib/format";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function DossiersPage() {
  const workspace = await getActiveWorkspace();
  const rows = await db
    .select()
    .from(dossiers)
    .where(eq(dossiers.workspaceId, workspace.id))
    .orderBy(desc(dossiers.createdAt))
    .limit(50);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deal dossiers</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Versioned pro formas from listing PDFs, pasted text, or manual inputs. Every
            assumption carries its source and confidence; every output is computed by the
            deterministic finance engine.
          </p>
        </div>
        <Link
          href="/dossiers/new"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          <FilePlus2 className="size-4" aria-hidden />
          New dossier
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          No dossiers yet.{" "}
          <Link href="/dossiers/new" className="font-medium text-emerald-700 underline">
            Underwrite your first deal
          </Link>{" "}
          — paste a listing or upload the PDF.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                <th className="px-4 py-3 font-medium">Deal</th>
                <th className="px-4 py-3 font-medium">CoC (yr 1)</th>
                <th className="px-4 py-3 font-medium">DSCR</th>
                <th className="px-4 py-3 font-medium">IRR</th>
                <th className="px-4 py-3 font-medium">Downside CF</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const payload = row.payload as unknown as DossierPayload;
                const base = payload?.base ?? null;
                const downside = payload?.downside?.analysis ?? null;
                return (
                  <tr key={row.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dossiers/${row.id}`}
                        className="font-medium text-emerald-800 hover:underline"
                      >
                        {row.title}
                      </Link>
                      {row.shareToken ? (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                          <Link2 className="size-3" aria-hidden />
                          shared
                        </span>
                      ) : null}
                      {payload && !payload.computable ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          needs inputs
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {base ? formatPercent(base.year1.cashOnCashReturn, 1) : "—"}
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {base ? formatMultiple(base.year1.dscr) : "—"}
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {base ? formatPercent(base.irr, 1) : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${
                        downside && downside.year1.cashFlowBeforeTaxCents < 0
                          ? "text-red-600"
                          : "text-stone-700"
                      }`}
                    >
                      {downside ? formatCents(downside.year1.cashFlowBeforeTaxCents) : "—"}
                    </td>
                    <td className="px-4 py-3 text-stone-600">v{payload?.assumptionVersion ?? 1}</td>
                    <td className="px-4 py-3 text-stone-600">{formatDateTime(row.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
