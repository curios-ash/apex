import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";

import { AppChrome } from "@/components/app-chrome";
import { Button } from "@/components/ui/button";
import { getSession, isClerkConfigured, isDevAuthEnabled, type ApexSession } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/workspace";
import { devSignOut } from "@/app/sign-in/actions";

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

  const signOut = session ? (
    session.provider === "clerk" ? (
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
    )
  ) : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f1e6] text-[#1c1914]">
      <AppChrome
        workspaceName={workspaceName}
        sessionEmail={session?.email ?? null}
        signInHref={!session && (clerk || devAuth) ? "/sign-in" : null}
        signInLabel={clerk ? "Sign in" : "Sign in (dev)"}
        signOut={signOut}
      />
      {session?.provider === "dev" ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-800">
          DEV AUTH — development provider. Clerk replaces this when keys are present.
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-[#d7cbb8] px-4 py-4 text-center text-xs text-[#6b6358]">
        Engine math is {""}
        <span className="font-medium text-[#1c1914]">finance-v1</span>
        . Models extract documents — they never compute NOI, DSCR, or cash-on-cash.{" "}
        <Link href="/portfolio" className="underline decoration-[#c45c26]/60 underline-offset-2">
          Already own doors?
        </Link>
      </footer>
    </div>
  );
}
