import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowRight, FileUp, History, Share2, SlidersHorizontal } from "lucide-react";

import type { DossierPayload } from "@/dossier";
import { formatCents, formatMultiple, formatPercent } from "@/lib/format";
import { db } from "@/lib/db";
import { dealEvents, dossiers } from "@/lib/db/schema";
import { getDeal, latestDossierId } from "@/lib/deals/open";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function DealOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getActiveWorkspace();
  const deal = await getDeal(workspace.id, id);
  if (!deal) notFound();

  const dossierId = await latestDossierId(workspace.id, id);
  const [dossier] = dossierId
    ? await db.select().from(dossiers).where(eq(dossiers.id, dossierId)).limit(1)
    : [];
  const payload = (dossier?.payload ?? null) as DossierPayload | null;
  const [latestEvent] = await db
    .select()
    .from(dealEvents)
    .where(eq(dealEvents.propertyId, id))
    .orderBy(desc(dealEvents.createdAt))
    .limit(1);

  const cards = [
    {
      href: `/deals/${id}/capture`,
      icon: FileUp,
      title: "Capture the file",
      body: "Upload the listing, inspection, or rent roll. Forward email to this deal’s alias. Add a note while it’s still in your head.",
    },
    {
      href: `/deals/${id}/calculator`,
      icon: SlidersHorizontal,
      title: "Run the numbers",
      body: "NOI, DSCR, cash-on-cash, mortgage, downside — from finance-v1. Edit inputs; the model never invents an output.",
    },
    {
      href: `/deals/${id}/history`,
      icon: History,
      title: "Read the history",
      body: "Every document, extract, note, and dossier version on one timeline.",
    },
    {
      href: `/deals/${id}/share`,
      icon: Share2,
      title: "Share or export",
      body: "A read-only link for partners, or a CPA zip of the numbers the engine already computed.",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Year-1 NOI"
          value={payload?.base ? formatCents(payload.base.year1.noiCents) : "—"}
        />
        <Metric
          label="DSCR"
          value={payload?.base ? formatMultiple(payload.base.year1.dscr) : "—"}
        />
        <Metric
          label="Cash-on-cash"
          value={payload?.base ? formatPercent(payload.base.year1.cashOnCashReturn, 1) : "—"}
        />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-2xl border border-[#e2d5be] bg-white p-5 hover:border-[#c45c26]/50"
          >
            <card.icon className="size-5 text-[#c45c26]" aria-hidden />
            <h2 className="mt-3 flex items-center gap-2 font-semibold">
              {card.title}
              <ArrowRight className="size-4 opacity-0 transition group-hover:opacity-100" />
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[#5c5549]">{card.body}</p>
          </Link>
        ))}
      </div>

      <p className="text-sm text-[#6b6358]">
        {latestEvent
          ? `Last activity: ${latestEvent.title}`
          : "This deal is empty until you capture a file or run the calculator."}{" "}
        {dossierId ? (
          <Link href={`/dossiers/${dossierId}`} className="font-medium text-[#9a3f12] underline">
            Open full dossier
          </Link>
        ) : (
          <Link href={`/dossiers/new?propertyId=${id}`} className="font-medium text-[#9a3f12] underline">
            Build a sourced dossier
          </Link>
        )}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e2d5be] bg-[#fffaf1] p-4">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8a8172] uppercase">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-heading)] text-2xl">{value}</p>
    </div>
  );
}
