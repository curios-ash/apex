import { and, eq, inArray, isNotNull } from "drizzle-orm";

import {
  deriveObligations,
  type LeaseSource,
  type ObligationSpec,
  type PmAgreementSource,
  type PolicySource,
} from "@/coordinator";
import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { leases, obligations, pmAgreements, policies, properties, units } from "@/lib/db/schema";

// Derives renewal-calendar obligations from the property record (lease end
// dates, policy renewal dates, PM agreement end dates) and upserts them into
// the obligations table. Idempotent: one obligation per source row (see
// obligations_source_idx); done/dismissed rows are never resurrected, and a
// source that disappears leaves its row for the owner to dismiss — R0 keeps
// the calendar append-only rather than silently deleting history.
export async function syncObligations(
  workspaceId: string,
): Promise<{ created: number; updated: number }> {
  const [leaseRows, policyRows, agreementRows] = await Promise.all([
    db
      .select({
        lease: leases,
        unitLabel: units.label,
        propertyId: properties.id,
        propertyName: properties.name,
      })
      .from(leases)
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(leases.workspaceId, workspaceId),
          inArray(leases.status, ["active", "month_to_month"]),
        ),
      ),
    db
      .select({ policy: policies, propertyName: properties.name })
      .from(policies)
      .leftJoin(properties, eq(policies.propertyId, properties.id))
      .where(and(eq(policies.workspaceId, workspaceId), isNotNull(policies.renewalDate))),
    db
      .select({ agreement: pmAgreements, propertyName: properties.name })
      .from(pmAgreements)
      .leftJoin(properties, eq(pmAgreements.propertyId, properties.id))
      .where(and(eq(pmAgreements.workspaceId, workspaceId), isNotNull(pmAgreements.endDate))),
  ]);

  const leaseSources: LeaseSource[] = leaseRows.map((r) => ({
    id: r.lease.id,
    tenantName: r.lease.tenantName,
    endDate: r.lease.endDate,
    status: r.lease.status,
    propertyId: r.propertyId,
    propertyName: r.propertyName,
    unitLabel: r.unitLabel,
  }));
  const policySources: PolicySource[] = policyRows.map((r) => ({
    id: r.policy.id,
    carrier: r.policy.carrier,
    policyType: r.policy.policyType,
    renewalDate: r.policy.renewalDate as string,
    propertyId: r.policy.propertyId,
    propertyName: r.propertyName,
  }));
  const agreementSources: PmAgreementSource[] = agreementRows.map((r) => ({
    id: r.agreement.id,
    pmCompanyName: r.agreement.pmCompanyName,
    endDate: r.agreement.endDate as string,
    propertyId: r.agreement.propertyId,
    propertyName: r.propertyName,
  }));

  const specs = deriveObligations({
    leases: leaseSources,
    policies: policySources,
    pmAgreements: agreementSources,
  });

  const existing = await db
    .select()
    .from(obligations)
    .where(eq(obligations.workspaceId, workspaceId));
  const bySource = new Map(
    existing
      .filter((o) => o.relatedId !== null)
      .map((o) => [`${o.obligationType}:${o.relatedId}`, o]),
  );

  let created = 0;
  let updated = 0;
  for (const spec of specs) {
    const key = `${spec.obligationType}:${spec.relatedId}`;
    const current = bySource.get(key);
    if (!current) {
      await db.insert(obligations).values({
        workspaceId,
        propertyId: spec.propertyId,
        obligationType: spec.obligationType,
        relatedId: spec.relatedId,
        dueDate: spec.dueDate,
        noticeDays: spec.noticeDays,
        notes: spec.notes,
      });
      created += 1;
      continue;
    }
    if (current.status !== "pending") continue;
    if (specChanged(current, spec)) {
      await db
        .update(obligations)
        .set({
          propertyId: spec.propertyId,
          dueDate: spec.dueDate,
          noticeDays: spec.noticeDays,
          notes: spec.notes,
          updatedAt: new Date(),
        })
        .where(eq(obligations.id, current.id));
      updated += 1;
    }
  }

  if (created > 0 || updated > 0) {
    await writeAuditLog({
      workspaceId,
      actorType: "system",
      action: "obligations.synced",
      targetType: "obligation",
      metadata: { created, updated, sources: specs.length },
    });
  }

  return { created, updated };
}

function specChanged(
  current: typeof obligations.$inferSelect,
  spec: ObligationSpec,
): boolean {
  return (
    current.dueDate !== spec.dueDate ||
    current.noticeDays !== spec.noticeDays ||
    current.notes !== spec.notes ||
    current.propertyId !== spec.propertyId
  );
}
