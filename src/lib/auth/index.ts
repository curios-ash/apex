import { getClerkSession } from "./clerk";
import { getDevSession } from "./dev";
import type { ApexSession } from "./types";

export { isDevAuthEnabled } from "./dev";
export type { ApexSession } from "./types";

// Single entry point for "who is calling". Provider order: Clerk once its
// keys are configured, then the dev provider when its flag is on. A null
// session is not an error — internal pages fall back to the pre-auth
// workspace resolution in src/lib/workspace.ts (R0 behavior).
export async function getSession(): Promise<ApexSession | null> {
  if (process.env.CLERK_SECRET_KEY) {
    const session = await getClerkSession();
    if (session) return session;
  }
  return getDevSession();
}
