import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";
import { slugifyWorkspaceName } from "@/onboarding";

import type { ApexSession } from "./types";
import { isClerkConfigured } from "./configured";

export { isClerkConfigured } from "./configured";

// Clerk provider — production auth (magic link + Google). Wired when
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY are set (Vercel
// Marketplace). Without keys, getClerkSession returns null and the app
// falls back to the dev provider (APEX_DEV_AUTH_ENABLED) or pre-auth
// workspace resolution.
//
// Integration points:
//   1. `@clerk/nextjs` installed; root layout wraps in <ClerkProvider>
//      when keys exist; `src/proxy.ts` runs clerkMiddleware.
//   2. getClerkSession: Clerk auth() → users.external_auth_id → workspace.
//   3. First-seen Clerk user: create workspace + user in one transaction
//      (or link an existing users.email row to the Clerk id).
//   4. /sign-in renders Clerk <SignIn /> when configured; the dev
//      provider stays available for local work without Clerk keys.

function primaryEmail(clerkUser: {
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses: { emailAddress: string }[];
}): string | null {
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
  return email ? email.trim().toLowerCase() : null;
}

async function sessionForUser(row: {
  userId: string;
  email: string;
  workspaceId: string;
  workspaceSlug: string;
}): Promise<ApexSession> {
  return { ...row, provider: "clerk" };
}

async function lookupByExternalAuthId(clerkUserId: string): Promise<ApexSession | null> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      workspaceId: workspaces.id,
      workspaceSlug: workspaces.slug,
    })
    .from(users)
    .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
    .where(eq(users.externalAuthId, clerkUserId))
    .limit(1);
  return rows[0] ? sessionForUser(rows[0]) : null;
}

async function provisionFirstSeenClerkUser(input: {
  clerkUserId: string;
  email: string;
  fullName: string | null;
}): Promise<ApexSession> {
  // Prefer linking an existing email (dev → Clerk migration) before creating.
  const [existingByEmail] = await db
    .select({
      userId: users.id,
      email: users.email,
      workspaceId: workspaces.id,
      workspaceSlug: workspaces.slug,
      externalAuthId: users.externalAuthId,
    })
    .from(users)
    .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
    .where(eq(users.email, input.email))
    .limit(1);

  if (existingByEmail) {
    if (existingByEmail.externalAuthId && existingByEmail.externalAuthId !== input.clerkUserId) {
      throw new Error(
        `Email ${input.email} is already linked to a different auth provider account.`,
      );
    }
    if (!existingByEmail.externalAuthId) {
      await db
        .update(users)
        .set({
          externalAuthId: input.clerkUserId,
          fullName: input.fullName ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByEmail.userId));
      await writeAuditLog({
        workspaceId: existingByEmail.workspaceId,
        actorUserId: existingByEmail.userId,
        actorType: "user",
        action: "auth.signed_in",
        targetType: "user",
        targetId: existingByEmail.userId,
        metadata: { provider: "clerk", email: input.email, linkedExisting: true },
      });
    }
    return sessionForUser({
      userId: existingByEmail.userId,
      email: existingByEmail.email,
      workspaceId: existingByEmail.workspaceId,
      workspaceSlug: existingByEmail.workspaceSlug,
    });
  }

  const displayName =
    input.fullName?.trim() ||
    input.email.split("@")[0]?.replace(/[.+]/g, " ") ||
    "My workspace";
  const baseSlug = slugifyWorkspaceName(displayName);
  let slug = baseSlug;
  for (let i = 2; ; i++) {
    const [taken] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);
    if (!taken) break;
    slug = `${baseSlug}-${i}`;
  }

  const created = await db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: displayName, slug })
      .returning();
    const [user] = await tx
      .insert(users)
      .values({
        workspaceId: workspace.id,
        email: input.email,
        fullName: input.fullName,
        role: "owner",
        externalAuthId: input.clerkUserId,
      })
      .returning();
    return { workspace, user };
  });

  await writeAuditLog({
    workspaceId: created.workspace.id,
    actorUserId: created.user.id,
    actorType: "user",
    action: "workspace.created",
    targetType: "workspace",
    targetId: created.workspace.id,
    metadata: { name: displayName, slug, provider: "clerk", email: input.email },
  });
  await writeAuditLog({
    workspaceId: created.workspace.id,
    actorUserId: created.user.id,
    actorType: "user",
    action: "auth.signed_in",
    targetType: "user",
    targetId: created.user.id,
    metadata: { provider: "clerk", email: input.email, firstSeen: true },
  });

  return sessionForUser({
    userId: created.user.id,
    email: created.user.email,
    workspaceId: created.workspace.id,
    workspaceSlug: created.workspace.slug,
  });
}

export async function getClerkSession(): Promise<ApexSession | null> {
  if (!isClerkConfigured()) return null;

  let clerkUserId: string | null = null;
  try {
    const session = await auth();
    clerkUserId = session.userId;
  } catch {
    // No request scope (scripts, build) or middleware not yet wired.
    return null;
  }
  if (!clerkUserId) return null;

  const existing = await lookupByExternalAuthId(clerkUserId);
  if (existing) return existing;

  let clerkUser;
  try {
    clerkUser = await currentUser();
  } catch {
    return null;
  }
  if (!clerkUser) return null;

  const email = primaryEmail(clerkUser);
  if (!email) return null;

  const fullName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    clerkUser.fullName ||
    null;

  try {
    return await provisionFirstSeenClerkUser({
      clerkUserId,
      email,
      fullName,
    });
  } catch (error) {
    // Concurrent first-seen requests: the unique external_auth_id insert
    // won elsewhere — re-read.
    const raced = await lookupByExternalAuthId(clerkUserId);
    if (raced) return raced;
    console.error("getClerkSession provision failed", error);
    return null;
  }
}
