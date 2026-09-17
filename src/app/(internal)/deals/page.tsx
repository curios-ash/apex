import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import type { DossierPayload } from "@/dossier";
import { formatAddress } from "@/deals/address";
import { db } from "@/lib/db";
import { dossiers, properties } from "@/lib/db/schema";
import { formatCents, formatPercent } from "@/lib/format";
import { getActiveWorkspace } from "@/lib/workspace";

import { DealSearch } from "./deal-search";

export const dynamic = "force-dynamic";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const workspace = await getActiveWorkspace();
  const [deals, dossierRows] = await Promise.all([
    db.select().from(properties).where(eq(properties.workspaceId, workspace.id)).orderBy(desc(properties.updatedAt)),
    db.select().from(dossiers).where(eq(dossiers.workspaceId, workspace.id)),
  ]);
  const dossierByProperty = new Map<string, (typeof dossierRows)[0]>();
  for (const row of dossierRows) {
    if (row.propertyId && !dossierByProperty.has(row.propertyId)) {
      dossierByProperty.set(row.propertyId, row);
    }
  }

  return (
    <div className="space-y-10">
      <DealSearch initialError={error} />

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-2xl tracking-tight">Open deals</h2>
            <p className="mt-1 text-sm text-[#5c5549]">
              Every address you look up becomes a deal file: capture, calculator, checklist, share.
            </p>
          </div>
        </div>

        {deals.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-[#d7cbb8] bg-white/60 p-6 text-sm text-[#6b6358]">
            No deals yet. Search Maple Austin to open the demo duplex, or type any address to create one.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {deals.map((deal) => {
              const dossier = dossierByProperty.get(deal.id);
              const payload = dossier?.payload as unknown as DossierPayload | undefined;
              const address = formatAddress({
                line1: deal.addressLine1,
                line2: deal.addressLine2,
                city: deal.city,
                state: deal.state,
                zip: deal.zip,
              });
              return (
                <li key={deal.id}>
                  <Link
                    href={`/deals/${deal.id}`}
                    className="flex flex-col gap-2 rounded-2xl border border-[#e2d5be] bg-white p-4 transition hover:border-[#c45c26]/50 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-[#1c1914]">{deal.name}</p>
                      <p className="text-sm text-[#6b6358]">{address}</p>
                      <p className="mt-1 text-[11px] font-semibold tracking-[0.12em] text-[#9a3f12] uppercase">
                        {deal.status === "prospecting" ? "Prospecting" : deal.status.replace("_", " ")}
                      </p>
                    </div>
                    <dl className="flex gap-6 text-sm">
                      <div>
                        <dt className="text-[11px] tracking-wide text-[#8a8172] uppercase">CoC</dt>
                        <dd className="font-medium">
                          {payload?.base ? formatPercent(payload.base.year1.cashOnCashReturn, 1) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] tracking-wide text-[#8a8172] uppercase">NOI</dt>
                        <dd className="font-medium">
                          {payload?.base ? formatCents(payload.base.year1.noiCents) : "—"}
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
