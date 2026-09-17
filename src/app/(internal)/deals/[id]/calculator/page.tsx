import { notFound } from "next/navigation";

import { calculatorInputsForProperty } from "@/lib/deals/persist-calculator";
import { getDeal } from "@/lib/deals/open";
import { getActiveWorkspace } from "@/lib/workspace";

import { CalculatorForm } from "./calculator-form";

export const dynamic = "force-dynamic";

export default async function DealCalculatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getActiveWorkspace();
  const deal = await getDeal(workspace.id, id);
  if (!deal) notFound();
  const { inputs } = await calculatorInputsForProperty(workspace.id, id);

  return <CalculatorForm propertyId={id} initial={inputs} />;
}
