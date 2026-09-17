"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DEV_SESSION_COOKIE, encodeDevSession, isDevAuthEnabled } from "@/lib/auth/dev";
import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { properties, users, workspaces } from "@/lib/db/schema";

export type DevSignInState = { ok: boolean; message: string } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Dev-mode sign-in: pick a workspace, enter an email, get a signed session
// cookie. No password — this exists only behind APEX_DEV_AUTH_ENABLED so the
// app is usable end-to-end before Clerk is provisioned. A new email joins
// the selected workspace (owner if it has none yet); an existing email signs
// into the workspace it already belongs to (users.email is globally unique).
export async function devSignIn(
  _prev: DevSignInState,
  formData: FormData,
): Promise<DevSignInState> {
  if (!isDevAuthEnabled()) return { ok: false, message: "Dev sign-in is disabled." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  if (!EMAIL_RE.test(email)) return { ok: false, message: "Enter a valid email address." };

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return { ok: false, message: "Pick a workspace." };

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    const [existingOwner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.workspaceId, workspace.id))
      .limit(1);
    [user] = await db
      .insert(users)
      .values({
        workspaceId: workspace.id,
        email,
        role: existingOwner ? "member" : "owner",
      })
      .returning();
  }

  (await cookies()).set(DEV_SESSION_COOKIE, encodeDevSession({
    userId: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
  }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  await writeAuditLog({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    actorType: "user",
    action: "auth.signed_in",
    targetType: "user",
    targetId: user.id,
    metadata: { provider: "dev", email: user.email },
  });

  // New workspaces go straight to onboarding; established ones to the review.
  const [firstProperty] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.workspaceId, user.workspaceId))
    .limit(1);
  redirect(firstProperty ? "/deals" : "/onboarding");
}

export async function devSignOut() {
  (await cookies()).delete(DEV_SESSION_COOKIE);
  redirect("/sign-in");
}
