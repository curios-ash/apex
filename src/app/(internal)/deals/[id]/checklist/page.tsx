import Link from "next/link";
import { notFound } from "next/navigation";

import { loadDossier } from "@/lib/dossier/run";
import { latestDossierId } from "@/lib/deals/open";
import { getDeal } from "@/lib/deals/open";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const SEVERITY: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-900",
  important: "border-amber-200 bg-amber-50 text-amber-950",
  standard: "border-[#e2d5be] bg-white text-[#1c1914]",
};

export default async function DealChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getActiveWorkspace();
  const deal = await getDeal(workspace.id, id);
  if (!deal) notFound();
  const dossierId = await latestDossierId(workspace.id, id);
  const loaded = dossierId ? await loadDossier(workspace.id, dossierId) : null;
  const items = loaded?.payload.checklist ?? [];

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7cbb8] bg-white/70 p-8">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl">No checklist yet</h2>
        <p className="mt-2 max-w-lg text-sm text-[#5c5549]">
          The diligence list is generated from gaps in the deal — defaulted taxes, unverified rent,
          financing risk — after the engine runs. Save the calculator or build a dossier first.
        </p>
        <Link href={`/deals/${id}/calculator`} className="mt-4 inline-block text-sm font-medium text-[#9a3f12] underline">
          Run the calculator
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#5c5549]">
        Deterministic from this deal’s assumptions and {loaded.dossier.financeVersion} outputs.
        Nothing here is written by a model.
      </p>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
          No gaps on this version. Still walk the property.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className={`rounded-2xl border p-4 ${SEVERITY[item.severity]}`}>
              <p className="text-[11px] font-semibold tracking-[0.12em] uppercase">{item.severity}</p>
              <h3 className="mt-1 font-medium">{item.label}</h3>
              <p className="mt-1 text-sm opacity-90">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/dossiers/${loaded.dossier.id}`} className="inline-block text-sm font-medium text-[#9a3f12] underline">
        Full dossier
      </Link>
    </div>
  );
}
