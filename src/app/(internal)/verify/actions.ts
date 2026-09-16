"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { extractions } from "@/lib/db/schema";
import { overallConfidence, schemaForVersion } from "@/lib/llm";
import { getActiveWorkspace } from "@/lib/workspace";

export interface ExtractionPayload {
  fields: Record<string, unknown>;
  fieldConfidence: Record<string, number>;
}

async function loadScopedExtraction(extractionId: string) {
  const workspace = await getActiveWorkspace();
  const rows = await db
    .select()
    .from(extractions)
    .where(and(eq(extractions.id, extractionId), eq(extractions.workspaceId, workspace.id)))
    .limit(1);
  return { workspace, extraction: rows[0] ?? null };
}

export async function approveExtraction(formData: FormData) {
  const id = String(formData.get("extractionId") ?? "");
  const { workspace, extraction } = await loadScopedExtraction(id);
  if (!extraction) return;

  await db
    .update(extractions)
    .set({ status: "verified", verifiedBy: workspace.ownerUserId, verifiedAt: new Date() })
    .where(eq(extractions.id, id));
  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: "extraction.verified",
    targetType: "extraction",
    targetId: id,
    metadata: { via: "approve", schemaVersion: extraction.schemaVersion },
  });
  revalidatePath("/verify");
}

export async function rejectExtraction(formData: FormData) {
  const id = String(formData.get("extractionId") ?? "");
  const { workspace, extraction } = await loadScopedExtraction(id);
  if (!extraction) return;

  await db.update(extractions).set({ status: "rejected" }).where(eq(extractions.id, id));
  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: "extraction.rejected",
    targetType: "extraction",
    targetId: id,
    metadata: { schemaVersion: extraction.schemaVersion },
  });
  revalidatePath("/verify");
}

export type CorrectState = { ok: boolean; message: string } | null;

// Corrects scalar fields (arrays like line items stay read-only in v1),
// re-validates against the original Zod schema, and marks the extraction
// verified. Corrected fields are set to confidence 1.0 (human-verified).
export async function correctExtraction(
  _prev: CorrectState,
  formData: FormData,
): Promise<CorrectState> {
  const id = String(formData.get("extractionId") ?? "");
  const { workspace, extraction } = await loadScopedExtraction(id);
  if (!extraction) return { ok: false, message: "Extraction not found." };

  const payload = extraction.payload as ExtractionPayload;
  const nextFields: Record<string, unknown> = { ...payload.fields };
  const changed: { field: string; from: unknown; to: unknown }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("field:")) continue;
    const name = key.slice("field:".length);
    if (!(name in payload.fields)) continue;
    const current = payload.fields[name];
    if (Array.isArray(current) || (current !== null && typeof current === "object")) continue;

    const raw = String(value).trim();
    let next: unknown;
    if (raw === "") {
      next = null;
    } else if (typeof current === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        return { ok: false, message: `"${name}" must be a number (money is integer cents).` };
      }
      next = Number.isInteger(current) ? Math.round(n) : n;
    } else if (current === null && /^-?[\d,]+(\.\d+)?$/.test(raw)) {
      next = Math.round(Number(raw.replace(/,/g, "")));
    } else {
      next = raw;
    }

    if (next !== current) {
      nextFields[name] = next;
      changed.push({ field: name, from: current, to: next });
    }
  }

  if (changed.length === 0) return { ok: false, message: "No changes to save." };

  const entry = schemaForVersion(extraction.schemaVersion);
  if (entry) {
    const parsed = entry.schema.safeParse(nextFields);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        message: `Fails ${extraction.schemaVersion}: ${issue?.path.join(".")} ${issue?.message}`,
      };
    }
  }

  const nextConfidence = { ...payload.fieldConfidence };
  for (const c of changed) nextConfidence[c.field] = 1;

  await db
    .update(extractions)
    .set({
      status: "verified",
      payload: { fields: nextFields, fieldConfidence: nextConfidence },
      confidence: overallConfidence(nextConfidence),
      verifiedBy: workspace.ownerUserId,
      verifiedAt: new Date(),
    })
    .where(eq(extractions.id, id));

  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: "extraction.corrected",
    targetType: "extraction",
    targetId: id,
    metadata: {
      schemaVersion: extraction.schemaVersion,
      changedFields: changed.map((c) => c.field),
      changes: changed,
    },
  });
  revalidatePath("/verify");
  return { ok: true, message: `Saved corrections: ${changed.map((c) => c.field).join(", ")}.` };
}
