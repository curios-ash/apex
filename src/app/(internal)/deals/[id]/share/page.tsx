import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Link2, Link2Off } from "lucide-react";

import { Button } from "@/components/ui/button";
import { share, unshare } from "@/app/(internal)/dossiers/actions";
import { loadDossier } from "@/lib/dossier/run";
import { latestDossierId } from "@/lib/deals/open";
import { getDeal } from "@/lib/deals/open";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function DealSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getActiveWorkspace();
  const deal = await getDeal(workspace.id, id);
  if (!deal) notFound();
  const dossierId = await latestDossierId(workspace.id, id);
  const loaded = dossierId ? await loadDossier(workspace.id, dossierId) : null;

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const shareUrl =
    loaded?.dossier.shareToken && host
      ? `${proto}://${host}/share/dossiers/${loaded.dossier.shareToken}`
      : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#e2d5be] bg-white p-6">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl">Share the underwrite</h2>
        <p className="mt-1 max-w-xl text-sm text-[#5c5549]">
          Partners get a noindex, read-only page with the engine snapshot. Your workspace, notes,
          and other deals stay off that URL.
        </p>
        {!loaded ? (
          <p className="mt-4 text-sm text-[#6b6358]">
            Save the calculator or build a dossier before sharing.{" "}
            <Link href={`/deals/${id}/calculator`} className="font-medium text-[#9a3f12] underline">
              Underwrite this deal
            </Link>
          </p>
        ) : shareUrl ? (
          <div className="mt-4 space-y-3">
            <input
              readOnly
              value={shareUrl}
              className="w-full rounded-lg border border-[#d7cbb8] bg-[#fffaf1] px-3 py-2 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <a href={shareUrl} target="_blank" className="text-sm font-medium text-[#9a3f12] underline">
                Open public page
              </a>
              <form action={unshare}>
                <input type="hidden" name="dossierId" value={loaded.dossier.id} />
                <Button type="submit" variant="outline" size="sm">
                  <Link2Off aria-hidden />
                  Revoke
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <form action={share} className="mt-4">
            <input type="hidden" name="dossierId" value={loaded.dossier.id} />
            <Button type="submit" className="bg-[#1c1914] text-[#f4e6c8]">
              <Link2 aria-hidden />
              Create read-only link
            </Button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-[#e2d5be] bg-white p-6">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl">Export</h2>
        <p className="mt-1 text-sm text-[#5c5549]">
          CPA package of ledger, exceptions, and actuals for this property. Deterministic CSV zip —
          no LLM math.
        </p>
        <a
          href={`/api/export/cpa?propertyId=${id}`}
          className="mt-4 inline-flex rounded-lg bg-[#c45c26] px-4 py-2 text-sm font-medium text-white hover:bg-[#9a3f12]"
        >
          Download CPA zip
        </a>
        <p className="mt-2 text-xs text-[#6b6358]">
          Empty zip sections are expected on a brand-new prospect — there is no operating history yet.
        </p>
      </section>
    </div>
  );
}
