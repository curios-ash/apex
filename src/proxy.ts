import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

// Next.js 16 Proxy (formerly middleware). Clerk attaches the session so
// `auth()` works in Server Components. When Clerk keys are absent (local
// without Marketplace keys), this is a no-op so the app keeps using the
// dev provider / pre-auth workspace resolution.

const INTERNAL_APP_PREFIXES = [
  "/upload",
  "/verify",
  "/exceptions",
  "/actions",
  "/calendar",
  "/review",
  "/ledger",
  "/budget",
  "/dossiers",
  "/evidence",
  "/export",
  "/activity",
  "/onboarding",
  "/billing",
] as const;

function isClerkConfigured(): boolean {
  return Boolean(
    process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
}

function isInternalAppPath(pathname: string): boolean {
  return INTERNAL_APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Public surfaces stay open even with Clerk on: marketing, free audit tool,
// shared dossiers, waitlist API, inbound/webhook/cron endpoints, and sign-in.
function isAlwaysPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/audit" || pathname.startsWith("/audit/")) return true;
  if (pathname.startsWith("/share/")) return true;
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return true;
  if (pathname.startsWith("/api/waitlist")) return true;
  if (pathname.startsWith("/api/audit")) return true;
  if (pathname.startsWith("/api/inbound-email")) return true;
  if (pathname.startsWith("/api/billing/webhook")) return true;
  if (pathname.startsWith("/api/cron/")) return true;
  return false;
}

const clerkHandler = isClerkConfigured()
  ? clerkMiddleware(async (auth, req) => {
      const { pathname } = req.nextUrl;
      if (isAlwaysPublicPath(pathname)) return;
      if (isInternalAppPath(pathname)) {
        await auth.protect();
      }
    })
  : null;

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (clerkHandler) return clerkHandler(req, event);
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
    // Clerk Frontend API proxy path (when enabled).
    "/__clerk/(.*)",
  ],
};
