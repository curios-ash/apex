import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDealInboundAddress } from "@/deals/inbound-alias";
import { Button } from "@/components/ui/button";
import { addDealNote, ensureDealInboundTag } from "../../actions";
import { getDeal } from "@/lib/deals/open";
import { getActiveWorkspace } from "@/lib/workspace";

import { DealUpload } from "./upload";

export const dynamic = "force-dynamic";

export default async function DealCapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const workspace = await getActiveWorkspace();
  const deal = await getDeal(workspace.id, id);
  if (!deal) notFound();
  const tag = await ensureDealInboundTag(id, workspace.id);
  const domain = process.env.INBOUND_EMAIL_DOMAIN ?? "in.apex.example.com";
  const alias = formatDealInboundAddress(workspace.slug, tag, domain);
  const emptyNote = q.error === "empty-note";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-[#e2d5be] bg-white p-6">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl">Upload the packet</h2>
        <p className="mt-1 text-sm text-[#5c5549]">
          Listing PDF, OM, inspection, T-12, rent roll — same ingest pipeline as owner statements.
          Classification and extraction run immediately; the file lands on this deal’s history.
        </p>
        <div className="mt-4">
          <DealUpload propertyId={id} />
        </div>
        <p className="mt-4 text-sm text-[#6b6358]">
          Prefer the full listing extractor?{" "}
          <Link href={`/dossiers/new?propertyId=${id}`} className="font-medium text-[#9a3f12] underline">
            Build a sourced dossier from text or PDF
          </Link>
          .
        </p>
      </section>

      <section className="rounded-2xl border border-[#e2d5be] bg-white p-6">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl">Forward an email</h2>
        <p className="mt-1 text-sm text-[#5c5549]">
          Anything sent to this deal alias is stored and extracted, then attached here — not dumped
          into a workspace-wide inbox.
        </p>
        <p className="mt-4 rounded-xl bg-[#f7f1e6] px-3 py-2 font-mono text-sm break-all">{alias}</p>
        <p className="mt-2 text-xs text-[#6b6358]">
          Local demo: <code className="font-mono">npm run inbound:demo -- --to {alias}</code> once
          the flag is wired; or POST /api/inbound-email with To set to this address.
        </p>
      </section>

      <section className="rounded-2xl border border-[#e2d5be] bg-white p-6 lg:col-span-2">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl">Leave a note</h2>
        <p className="mt-1 text-sm text-[#5c5549]">
          Seller chatter, inspection hunches, “taxes look low.” Notes are first-class history, not a
          sticky on the side.
        </p>
        {emptyNote ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            Write at least a sentence before saving.
          </p>
        ) : null}
        <form action={addDealNote} className="mt-4 space-y-3">
          <input type="hidden" name="propertyId" value={id} />
          <textarea
            name="body"
            required
            rows={4}
            placeholder="Walked the duplex Tuesday. Roof is 12 years, HVAC original, unit B lease rolls in 90 days."
            className="w-full rounded-xl border border-[#d7cbb8] bg-[#fffaf1] px-3 py-2 text-sm"
          />
          <Button type="submit" className="bg-[#c45c26] text-white hover:bg-[#9a3f12]">
            Add to history
          </Button>
        </form>
      </section>
    </div>
  );
}
