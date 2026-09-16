import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

// One audit row per action, always workspace-scoped. Audit writes must never
// break the action they record, so failures go to stderr.
export async function writeAuditLog(params: {
  workspaceId: string;
  actorUserId?: string | null;
  actorType: "user" | "agent" | "system";
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      workspaceId: params.workspaceId,
      actorUserId: params.actorUserId ?? null,
      actorType: params.actorType,
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (error) {
    console.error("failed to write audit_log row", error);
  }
}
