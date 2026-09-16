import { eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { workspaces, type subscriptionStatusEnum } from "@/lib/db/schema";

import { PLANS, type PlanId } from "./plans";
import type { StripeConfig } from "./stripe";

// Subscription-event → workspace-plan mapping. The pure mapper is unit-tested
// against handcrafted payloads; applyBillingEvent is the DB binding the
// webhook route calls. Events are applied as they arrive — subscription state
// is convergent, so Stripe retries and out-of-order delivery settle on the
// last-seen subscription body.

type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];

const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "unpaid",
};

export interface SubscriptionItem {
  priceId: string;
  quantity: number;
}

export interface MappedSubscription {
  plan: PlanId;
  status: SubscriptionStatus;
  // Total doors on the subscription (Portfolio's 6 included doors added back).
  doors: number | null;
}

// Maps a Stripe subscription's line items to a plan + door count using the
// configured price ids. Returns null when none of our prices appear (a
// subscription this app didn't create — acknowledged and ignored).
export function mapSubscription(
  input: { status?: string; items: SubscriptionItem[] },
  prices: StripeConfig["prices"],
): MappedSubscription | null {
  const status = STRIPE_STATUS_MAP[input.status ?? ""] ?? "none";
  const priceIds = new Set(input.items.map((i) => i.priceId));

  let plan: PlanId | null = null;
  if (priceIds.has(prices.portfolioBase)) plan = "portfolio";
  else if (priceIds.has(prices.ownerBase)) plan = "owner";
  if (!plan) return null;

  const doorPrice = plan === "portfolio" ? prices.portfolioDoor : prices.ownerDoor;
  const doorItem = input.items.find((i) => i.priceId === doorPrice);
  const doors = (doorItem?.quantity ?? 0) + PLANS[plan].includedDoors;
  return { plan, status, doors };
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

function subscriptionItems(object: Record<string, unknown>): SubscriptionItem[] {
  const items = (object.items as { data?: unknown[] } | undefined)?.data ?? [];
  const out: SubscriptionItem[] = [];
  for (const raw of items) {
    const item = raw as { price?: { id?: string }; quantity?: number };
    if (item.price?.id) {
      out.push({ priceId: item.price.id, quantity: item.quantity ?? 1 });
    }
  }
  return out;
}

async function findWorkspace(input: { workspaceId?: string | null; customerId?: string | null }) {
  if (input.workspaceId) {
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
    if (row) return row;
  }
  if (input.customerId) {
    const [row] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.stripeCustomerId, input.customerId))
      .limit(1);
    if (row) return row;
  }
  return null;
}

export interface AppliedEvent {
  handled: boolean;
  workspaceId?: string;
  detail?: string;
}

// Applies one verified Stripe event. Only subscription lifecycle and checkout
// completion change workspace state; everything else is acknowledged.
export async function applyBillingEvent(
  event: StripeEvent,
  prices: StripeConfig["prices"],
): Promise<AppliedEvent> {
  const object = event.data.object;

  if (event.type === "checkout.session.completed") {
    const workspaceId =
      (object.client_reference_id as string | undefined) ??
      ((object.metadata as Record<string, unknown> | undefined)?.workspace_id as string | undefined) ??
      null;
    const customerId = (object.customer as string | undefined) ?? null;
    const subscriptionId = (object.subscription as string | undefined) ?? null;
    const workspace = await findWorkspace({ workspaceId });
    if (!workspace) return { handled: false, detail: "checkout session for unknown workspace" };
    await db
      .update(workspaces)
      .set({
        stripeCustomerId: customerId ?? workspace.stripeCustomerId,
        stripeSubscriptionId: subscriptionId ?? workspace.stripeSubscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspace.id));
    await writeAuditLog({
      workspaceId: workspace.id,
      actorType: "system",
      action: "billing.checkout.completed",
      targetType: "workspace",
      targetId: workspace.id,
      metadata: { eventId: event.id, customerId, subscriptionId },
    });
    return { handled: true, workspaceId: workspace.id };
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const customerId = (object.customer as string | undefined) ?? null;
    const subscriptionId = (object.id as string | undefined) ?? null;
    const metadataWorkspaceId =
      ((object.metadata as Record<string, unknown> | undefined)?.workspace_id as string | undefined) ?? null;
    const workspace = await findWorkspace({ workspaceId: metadataWorkspaceId, customerId });
    if (!workspace) return { handled: false, detail: "subscription for unknown workspace" };

    const deleted = event.type === "customer.subscription.deleted";
    const mapped = deleted
      ? { plan: "free" as PlanId, status: "canceled" as SubscriptionStatus, doors: null }
      : mapSubscription(
          { status: object.status as string | undefined, items: subscriptionItems(object) },
          prices,
        );
    if (!mapped) return { handled: false, detail: "subscription has no Apex prices" };

    await db
      .update(workspaces)
      .set({
        plan: mapped.plan,
        subscriptionStatus: mapped.status,
        billableDoors: mapped.doors,
        stripeCustomerId: customerId ?? workspace.stripeCustomerId,
        stripeSubscriptionId: subscriptionId ?? workspace.stripeSubscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspace.id));
    await writeAuditLog({
      workspaceId: workspace.id,
      actorType: "system",
      action: deleted ? "billing.subscription.canceled" : "billing.subscription.synced",
      targetType: "workspace",
      targetId: workspace.id,
      metadata: {
        eventId: event.id,
        eventType: event.type,
        plan: mapped.plan,
        status: mapped.status,
        doors: mapped.doors,
        subscriptionId,
      },
    });
    return { handled: true, workspaceId: workspace.id };
  }

  return { handled: false, detail: `ignored event type ${event.type}` };
}
