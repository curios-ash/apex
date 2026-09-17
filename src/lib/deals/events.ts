import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { dealEvents } from "@/lib/db/schema";
import type { DealEventKind } from "@/deals/timeline";

export async function recordDealEvent(params: {
  workspaceId: string;
  propertyId: string;
  kind: DealEventKind;
  title: string;
  summary?: string | null;
  refType?: string | null;
  refId?: string | null;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
}): Promise<void> {
  const [row] = await db
    .insert(dealEvents)
    .values({
      workspaceId: params.workspaceId,
      propertyId: params.propertyId,
      kind: params.kind,
      title: params.title,
      summary: params.summary ?? null,
      refType: params.refType ?? null,
      refId: params.refId ?? null,
      metadata: params.metadata ?? {},
    })
    .returning({ id: dealEvents.id });

  await writeAuditLog({
    workspaceId: params.workspaceId,
    actorUserId: params.actorUserId,
    actorType: params.actorUserId ? "user" : "system",
    action: `deal.${params.kind}`,
    targetType: params.refType ?? "property",
    targetId: params.refId ?? params.propertyId,
    metadata: { dealEventId: row?.id, propertyId: params.propertyId, ...params.metadata },
  });
}
