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

      <section aria-labelledby="opened-deals">
        <h2
          id="opened-deals"
          className="font-[family-name:var(--font-heading)] text-2xl tracking-tight"
        >
          Deals you already opened
        </h2>
        <p className="mt-1 text-sm text-[#5c5549]">
          Tap one to evaluate it. Search stays the way to start a new address.
        </p>

        {deals.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-[#d7cbb8] bg-white/70 p-6 text-sm leading-relaxed text-[#5c5549]">
            Nothing here yet. Search <span className="font-semibold text-[#1c1914]">Maple Austin</span>{" "}
            and press Open deal. That creates the demo duplex so you can run the numbers.
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
                    className="flex min-h-16 flex-col gap-3 rounded-2xl border border-[#e2d5be] bg-white p-4 transition hover:border-[#c45c26]/50 active:bg-[#fffaf1] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1c1914]">{deal.name}</p>
                      <p className="text-sm text-[#6b6358]">{address}</p>
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
