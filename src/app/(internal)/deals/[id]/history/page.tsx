import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { TIMELINE_KIND_LABEL, timelineEmptyCopy } from "@/deals/timeline";
import { formatDateTime } from "@/lib/format";
import { db } from "@/lib/db";
import { dealEvents } from "@/lib/db/schema";
import { getDeal } from "@/lib/deals/open";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function DealHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getActiveWorkspace();
  const deal = await getDeal(workspace.id, id);
  if (!deal) notFound();

  const events = await db
    .select()
    .from(dealEvents)
    .where(eq(dealEvents.propertyId, id))
    .orderBy(desc(dealEvents.createdAt));

  if (events.length === 0) {
    const copy = timelineEmptyCopy(deal.name);
    return (
      <div className="rounded-2xl border border-dashed border-[#d7cbb8] bg-white/70 p-8 text-center">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl">{copy.title}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-[#5c5549]">{copy.body}</p>
        <Link
          href={`/deals/${id}/capture`}
          className="mt-4 inline-flex text-sm font-medium text-[#9a3f12] underline"
        >
          Capture something
        </Link>
      </div>
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-[#d7cbb8] pl-6">
      {events.map((event) => (
        <li key={event.id} className="relative pb-8">
          <span className="absolute top-1.5 -left-[29px] size-3 rounded-full border-2 border-[#fffaf1] bg-[#c45c26]" />
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9a3f12] uppercase">
            {TIMELINE_KIND_LABEL[event.kind]} · {formatDateTime(event.createdAt)}
          </p>
          <h3 className="mt-1 font-medium text-[#1c1914]">{event.title}</h3>
          {event.summary ? <p className="mt-1 text-sm text-[#5c5549]">{event.summary}</p> : null}
          {event.refType === "document" && event.refId ? (
            <a
              href={`/api/documents/${event.refId}/file`}
              className="mt-2 inline-block text-sm text-[#9a3f12] underline"
              target="_blank"
            >
              Open file
            </a>
          ) : null}
          {event.refType === "dossier" && event.refId ? (
            <Link href={`/dossiers/${event.refId}`} className="mt-2 inline-block text-sm text-[#9a3f12] underline">
              Open dossier
            </Link>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
