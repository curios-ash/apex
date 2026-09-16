import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";

import type { ApexSession } from "./types";

// Dev-mode auth provider: a signed cookie holding { userId, workspaceId }.
// No passwords, no external provider — it exists so the whole app is usable
// end-to-end before Clerk is provisioned. Gated behind
// APEX_DEV_AUTH_ENABLED; when the flag is off the sign-in page 404s and
// getSession() never consults this provider. Never enable in production:
// the cookie secret defaults to a well-known value.

export const DEV_SESSION_COOKIE = "apex_dev_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_DEV_SECRET = "apex-dev-auth-insecure-default";

export function isDevAuthEnabled(): boolean {
  const flag = process.env.APEX_DEV_AUTH_ENABLED;
  return flag === "1" || flag === "true";
}

function devSecret(): string {
  return process.env.APEX_DEV_AUTH_SECRET ?? DEFAULT_DEV_SECRET;
}

interface DevSessionPayload {
  userId: string;
  workspaceId: string;
  email: string;
  exp: number;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", devSecret()).update(payload).digest("base64url");
}

// Exported for tests and for the sign-in server action.
export function encodeDevSession(input: {
  userId: string;
  workspaceId: string;
  email: string;
  now?: number;
}): string {
  const payload: DevSessionPayload = {
    userId: input.userId,
    workspaceId: input.workspaceId,
    email: input.email,
    exp: (input.now ?? Date.now()) + SESSION_TTL_MS,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function decodeDevSession(cookie: string, now = Date.now()): DevSessionPayload | null {
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = cookie.slice(0, dot);
  const signature = cookie.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as DevSessionPayload;
    if (typeof payload.userId !== "string" || typeof payload.workspaceId !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

// Reads + validates the dev cookie, then confirms the user still belongs to
// the workspace (a stale cookie for a deleted row just signs you out).
// Never throws outside a request scope — returns null instead.
export async function getDevSession(): Promise<ApexSession | null> {
  if (!isDevAuthEnabled()) return null;
  let cookieValue: string | undefined;
  try {
    cookieValue = (await cookies()).get(DEV_SESSION_COOKIE)?.value;
  } catch {
    return null; // no request scope (scripts, build-time)
  }
  if (!cookieValue) return null;
  const payload = decodeDevSession(cookieValue);
  if (!payload) return null;

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      workspaceId: workspaces.id,
      workspaceSlug: workspaces.slug,
    })
    .from(users)
    .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
    .where(and(eq(users.id, payload.userId), eq(users.workspaceId, payload.workspaceId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row, provider: "dev" };
}
