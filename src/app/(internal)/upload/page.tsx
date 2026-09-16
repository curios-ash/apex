import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { documents, properties } from "@/lib/db/schema";
import { formatBytes, formatDateTime } from "@/lib/format";
import { getActiveWorkspace } from "@/lib/workspace";

import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  received: "bg-stone-100 text-stone-700",
  classified: "bg-sky-100 text-sky-800",
  extracting: "bg-amber-100 text-amber-800",
  extracted: "bg-emerald-100 text-emerald-800",
  reconciled: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

export default async function UploadPage() {
  const workspace = await getActiveWorkspace();
  const [propertyRows, documentRows] = await Promise.all([
    db
      .select()
      .from(properties)
      .where(eq(properties.workspaceId, workspace.id))
      .orderBy(properties.name),
    db
      .select()
      .from(documents)
      .where(eq(documents.workspaceId, workspace.id))
      .orderBy(desc(documents.receivedAt))
      .limit(25),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload a document</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          PM statements, bank statements, invoices, leases, insurance policies, and listings.
          Each file is stored privately, classified, and extracted — low-confidence results land
          in the <a href="/verify" className="font-medium text-emerald-700 underline">verify queue</a>.
        </p>
      </div>

      <UploadForm
        properties={propertyRows.map((p) => ({ id: p.id, name: p.name }))}
      />

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Recent documents</h2>
        {documentRows.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
            No documents yet. Upload one above, or forward a statement to your workspace alias
            (see README → Inbound email).
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {documentRows.map((doc) => (
                  <tr key={doc.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-4 py-3">
                      <a
                        href={`/api/documents/${doc.id}/file`}
                        className="font-medium text-emerald-800 hover:underline"
                        target="_blank"
                      >
                        {doc.originalFilename ?? "document"}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{doc.documentType}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[doc.status] ?? "bg-stone-100 text-stone-700"}`}
                      >
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{doc.source}</td>
                    <td className="px-4 py-3 text-stone-600">{formatBytes(doc.byteSize)}</td>
                    <td className="px-4 py-3 text-stone-600">{formatDateTime(doc.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
