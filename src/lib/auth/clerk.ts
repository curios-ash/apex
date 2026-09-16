import type { ApexSession } from "./types";

// Clerk provider — the production auth choice (master plan Part 3: magic
// link + Google only). This is a documented stub: the session contract is
// final, the Clerk wiring lands when Ashwin provisions the Vercel
// Marketplace install. Setup steps live in the README ("Auth — Clerk").
//
// Integration points, in order:
//   1. `npm install @clerk/nextjs`; wrap `src/app/layout.tsx` in
//      <ClerkProvider>. Env: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY +
//      CLERK_SECRET_KEY (injected by the Marketplace install).
//   2. Replace the body of getClerkSession below with Clerk's `auth()`
//      (server-side). Map `userId` (Clerk user id) →
//      users.external_auth_id, joining to the workspace through `users`.
//   3. First sign-in for a new Clerk user: create workspace + user row in
//      one transaction (same shape as the dev sign-in action in
//      src/app/sign-in/actions.ts), then set external_auth_id.
//   4. Delete the dev provider: remove dev.ts, the /sign-in page, and the
//      APEX_DEV_AUTH_ENABLED flag; point sign-in at Clerk's <SignIn />.
export async function getClerkSession(): Promise<ApexSession | null> {
  // Intentionally null until @clerk/nextjs is installed — the app falls back
  // to the dev provider (flag on) or the pre-auth workspace resolution.
  return null;
}
