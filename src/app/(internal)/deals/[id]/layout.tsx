import Link from "next/link";
import { notFound } from "next/navigation";

import { formatAddress } from "@/deals/address";
import { getDeal } from "@/lib/deals/open";
import { getActiveWorkspace } from "@/lib/workspace";

import { DealStepper } from "../deal-stepper";

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
        <p className="text-sm text-[#6b6358]">
          <Link href="/deals" className="hover:text-[#1c1914]">
            Deals
          </Link>{" "}
          / {deal.status === "prospecting" ? "prospect" : deal.status.replaceAll("_", " ")}
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl tracking-tight">{deal.name}</h1>
        <p className="mt-1 text-sm text-[#5c5549]">{address}</p>
      </div>
      <DealStepper dealId={id} />
      {children}
    </div>
  );
}
