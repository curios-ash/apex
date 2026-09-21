import Link from "next/link";
import { notFound } from "next/navigation";

import { formatAddress } from "@/deals/address";
import { getDeal } from "@/lib/deals/open";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function DealLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await getActiveWorkspace();
  const deal = await getDeal(workspace.id, id);
  if (!deal) notFound();
  const address = formatAddress({
    line1: deal.addressLine1,
    line2: deal.addressLine2,
    city: deal.city,
    state: deal.state,
    zip: deal.zip,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/deals"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[#9a3f12]"
        >
          ← Find another address
        </Link>
        <p className="mt-3 text-[11px] font-semibold tracking-[0.18em] text-[#9a3f12] uppercase">
          Step 2 · Evaluate
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl tracking-tight sm:text-4xl">
          {deal.name}
        </h1>
        <p className="mt-1 text-base text-[#5c5549]">{address}</p>
      </div>
      {children}
    </div>
  );
}
