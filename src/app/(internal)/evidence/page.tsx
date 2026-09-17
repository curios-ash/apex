import Link from "next/link";
import { FileWarning } from "lucide-react";

import { DocumentFrame } from "@/components/document-frame";
import { EvidenceList } from "@/components/evidence-list";
import { formatBytes, formatCents, formatDateTime } from "@/lib/format";
import { loadEvidenceView } from "@/lib/evidence/load";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{
    documentId?: string;
    exceptionId?: string;
    transactionId?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const workspace = await getActiveWorkspace();
  const view = await loadEvidenceView({
    workspaceId: workspace.id,
    documentId: params.documentId ?? null,
    exceptionId: params.exceptionId ?? null,
    transactionId: params.transactionId ?? null,
  });

  const selected =
    Boolean(params.documentId) || Boolean(params.exceptionId) || Boolean(params.transactionId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Evidence viewer</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Source documents, cited transactions, and exception highlights. Open this from an
          exception, the monthly review, or the verify queue — every number still comes from the
          reconciliation engine, not the LLM.
        </p>
      </div>

      {!selected ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-sm text-stone-500">
          <p>No document or finding selected.</p>
          <p className="mt-2">
            Open a finding on{" "}
            <Link href="/exceptions" className="font-medium text-emerald-700 underline">
              Exceptions
            </Link>{" "}
            or the{" "}
            <Link href="/review" className="font-medium text-emerald-700 underline">
              monthly review
            </Link>{" "}
            and use <span className="font-medium text-stone-700">Open in evidence viewer</span>.
          </p>
        </div>
      ) : null}

      {view.error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <FileWarning className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Couldn&apos;t load that evidence</p>
            <p className="mt-1">{view.error}</p>
          </div>
        </div>
      ) : null}

      {view.exception ? (
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Finding</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{view.exception.summary}</h2>
          <p className="mt-1 text-sm text-stone-600">
            <span className="font-mono text-xs">{view.exception.ruleId}</span>
            {" · "}
            {formatCents(view.exception.dollarImpactCents)}
            {" · "}
            {view.exception.status}
          </p>
          <div className="mt-3">
            <EvidenceList evidence={view.exception.evidence} exceptionId={view.exception.id} />
          </div>
        </section>
      ) : null}

      {view.transaction ? (
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Transaction</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            {view.transaction.description}
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            {view.transaction.transactionDate} · {view.transaction.category.replaceAll("_", " ")} ·{" "}
            {formatCents(view.transaction.amountCents)} · {view.transaction.source}
          </p>
        </section>
      ) : null}

      {view.document ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {view.document.originalFilename ?? "Source document"}
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                {view.document.documentType.replaceAll("_", " ")} ·{" "}
                {formatBytes(view.document.byteSize)} · received{" "}
                {formatDateTime(view.document.receivedAt)}
              </p>
            </div>
            <a
              href={`/api/documents/${view.document.id}/file`}
              target="_blank"
              className="text-sm font-medium text-emerald-800 hover:underline"
            >
              Open original
            </a>
          </div>
          {view.document.storageKey ? (
            <DocumentFrame
              src={`/api/documents/${view.document.id}/file`}
              filename={view.document.originalFilename ?? "document"}
              mimeType={view.document.mimeType}
              highlights={view.highlights}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
              This document has no stored file (metadata-only). The extraction still cites it.
            </p>
          )}
        </section>
      ) : selected && !view.error && !view.document ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          No source document is attached to this citation. The finding still stands on the
          transaction and engine math.
        </p>
      ) : null}

      {view.highlights.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Highlights</h2>
          <ul className="mt-3 space-y-2">
            {view.highlights.map((h, i) => (
              <li key={i} className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm">
                <p className="font-medium text-amber-950">
                  {h.note ?? "Cited region"}
                  {h.page !== null ? ` · page ${h.page}` : ""}
                </p>
                {h.bbox ? (
                  <p className="mt-1 font-mono text-xs text-amber-800">
                    bbox {h.bbox.map((n) => n.toFixed(3)).join(", ")}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-amber-800">No bounding box recorded for this cite.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : selected && view.document ? (
        <p className="text-sm text-stone-500">
          No page highlights on this document yet. Cites still link the file as the source.
        </p>
      ) : null}

      {view.citingExceptions.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Findings that cite this</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                  <th className="px-4 py-3 font-medium">Finding</th>
                  <th className="px-4 py-3 font-medium">Impact</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {view.citingExceptions.map((ex) => (
                  <tr key={ex.id} className="border-b border-stone-100 last:border-0">
                    <td className="max-w-md px-4 py-3">
                      <Link
                        href={`/evidence?exceptionId=${ex.id}${view.document ? `&documentId=${view.document.id}` : ""}`}
                        className="font-medium text-emerald-800 hover:underline"
                      >
                        {ex.summary}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-stone-400">{ex.ruleId}</span>
                    </td>
                    <td className="px-4 py-3">{formatCents(ex.dollarImpactCents)}</td>
                    <td className="px-4 py-3 text-stone-600">{ex.status}</td>
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
