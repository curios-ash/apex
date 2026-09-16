import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { documents, extractions } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { lowConfidenceFields, reviewThreshold } from "@/lib/llm";
import { getActiveWorkspace } from "@/lib/workspace";

import type { ExtractionPayload } from "./actions";
import { ExtractionCard } from "./extraction-card";

export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const workspace = await getActiveWorkspace();
  const threshold = reviewThreshold();

  const queue = await db
    .select({ extraction: extractions, document: documents })
    .from(extractions)
    .innerJoin(documents, eq(extractions.documentId, documents.id))
    .where(and(eq(extractions.workspaceId, workspace.id), eq(extractions.status, "needs_review")))
    .orderBy(desc(extractions.createdAt))
    .limit(50);

  const recentVerified = await db
    .select({ extraction: extractions, document: documents })
    .from(extractions)
    .innerJoin(documents, eq(extractions.documentId, documents.id))
    .where(and(eq(extractions.workspaceId, workspace.id), inArray(extractions.status, ["verified", "rejected"])))
    .orderBy(desc(extractions.verifiedAt))
    .limit(10);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verify queue</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Extractions with any field below {Math.round(threshold * 100)}% confidence wait here
          for a human. Approve what&apos;s right, correct what isn&apos;t — every decision is
          written to the audit log. Money fields are integer cents; dates are yyyy-mm-dd.
        </p>
      </div>

      {queue.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          Nothing needs review. Upload a statement or forward one to your workspace alias and
          low-confidence fields will show up here.
        </p>
      ) : (
        <div className="space-y-6">
          {queue.map(({ extraction, document }) => {
            const payload = extraction.payload as ExtractionPayload;
            return (
              <ExtractionCard
                key={extraction.id}
                extractionId={extraction.id}
                documentId={document.id}
                filename={document.originalFilename ?? "document"}
                schemaVersion={extraction.schemaVersion}
                extractor={extraction.extractor}
                confidence={extraction.confidence}
                fields={payload.fields}
                fieldConfidence={payload.fieldConfidence}
                lowFields={lowConfidenceFields(payload.fieldConfidence, threshold)}
              />
            );
          })}
        </div>
      )}

      {recentVerified.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Recently decided</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Schema</th>
                  <th className="px-4 py-3 font-medium">Decision</th>
                  <th className="px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {recentVerified.map(({ extraction, document }) => (
                  <tr key={extraction.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-4 py-3">
                      <a
                        href={`/api/documents/${document.id}/file`}
                        className="font-medium text-emerald-800 hover:underline"
                        target="_blank"
                      >
                        {document.originalFilename ?? "document"}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{extraction.schemaVersion}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          extraction.status === "verified"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {extraction.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {formatDateTime(extraction.verifiedAt ?? extraction.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
