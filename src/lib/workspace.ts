import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";

// Pre-auth workspace resolution for the internal (R0) tools. Every query is
// still workspace-scoped; this just picks which workspace the internal pages
// and webhooks operate on until Clerk/WorkOS lands:
//   1. APEX_WORKSPACE_SLUG when set,
//   2. otherwise the oldest workspace,
//   3. otherwise a "demo" workspace is created so first run works.

export interface ActiveWorkspace {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string | null;
}

export async function getWorkspaceBySlug(slug: string) {
  const rows = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function getActiveWorkspace(): Promise<ActiveWorkspace> {
  const configuredSlug = process.env.APEX_WORKSPACE_SLUG;

  let workspace = configuredSlug ? await getWorkspaceBySlug(configuredSlug) : null;
  if (configuredSlug && !workspace) {
    throw new Error(
      `APEX_WORKSPACE_SLUG is "${configuredSlug}" but no workspace with that slug exists. Run npm run db:seed.`,
    );
  }

  if (!workspace) {
    const rows = await db.select().from(workspaces).orderBy(asc(workspaces.createdAt)).limit(1);
    workspace = rows[0] ?? null;
  }

  if (!workspace) {
    // Layout and page can race this insert on first run — conflict means the
    // other request won, so re-select.
    await db
      .insert(workspaces)
      .values({ name: "Demo Workspace", slug: "demo" })
      .onConflictDoNothing({ target: workspaces.slug });
    const [created] = await db.select().from(workspaces).where(eq(workspaces.slug, "demo")).limit(1);
    workspace = created;
  }

  const ownerRows = await db
    .select()
    .from(users)
    .where(and(eq(users.workspaceId, workspace.id), eq(users.role, "owner")))
    .limit(1);

  let ownerUserId = ownerRows[0]?.id ?? null;
  if (!ownerUserId) {
    const [owner] = await db
      .insert(users)
      .values({
        workspaceId: workspace.id,
        email: `owner@${workspace.slug}.apex.local`,
        fullName: "Workspace Owner",
        role: "owner",
      })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (owner) {
      ownerUserId = owner.id;
    } else {
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, `owner@${workspace.slug}.apex.local`))
        .limit(1);
      ownerUserId = existing?.id ?? null;
    }
  }

  return { id: workspace.id, name: workspace.name, slug: workspace.slug, ownerUserId };
}
