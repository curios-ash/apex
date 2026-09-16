// Renewal-calendar obligations derived from the property record: lease end
// dates, insurance policy renewal dates, and PM agreement end dates (whose
// notice windows are the actionable deadlines). Pure derivation — the DB
// binding (upsert into obligations) lives in src/lib/obligations/sync.ts.

export interface LeaseSource {
  id: string;
  tenantName: string;
  // yyyy-mm-dd
  endDate: string;
  status: string;
  propertyId: string | null;
  propertyName: string | null;
  unitLabel: string | null;
}

export interface PolicySource {
  id: string;
  carrier: string;
  policyType: string;
  // yyyy-mm-dd
  renewalDate: string;
  propertyId: string | null;
  propertyName: string | null;
}

export interface PmAgreementSource {
  id: string;
  pmCompanyName: string;
  // yyyy-mm-dd
  endDate: string;
  propertyId: string | null;
  propertyName: string | null;
}

export interface ObligationSpec {
  obligationType: "lease_renewal" | "insurance_renewal" | "pm_agreement_renewal";
  relatedId: string;
  propertyId: string | null;
  // yyyy-mm-dd
  dueDate: string;
  noticeDays: number;
  notes: string;
}

// How far ahead each kind typically requires action. Leases and PM agreements
// commonly need 60-day notice; carriers quote renewals ~30 days out.
export const LEASE_RENEWAL_NOTICE_DAYS = 60;
export const INSURANCE_RENEWAL_NOTICE_DAYS = 30;
export const PM_AGREEMENT_NOTICE_DAYS = 60;

// Only live leases generate renewal obligations.
const LEASE_STATUSES = new Set(["active", "month_to_month"]);

export function deriveObligations(sources: {
  leases: LeaseSource[];
  policies: PolicySource[];
  pmAgreements: PmAgreementSource[];
}): ObligationSpec[] {
  const specs: ObligationSpec[] = [];

  for (const lease of sources.leases) {
    if (!LEASE_STATUSES.has(lease.status)) continue;
    const where = [lease.propertyName, lease.unitLabel].filter(Boolean).join(" ");
    specs.push({
      obligationType: "lease_renewal",
      relatedId: lease.id,
      propertyId: lease.propertyId,
      dueDate: lease.endDate,
      noticeDays: LEASE_RENEWAL_NOTICE_DAYS,
      notes: `Lease for ${lease.tenantName}${where ? ` (${where})` : ""} ends ${lease.endDate}.`,
    });
  }

  for (const policy of sources.policies) {
    specs.push({
      obligationType: "insurance_renewal",
      relatedId: policy.id,
      propertyId: policy.propertyId,
      dueDate: policy.renewalDate,
      noticeDays: INSURANCE_RENEWAL_NOTICE_DAYS,
      notes:
        `${policy.carrier} ${policy.policyType.replaceAll("_", " ")} policy` +
        `${policy.propertyName ? ` on ${policy.propertyName}` : ""} renews ${policy.renewalDate}.`,
    });
  }

  for (const agreement of sources.pmAgreements) {
    specs.push({
      obligationType: "pm_agreement_renewal",
      relatedId: agreement.id,
      propertyId: agreement.propertyId,
      dueDate: agreement.endDate,
      noticeDays: PM_AGREEMENT_NOTICE_DAYS,
      notes:
        `Management agreement with ${agreement.pmCompanyName}` +
        `${agreement.propertyName ? ` for ${agreement.propertyName}` : ""} ends ${agreement.endDate}.`,
    });
  }

  return specs;
}
