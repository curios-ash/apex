"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import { PLANS, billedDoorQuantity, type PlanId } from "@/lib/billing/plans";
import {
  createCheckoutSession,
  createPortalSession,
  isStripeEnabled,
  stripeConfig,
} from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import { units, workspaces, type workspacePlanEnum } from "@/lib/db/schema";
import { getActiveWorkspace } from "@/lib/workspace";

type Plan = (typeof workspacePlanEnum.enumValues)[number];

export type BillingState = { ok: boolean; message: string } | null;

async function countDoors(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ id: units.id })
    .from(units)
    .where(eq(units.workspaceId, workspaceId));
  return rows.length;
}

async function baseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// Mock-mode plan switch — available only while STRIPE_ENABLED is off, so the
// billing page is fully exercisable without Stripe keys. Writes the same
// columns the webhook would, with an audit row marking it as a mock change.
export async function mockSetPlan(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  if (isStripeEnabled()) {
    return { ok: false, message: "Stripe is enabled — plans change through Checkout." };
  }
  const plan = String(formData.get("plan") ?? "") as Plan;
  if (!["free", "owner", "portfolio"].includes(plan)) {
    return { ok: false, message: "Unknown plan." };
  }
  const workspace = await getActiveWorkspace();
  const doors = await countDoors(workspace.id);
  await db
    .update(workspaces)
    .set({
      plan,
      billableDoors: doors,
      subscriptionStatus: plan === "free" ? "none" : "active",
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspace.id));
  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: "billing.plan_mock_set",
    targetType: "workspace",
    targetId: workspace.id,
    metadata: { plan, doors, note: "mock billing (STRIPE_ENABLED off)" },
  });
  revalidatePath("/billing");
  return { ok: true, message: `Plan set to ${PLANS[plan].name} (mock — no charge).` };
}

// Real Checkout. Redirects to Stripe; the webhook updates the plan when the
// subscription lands.
export async function startCheckout(formData: FormData): Promise<void> {
  const plan = String(formData.get("plan") ?? "") as PlanId;
  if (plan !== "owner" && plan !== "portfolio") return;
  if (!isStripeEnabled()) redirect("/billing");

  const config = stripeConfig();
  if (!config) redirect("/billing?error=stripe_not_configured");

  const workspace = await getActiveWorkspace();
  const doors = Math.max(1, await countDoors(workspace.id));
  const base = await baseUrl();

  let session;
  try {
    session = await createCheckoutSession({
      config,
      plan,
      billableDoors: billedDoorQuantity(plan, doors),
      workspaceId: workspace.id,
      customerId:
        (await db.select({ c: workspaces.stripeCustomerId }).from(workspaces).where(eq(workspaces.id, workspace.id)))[0]?.c ??
        null,
      successUrl: `${base}/billing?checkout=success`,
      cancelUrl: `${base}/billing?checkout=canceled`,
    });
  } catch (error) {
    console.error("stripe checkout failed", error);
    redirect("/billing?error=checkout_failed");
  }
  if (!session.url) redirect("/billing?error=checkout_failed");
  redirect(session.url);
}

export async function openPortal(): Promise<void> {
  if (!isStripeEnabled()) redirect("/billing");
  const config = stripeConfig();
  if (!config) redirect("/billing?error=stripe_not_configured");

  const workspace = await getActiveWorkspace();
  const [row] = await db
    .select({ stripeCustomerId: workspaces.stripeCustomerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspace.id))
    .limit(1);
  if (!row?.stripeCustomerId) redirect("/billing?error=no_customer");

  try {
    const session = await createPortalSession({
      config,
      customerId: row.stripeCustomerId,
      returnUrl: `${await baseUrl()}/billing`,
    });
    if (session.url) redirect(session.url);
  } catch (error) {
    console.error("stripe portal failed", error);
  }
  redirect("/billing?error=portal_failed");
}
