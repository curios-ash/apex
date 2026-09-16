"use server";

import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { DEV_SESSION_COOKIE, encodeDevSession, isDevAuthEnabled } from "@/lib/auth/dev";
import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  budgetLines,
  loans,
  pmAgreements,
  properties,
  units,
  users,
  workspaces,
  type propertyTypeEnum,
} from "@/lib/db/schema";
import { financeV1 } from "@/finance/v1";
import { transactionCategories } from "@/lib/llm/schemas";
import { runReconciliation } from "@/lib/reconcile/run";
import { getActiveWorkspace } from "@/lib/workspace";
import { nextMonths, parseDollarsToCents, slugifyWorkspaceName } from "@/onboarding";

type PropertyType = (typeof propertyTypeEnum.enumValues)[number];
const PROPERTY_TYPES = new Set<PropertyType>([
  "sfr",
  "condo",
  "townhome",
  "duplex",
  "triplex",
  "fourplex",
  "multi_5plus",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function onboardingUrl(step: string, params: Record<string, string> = {}): string {
  const search = new URLSearchParams({ step, ...params });
  return `/onboarding?${search.toString()}`;
}

function fail(step: string, message: string, params: Record<string, string> = {}): never {
  redirect(onboardingUrl(step, { ...params, error: message }));
}

const parseDollars = parseDollarsToCents;

function parseDate(raw: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
}

// --- Step 1: workspace -----------------------------------------------------

// Creates the workspace + owner user and signs in (dev provider), or renames
// the current workspace when signed in. One user per workspace for now —
// users.email is globally unique and there is no memberships table yet.
export async function saveWorkspace(formData: FormData) {
  const session = await getSession();
  const name = String(formData.get("name") ?? "").trim();
  if (name === "") fail("workspace", "Give the workspace a name.");

  if (session) {
    await db.update(workspaces).set({ name, updatedAt: new Date() }).where(eq(workspaces.id, session.workspaceId));
    await writeAuditLog({
      workspaceId: session.workspaceId,
      actorUserId: session.userId,
      actorType: "user",
      action: "workspace.renamed",
      targetType: "workspace",
      targetId: session.workspaceId,
      metadata: { name },
    });
    revalidatePath("/onboarding");
    redirect(onboardingUrl("property"));
  }

  if (!isDevAuthEnabled()) {
    fail("workspace", "Sign-in is disabled — set APEX_DEV_AUTH_ENABLED to create a workspace here.");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) fail("workspace", "Enter a valid email address.");

  // An existing email signs into its own workspace instead of duplicating.
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    (await cookies()).set(DEV_SESSION_COOKIE, encodeDevSession({
      userId: existingUser.id,
      workspaceId: existingUser.workspaceId,
      email: existingUser.email,
    }), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
    redirect(onboardingUrl("property"));
  }

  const baseSlug = slugifyWorkspaceName(name);
  let slug = baseSlug;
  for (let i = 2; ; i++) {
    const [taken] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${baseSlug}-${i}`;
  }

  const [workspace] = await db.insert(workspaces).values({ name, slug }).returning();
  const [user] = await db
    .insert(users)
    .values({ workspaceId: workspace.id, email, role: "owner" })
    .returning();

  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: user.id,
    actorType: "user",
    action: "workspace.created",
    targetType: "workspace",
    targetId: workspace.id,
    metadata: { name, slug, provider: "dev" },
  });

  (await cookies()).set(DEV_SESSION_COOKIE, encodeDevSession({
    userId: user.id,
    workspaceId: workspace.id,
    email,
  }), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
  redirect(onboardingUrl("property"));
}

// --- Step 2: property (+ units + optional loan) ----------------------------

export async function saveProperty(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const propertyId = String(formData.get("propertyId") ?? "");

  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const zip = String(formData.get("zip") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || addressLine1;
  const params: Record<string, string> = propertyId ? { property: propertyId } : {};
  if (!addressLine1 || !city || !state || !zip) {
    fail("property", "Address, city, state, and ZIP are required.", params);
  }

  const rawType = String(formData.get("propertyType") ?? "sfr");
  const propertyType = (PROPERTY_TYPES.has(rawType as PropertyType) ? rawType : "sfr") as PropertyType;
  const purchasePriceCents = parseDollars(String(formData.get("purchasePrice") ?? ""));
  const purchaseDate = parseDate(String(formData.get("purchaseDate") ?? ""));
  if (String(formData.get("purchasePrice") ?? "").trim() !== "" && purchasePriceCents === null) {
    fail("property", "Purchase price must be a non-negative dollar amount.", params);
  }

  let id = propertyId;
  if (id) {
    const [owned] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.id, id), eq(properties.workspaceId, workspace.id)))
      .limit(1);
    if (!owned) fail("property", "Property not found in this workspace.");
    await db
      .update(properties)
      .set({
        name,
        addressLine1,
        city,
        state,
        zip,
        propertyType,
        purchasePriceCents,
        purchaseDate,
        updatedAt: new Date(),
      })
      .where(eq(properties.id, id));
  } else {
    const [created] = await db
      .insert(properties)
      .values({
        workspaceId: workspace.id,
        name,
        addressLine1,
        city,
        state,
        zip,
        propertyType,
        purchasePriceCents,
        purchaseDate,
      })
      .returning();
    id = created.id;
  }

  // Units: create up to the requested count (edits never delete units).
  const unitCountRaw = Number(String(formData.get("unitCount") ?? "1"));
  const unitCount = Number.isInteger(unitCountRaw) ? Math.min(Math.max(unitCountRaw, 0), 50) : 1;
  const unitRentCents = parseDollars(String(formData.get("unitRent") ?? ""));
  const existingUnits = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.workspaceId, workspace.id), eq(units.propertyId, id)))
    .orderBy(asc(units.createdAt));
  for (let i = existingUnits.length; i < unitCount; i++) {
    await db.insert(units).values({
      workspaceId: workspace.id,
      propertyId: id,
      label: `Unit ${i + 1}`,
      marketRentCents: unitRentCents,
    });
  }

  // Loan basics (optional). The monthly payment is computed by the
  // deterministic finance engine — never entered by hand, never by an LLM.
  const loanPrincipalCents = parseDollars(String(formData.get("loanPrincipal") ?? ""));
  const ratePctRaw = String(formData.get("loanRatePct") ?? "").trim();
  const termMonthsRaw = Number(String(formData.get("loanTermMonths") ?? ""));
  let loanId: string | null = null;
  if (loanPrincipalCents !== null && loanPrincipalCents > 0) {
    const ratePct = Number(ratePctRaw);
    const termMonths = Number.isInteger(termMonthsRaw) && termMonthsRaw > 0 ? termMonthsRaw : 360;
    if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 30) {
      fail("property", "Loan rate must be a percentage between 0 and 30.", { property: id });
    }
    const monthlyPaymentCents = financeV1.monthlyMortgagePayment({
      principalCents: loanPrincipalCents,
      annualRate: ratePct / 100,
      termMonths,
    });
    const startDate = parseDate(String(formData.get("loanStartDate") ?? ""));
    const [existingLoan] = await db
      .select({ id: loans.id })
      .from(loans)
      .where(and(eq(loans.workspaceId, workspace.id), eq(loans.propertyId, id)))
      .limit(1);
    if (existingLoan) {
      await db
        .update(loans)
        .set({
          originalPrincipalCents: loanPrincipalCents,
          currentBalanceCents: loanPrincipalCents,
          interestRateBps: Math.round(ratePct * 100),
          termMonths,
          monthlyPaymentCents,
          startDate,
          updatedAt: new Date(),
        })
        .where(eq(loans.id, existingLoan.id));
      loanId = existingLoan.id;
    } else {
      const [created] = await db
        .insert(loans)
        .values({
          workspaceId: workspace.id,
          propertyId: id,
          originalPrincipalCents: loanPrincipalCents,
          currentBalanceCents: loanPrincipalCents,
          interestRateBps: Math.round(ratePct * 100),
          termMonths,
          monthlyPaymentCents,
          startDate,
        })
        .returning();
      loanId = created.id;
    }
  }

  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: propertyId ? "property.updated" : "property.created",
    targetType: "property",
    targetId: id,
    metadata: {
      name,
      propertyType,
      units: Math.max(unitCount, existingUnits.length),
      purchasePriceCents,
      loanId,
    },
  });

  revalidatePath("/onboarding");
  revalidatePath("/review");
  redirect(onboardingUrl("pm", { property: id }));
}

// --- Step 3: PM agreement --------------------------------------------------

export async function savePmAgreement(formData: FormData) {
  const workspace = await getActiveWorkspace();
  const propertyId = String(formData.get("propertyId") ?? "");
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, workspace.id)))
    .limit(1);
  if (!property) fail("pm", "Add a property first.");

  const pmCompanyName = String(formData.get("pmCompanyName") ?? "").trim();
  const feePctRaw = String(formData.get("feePercent") ?? "").trim();
  const feePct = Number(feePctRaw);
  if (pmCompanyName === "") fail("pm", "Name the property manager (or skip this step).", { property: propertyId });
  if (!Number.isFinite(feePct) || feePct <= 0 || feePct > 50) {
    fail("pm", "Management fee must be a percentage between 0 and 50.", { property: propertyId });
  }
  const feeBps = Math.round(feePct * 100);
  const endDate = parseDate(String(formData.get("renewalDate") ?? ""));
  const startDate = parseDate(String(formData.get("startDate") ?? ""));
  const leasingFeeCents = parseDollars(String(formData.get("leasingFee") ?? ""));

  const [existing] = await db
    .select({ id: pmAgreements.id })
    .from(pmAgreements)
    .where(and(eq(pmAgreements.workspaceId, workspace.id), eq(pmAgreements.propertyId, propertyId)))
    .limit(1);

  let agreementId: string;
  if (existing) {
    await db
      .update(pmAgreements)
      .set({ pmCompanyName, feeBps, leasingFeeCents, startDate, endDate, updatedAt: new Date() })
      .where(eq(pmAgreements.id, existing.id));
    agreementId = existing.id;
  } else {
    const [created] = await db
      .insert(pmAgreements)
      .values({
        workspaceId: workspace.id,
        propertyId,
        pmCompanyName,
        feeBps,
        leasingFeeCents,
        startDate,
        endDate,
      })
      .returning();
    agreementId = created.id;
  }

  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: "pm_agreement.saved",
    targetType: "pm_agreement",
    targetId: agreementId,
    metadata: { propertyId, pmCompanyName, feeBps, endDate },
  });

  // The fee-drift rule reads the agreement — re-run so findings match the
  // terms the owner just confirmed.
  await runReconciliation(workspace.id, { propertyId }).catch((error) =>
    console.error("reconciliation after PM agreement save failed", error),
  );
  revalidatePath("/onboarding");
  revalidatePath("/exceptions");
  redirect(onboardingUrl("budget", { property: propertyId }));
}

// --- Step 4: budget ---------------------------------------------------------

export type OnboardingBudgetState = { ok: boolean; message: string } | null;

// Writes the wizard's budget lines to the current month plus the next 11, so
// the review page has a plan to reconcile against all year. Every line stays
// editable per-month on /budget afterward.
export async function saveOnboardingBudget(
  _prev: OnboardingBudgetState,
  formData: FormData,
): Promise<OnboardingBudgetState> {
  const workspace = await getActiveWorkspace();
  const propertyId = String(formData.get("propertyId") ?? "");
  const source = String(formData.get("source") ?? "purchase");
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, workspace.id)))
    .limit(1);
  if (!property) return { ok: false, message: "Property not found in this workspace." };

  const entries: { category: string; amountCents: number }[] = [];
  for (const category of transactionCategories) {
    const raw = String(formData.get(`amount:${category}`) ?? "");
    if (raw.trim() === "") continue;
    const amountCents = parseDollars(raw);
    if (amountCents === null) {
      return { ok: false, message: `"${category.replaceAll("_", " ")}" must be a non-negative dollar amount.` };
    }
    entries.push({ category, amountCents });
  }
  if (entries.length === 0) {
    return { ok: false, message: "Enter at least one budget line, or skip this step." };
  }

  const currentMonth = `${new Date().toISOString().slice(0, 7)}-01`;
  const months = nextMonths(currentMonth, 12);
  let upserted = 0;
  for (const month of months) {
    for (const entry of entries) {
      await db
        .insert(budgetLines)
        .values({
          workspaceId: workspace.id,
          propertyId,
          category: entry.category as (typeof transactionCategories)[number],
          month,
          amountCents: entry.amountCents,
        })
        .onConflictDoUpdate({
          target: [
            budgetLines.workspaceId,
            budgetLines.propertyId,
            budgetLines.category,
            budgetLines.month,
          ],
          set: { amountCents: entry.amountCents },
        });
      upserted += 1;
    }
  }

  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: workspace.ownerUserId,
    actorType: "user",
    action: "budget.saved",
    targetType: "property",
    targetId: propertyId,
    metadata: { source, months: months.length, lines: entries.length, upserted, via: "onboarding" },
  });

  await runReconciliation(workspace.id, { propertyId }).catch((error) =>
    console.error("reconciliation after onboarding budget save failed", error),
  );
  revalidatePath("/budget");
  revalidatePath("/review");
  revalidatePath("/exceptions");
  redirect(`/review?property=${propertyId}&month=${currentMonth}`);
}
