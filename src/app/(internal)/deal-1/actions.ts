"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { gatesFromForm, normalizeAddress, scoreAttempt, scoreDeal1, underwritingFromForm } from "@/deal1";
import { createDeal1CheckoutSession, createPortalSessionWithKey, deal1CheckoutConfig, isStripeEnabled, stripeSecretKey } from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import { deal1Checks, workspaces } from "@/lib/db/schema";
import { loadDeal1Workspace, saveDeal1Gates } from "@/lib/deal1/store";
import { getActiveWorkspace } from "@/lib/workspace";

async function baseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function saveGates(formData: FormData): Promise<void> {
  const parsed = gatesFromForm(formData);
  if (!parsed.ok) redirect(`/deal-1?error=${parsed.error}`);
  const workspace = await getActiveWorkspace();
  await saveDeal1Gates(workspace.id, parsed.gates);
  revalidatePath("/deal-1");
  redirect("/deal-1?saved=gates#gates");
}

export async function scoreAddress(formData: FormData): Promise<void> {
  const workspace = await getActiveWorkspace();
  const loaded = await loadDeal1Workspace(workspace.id);
  const parsed = underwritingFromForm(formData, loaded.gates);
  if (!parsed.ok) redirect(`/deal-1?error=${parsed.error}`);

  const addressNorm = normalizeAddress(parsed.address);
  const score = scoreDeal1(loaded.gates, parsed.input);
  const values = {
    address: parsed.address,
    addressNorm,
    purchasePriceCents: parsed.input.purchasePriceCents.value,
    purchasePriceSource: parsed.input.purchasePriceCents.source,
    monthlyRentCents: parsed.input.monthlyRentCents.value,
    monthlyRentSource: parsed.input.monthlyRentCents.source,
    vacancyRate: parsed.input.vacancyRate.value,
    vacancySource: parsed.input.vacancyRate.source,
    annualOperatingExpensesCents: parsed.input.annualOperatingExpensesCents.value,
    opexSource: parsed.input.annualOperatingExpensesCents.source,
    annualRate: parsed.input.annualRate.value,
    annualRateSource: parsed.input.annualRate.source,
    units: parsed.input.units.value,
    unitsSource: parsed.input.units.source,
    fullyLeased: parsed.input.fullyLeased.value,
    fullyLeasedSource: parsed.input.fullyLeased.source,
    heavyRehab: parsed.input.heavyRehab.value,
    heavyRehabSource: parsed.input.heavyRehab.source,
    noiCents: score.noiCents,
    dscr: score.dscr,
    cashFlowCents: score.cashFlowBeforeTaxCents,
    annualDebtServiceCents: score.annualDebtServiceCents,
    pricePass: score.pricePass,
    dscrPass: score.dscrPass,
    linePass: score.pass,
    passLineCents: loaded.gates.passLineCents,
    dscrGate: loaded.gates.dscrGate,
    updatedAt: new Date(),
  };

  const outcome = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: deal1Checks.id })
      .from(deal1Checks)
      .where(and(eq(deal1Checks.workspaceId, workspace.id), eq(deal1Checks.addressNorm, addressNorm)))
      .limit(1);
    const saved = await tx
      .select({ id: deal1Checks.id })
      .from(deal1Checks)
      .where(eq(deal1Checks.workspaceId, workspace.id));
    const attempt = scoreAttempt({
      savedChecks: saved.length,
      addressAlreadySaved: existing.length > 0,
      stripeEnabled: isStripeEnabled(),
      deal1Status: loaded.deal1Status,
    });
    if (!attempt.allowed) return { blocked: true as const };
    const [row] = await tx
      .insert(deal1Checks)
      .values({ workspaceId: workspace.id, ...values })
      .onConflictDoUpdate({
        target: [deal1Checks.workspaceId, deal1Checks.addressNorm],
        set: values,
      })
      .returning({ id: deal1Checks.id });
    return { blocked: false as const, id: row.id };
  });

  if (outcome.blocked) redirect("/deal-1?paywall=second#paywall");
  revalidatePath("/deal-1");
  redirect(`/deal-1?check=${outcome.id}#checks`);
}

export async function setDecision(formData: FormData): Promise<void> {
  const decision = String(formData.get("decision") ?? "");
  const checkId = String(formData.get("checkId") ?? "");
  if ((decision !== "keep" && decision !== "pass") || !checkId) redirect("/deal-1#checks");
  const workspace = await getActiveWorkspace();
  await db
    .update(deal1Checks)
    .set({ decision, updatedAt: new Date() })
    .where(and(eq(deal1Checks.id, checkId), eq(deal1Checks.workspaceId, workspace.id)));
  revalidatePath("/deal-1");
  redirect(`/deal-1?check=${checkId}#checks`);
}

// Sends the workspace to Stripe Checkout for the single $19 price.
// Does not write deal1_subscription_status. The webhook does that.
export async function startDeal1Checkout(): Promise<void> {
  const config = deal1CheckoutConfig();
  if (!config) redirect("/deal-1?error=checkout_unavailable#paywall");

  const workspace = await getActiveWorkspace();
  const [row] = await db
    .select({ stripeCustomerId: workspaces.stripeCustomerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspace.id))
    .limit(1);
  const base = await baseUrl();

  let session;
  try {
    session = await createDeal1CheckoutSession({
      secretKey: config.secretKey,
      priceId: config.priceId,
      workspaceId: workspace.id,
      customerId: row?.stripeCustomerId ?? null,
      successUrl: `${base}/deal-1?checkout=returned#paywall`,
      cancelUrl: `${base}/deal-1?checkout=canceled#paywall`,
    });
  } catch (error) {
    console.error("deal1 stripe checkout failed", error);
    redirect("/deal-1?error=checkout_failed#paywall");
  }
  if (!session.url) redirect("/deal-1?error=checkout_failed#paywall");
  redirect(session.url);
}

export async function openDeal1Portal(): Promise<void> {
  if (!isStripeEnabled()) redirect("/deal-1?error=checkout_unavailable#paywall");
  const secretKey = stripeSecretKey();
  if (!secretKey) redirect("/deal-1?error=checkout_unavailable#paywall");
  const workspace = await getActiveWorkspace();
  const [row] = await db
    .select({ stripeCustomerId: workspaces.stripeCustomerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspace.id))
    .limit(1);
  if (!row?.stripeCustomerId) redirect("/deal-1?error=no_customer#paywall");
  try {
    const session = await createPortalSessionWithKey({
      secretKey,
      customerId: row.stripeCustomerId,
      returnUrl: `${await baseUrl()}/deal-1`,
    });
    if (session.url) redirect(session.url);
  } catch (error) {
    console.error("deal1 stripe portal failed", error);
  }
  redirect("/deal-1?error=checkout_failed#paywall");
}
