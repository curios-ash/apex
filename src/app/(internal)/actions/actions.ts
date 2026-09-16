"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import type { ActionDraftPayload } from "@/coordinator";
import { draftFollowUpForException } from "@/lib/actions/draft";
import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { actions } from "@/lib/db/schema";
import { getActiveWorkspace } from "@/lib/workspace";

async function loadScopedAction(actionId: string) {
  const workspace = await getActiveWorkspace();
  const rows = await db
    .select()
    .from(actions)
    .where(and(eq(actions.id, actionId), eq(actions.workspaceId, workspace.id)))
    .limit(1);
  return { workspace, action: rows[0] ?? null };
}

// Reads the editable fields off the card form; returns null when the form did
// not carry them (e.g. a bare approve button).
function readDraftFields(formData: FormData) {
  const body = formData.get("body");
  if (body === null) return null;
  const to = String(formData.get("to") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  return { to: to === "" ? null : to, subject: subject === "" ? null : subject, body: String(body) };
}

function revalidate() {
  revalidatePath("/actions");
  revalidatePath("/exceptions");
  revalidatePath("/activity");
}

// Draft a PM follow-up / quote request from a confirmed exception. Idempotent
// while a live action exists for it.
export async function draftFollowUp(formData: FormData) {
  const exceptionId = String(formData.get("exceptionId") ?? "");
  const workspace = await getActiveWorkspace();
  await draftFollowUpForException(workspace.id, exceptionId, { userId: workspace.ownerUserId });
  revalidate();
}

// Persists edits to a pending draft. Returns the changed field names.
async function persistEdits(
  actionId: string,
  current: ActionDraftPayload,
  fields: { to: string | null; subject: string | null; body: string },
): Promise<string[]> {
  const changed: string[] = [];
  if (fields.to !== (current.to ?? null)) changed.push("to");
  if (fields.subject !== (current.subject ?? null)) changed.push("subject");
  if (fields.body !== current.body) changed.push("body");
  if (changed.length === 0) return changed;

  const next: ActionDraftPayload = {
    ...current,
    to: fields.to,
    subject: fields.subject,
    body: fields.body,
  };
  await db
    .update(actions)
    .set({ draftPayload: next, updatedAt: new Date() })
    .where(and(eq(actions.id, actionId), eq(actions.status, "pending_approval")));
  return changed;
}

export async function saveActionDraft(formData: FormData) {
  const id = String(formData.get("actionId") ?? "");
  const { workspace, action } = await loadScopedAction(id);
  if (!action || action.status !== "pending_approval") return;
  const fields = readDraftFields(formData);
  if (!fields) return;

  const changed = await persistEdits(id, action.draftPayload as ActionDraftPayload, fields);
  if (changed.length > 0) {
    await writeAuditLog({
      workspaceId: workspace.id,
      actorUserId: workspace.ownerUserId,
      actorType: "user",
      action: "action.updated",
      targetType: "action",
      targetId: id,
      metadata: { actionType: action.actionType, changedFields: changed },
    });
    revalidate();
  }
}

// Approving persists any unsaved edits on the form first, then flips status.
// Approval never sends anything — it unlocks the mailto link / copy button.
export async function approveAction(formData: FormData) {
  const id = String(formData.get("actionId") ?? "");
  const { workspace, action } = await loadScopedAction(id);
  if (!action || action.status !== "pending_approval") return;

  const fields = readDraftFields(formData);
  let changed: string[] = [];
  if (fields) {
    if (fields.body.trim() === "") return; // never approve an empty draft
    changed = await persistEdits(id, action.draftPayload as ActionDraftPayload, fields);
  }

  const updated = await db
    .update(actions)
    .set({ status: "approved", approvedBy: workspace.ownerUserId, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(actions.id, id), eq(actions.status, "pending_approval")))
    .returning({ id: actions.id });
  if (updated.length === 0) return;

  const payload = action.draftPayload as ActionDraftPayload;
  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: "action.approved",
    targetType: "action",
    targetId: id,
    metadata: {
      actionType: action.actionType,
      citedExceptionIds: payload.citedExceptionIds ?? [],
      obligationId: payload.obligationId ?? null,
      editedBeforeApproval: changed.length > 0 ? changed : false,
    },
  });
  revalidate();
}

export async function rejectAction(formData: FormData) {
  const id = String(formData.get("actionId") ?? "");
  const { workspace, action } = await loadScopedAction(id);
  if (!action || action.status !== "pending_approval") return;

  await db
    .update(actions)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(eq(actions.id, id), eq(actions.status, "pending_approval")));
  const payload = action.draftPayload as ActionDraftPayload;
  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: "action.rejected",
    targetType: "action",
    targetId: id,
    metadata: {
      actionType: action.actionType,
      citedExceptionIds: payload.citedExceptionIds ?? [],
      obligationId: payload.obligationId ?? null,
    },
  });
  revalidate();
}
