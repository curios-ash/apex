"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { calculatorFromForm } from "@/deals/calculator";
import { formatAddress } from "@/deals/address";
import { lookupPlaces, resolvePlace } from "@/deals/geocode";
import { inboundTagFromId } from "@/deals/address";
import { recordDealEvent } from "@/lib/deals/events";
import { openDealFromPlace } from "@/lib/deals/open";
import { persistCalculatorToDossier } from "@/lib/deals/persist-calculator";
import { db } from "@/lib/db";
import { dealNotes, properties } from "@/lib/db/schema";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";

export async function openDeal(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const placeId = String(formData.get("placeId") ?? "").trim();
  const query = String(formData.get("query") ?? "").trim();
  if (!query && !placeId) {
    redirect("/deals?error=empty-search");
  }

  let suggestion = placeId ? resolvePlace(placeId, query || placeId) : null;
  if (!suggestion && query) {
    const { suggestions } = await lookupPlaces(query);
    suggestion = suggestions.find((s) => s.matched) ?? suggestions[0] ?? resolvePlace("", query);
  }
  if (!suggestion) {
    redirect("/deals?error=empty-search");
  }

  const { propertyId } = await openDealFromPlace({
    workspaceId: workspace.id,
    userId: workspace.ownerUserId,
    suggestion,
  });
  redirect(`/deals/${propertyId}`);
}

export async function addDealNote(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const propertyId = String(formData.get("propertyId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!propertyId) redirect("/deals");
  if (body.length < 2) {
    redirect(`/deals/${propertyId}/capture?error=empty-note`);
  }

  const [note] = await db
    .insert(dealNotes)
    .values({
      workspaceId: workspace.id,
      propertyId,
      body,
      createdBy: workspace.ownerUserId,
    })
    .returning({ id: dealNotes.id });

  await recordDealEvent({
    workspaceId: workspace.id,
    propertyId,
    kind: "note",
    title: "Note added",
    summary: body.slice(0, 180),
    refType: "deal_note",
    refId: note.id,
    actorUserId: workspace.ownerUserId,
  });

  revalidatePath(`/deals/${propertyId}`);
  revalidatePath(`/deals/${propertyId}/history`);
  revalidatePath(`/deals/${propertyId}/capture`);
  redirect(`/deals/${propertyId}/history`);
}

export async function saveCalculator(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect("/deals");

  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, workspace.id)))
    .limit(1);
  if (!property) redirect("/deals");

  const input = calculatorFromForm({
    purchasePrice: String(formData.get("purchasePrice") ?? ""),
    monthlyRent: String(formData.get("monthlyRent") ?? ""),
    otherMonthlyIncome: String(formData.get("otherMonthlyIncome") ?? ""),
    vacancyPercent: String(formData.get("vacancyPercent") ?? ""),
    annualOperatingExpenses: String(formData.get("annualOperatingExpenses") ?? ""),
    closingCosts: String(formData.get("closingCosts") ?? ""),
    initialRepairs: String(formData.get("initialRepairs") ?? ""),
    loanPrincipal: String(formData.get("loanPrincipal") ?? ""),
    interestPercent: String(formData.get("interestPercent") ?? ""),
    loanTermMonths: String(formData.get("loanTermMonths") ?? ""),
    reservePercent: String(formData.get("reservePercent") ?? ""),
    downsideRentPercent: String(formData.get("downsideRentPercent") ?? ""),
    downsideVacancyPoints: String(formData.get("downsideVacancyPoints") ?? ""),
    downsideExpensePercent: String(formData.get("downsideExpensePercent") ?? ""),
  });

  await persistCalculatorToDossier({
    workspaceId: workspace.id,
    userId: workspace.ownerUserId,
    propertyId,
    title: property.name,
    address: formatAddress({
      line1: property.addressLine1,
      line2: property.addressLine2,
      city: property.city,
      state: property.state,
      zip: property.zip,
    }),
    input,
  });

  revalidatePath(`/deals/${propertyId}`);
  revalidatePath(`/deals/${propertyId}/calculator`);
  redirect(`/deals/${propertyId}/checklist`);
}

export async function ensureDealInboundTag(propertyId: string, workspaceId: string): Promise<string> {
  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, workspaceId)))
    .limit(1);
  if (!property) throw new Error("Deal not found");
  if (property.inboundTag) return property.inboundTag;
  const tag = inboundTagFromId(property.id);
  await db
    .update(properties)
    .set({ inboundTag: tag, updatedAt: new Date() })
    .where(eq(properties.id, property.id));
  return tag;
}
