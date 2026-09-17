import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { Landmark } from "lucide-react";

import { getSession, isClerkConfigured, isDevAuthEnabled, type ApexSession } from "@/lib/auth";
import { devSignOut } from "@/app/sign-in/actions";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  let workspaceName: string | null = null;
  let session: ApexSession | null = null;
  try {
    session = await getSession();
    workspaceName = (await getActiveWorkspace()).name;
  } catch {
    workspaceName = null;
  }
  const clerk = isClerkConfigured();
  const devAuth = isDevAuthEnabled();

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-700 text-white">
                <Landmark className="size-3.5" aria-hidden />
              </span>
              Apex
              <span className="rounded-full border border-stone-300 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-stone-500 uppercase">
                Internal
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium text-stone-600">
              <Link href="/upload" className="hover:text-stone-900">
                Upload
              </Link>
              <Link href="/verify" className="hover:text-stone-900">
                Verify
              </Link>
              <Link href="/exceptions" className="hover:text-stone-900">
                Exceptions
              </Link>
              <Link href="/actions" className="hover:text-stone-900">
                Actions
              </Link>
              <Link href="/calendar" className="hover:text-stone-900">
                Calendar
              </Link>
              <Link href="/review" className="hover:text-stone-900">
                Review
              </Link>
              <Link href="/ledger" className="hover:text-stone-900">
                Ledger
              </Link>
              <Link href="/budget" className="hover:text-stone-900">
                Budget
              </Link>
              <Link href="/dossiers" className="hover:text-stone-900">
                Dossiers
              </Link>
              <Link href="/evidence" className="hover:text-stone-900">
                Evidence
              </Link>
              <Link href="/export" className="hover:text-stone-900">
                Export
              </Link>
              <Link href="/activity" className="hover:text-stone-900">
                Activity
              </Link>
              <Link href="/onboarding" className="hover:text-stone-900">
                Onboarding
              </Link>
              <Link href="/billing" className="hover:text-stone-900">
                Billing
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs text-stone-500">
            {workspaceName ? (
              <span>
                Workspace: <span className="font-medium text-stone-700">{workspaceName}</span>
              </span>
            ) : null}
            {session ? (
              <div className="flex items-center gap-2">
                <span className="font-medium text-stone-700">{session.email}</span>
                {session.provider === "clerk" ? (
                  <SignOutButton>
                    <Button type="button" variant="outline" size="xs">
                      Sign out
                    </Button>
                  </SignOutButton>
                ) : (
                  <form action={devSignOut}>
                    <Button type="submit" variant="outline" size="xs">
                      Sign out
                    </Button>
                  </form>
                )}
              </div>
            ) : clerk || devAuth ? (
              <Link href="/sign-in" className="font-medium text-emerald-700 hover:underline">
                {clerk ? "Sign in" : "Sign in (dev)"}
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      {session?.provider === "dev" ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-800">
          DEV AUTH — signed in with the development provider. Not for production; Clerk replaces
          this when keys are present (see README).
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
