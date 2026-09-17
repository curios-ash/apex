import { evidenceHref } from "@/lib/evidence/load";
import type { ExceptionEvidence } from "@/lib/db/schema";

export function EvidenceList({
  evidence,
  exceptionId,
}: {
  evidence: ExceptionEvidence[];
  exceptionId?: string;
}) {
  if (!evidence || evidence.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
        No source documents or transactions were cited for this finding.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {evidence.map((item, i) => {
        const href = evidenceHref({
          documentId: item.documentId,
          exceptionId,
          transactionId: item.transactionId,
          page: item.page,
        });
        const hasLink = Boolean(item.documentId || item.transactionId || exceptionId);
        return (
          <li
            key={`${item.documentId ?? ""}-${item.transactionId ?? ""}-${i}`}
            className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-xs text-stone-600"
          >
            <div className="flex flex-wrap items-center gap-2">
              {hasLink ? (
                <a href={href} className="font-medium text-emerald-800 hover:underline">
                  Open in evidence viewer
                </a>
              ) : (
                <span className="font-medium text-stone-500">Cited evidence</span>
              )}
              {item.documentId ? (
                <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-stone-500">
                  doc {item.documentId.slice(0, 8)}
                </span>
              ) : null}
              {item.transactionId ? (
                <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-stone-500">
                  tx {item.transactionId.slice(0, 8)}
                </span>
              ) : null}
              {item.page !== undefined ? (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  page {item.page}
                </span>
              ) : null}
            </div>
            {item.note ? <p className="mt-1 text-stone-600">{item.note}</p> : null}
            {item.bbox ? (
              <p className="mt-1 font-mono text-[10px] text-stone-400">
                highlight {item.bbox.map((n) => n.toFixed(2)).join(", ")}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
