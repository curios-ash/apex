import Link from "next/link";
import { notFound } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { Landmark } from "lucide-react";

import { getSession, isClerkConfigured, isDevAuthEnabled } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";

import { SignInForm } from "../sign-in-form";

export const dynamic = "force-dynamic";

// Production: Clerk <SignIn /> when keys are present.
// Local/dev: email + workspace picker gated behind APEX_DEV_AUTH_ENABLED.
// With neither Clerk nor the flag, this route 404s.
export default async function SignInPage() {
  if (isClerkConfigured()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 px-4 text-stone-900">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <Landmark className="size-4" aria-hidden />
            </span>
            Apex
          </div>
          <SignIn
            routing="path"
            path="/sign-in"
            fallbackRedirectUrl="/deals"
            signUpUrl="/sign-in"
          />
          <p className="mt-4 text-center text-sm text-stone-500">
            Magic link or Google — same account for the whole workspace.
          </p>
        </div>
      </div>
    );
  }

  if (!isDevAuthEnabled()) notFound();

  const session = await getSession();
  const workspaceRows = await db
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
    .from(workspaces)
    .orderBy(workspaces.name);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 px-4 text-stone-900">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-700 text-white">
            <Landmark className="size-4" aria-hidden />
          </span>
          Apex
        </div>

        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-800 uppercase">
              Dev only
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            No password — pick a workspace and any email. This sign-in exists for local
            development; production uses Clerk.
          </p>

          {session ? (
            <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Signed in as <span className="font-medium">{session.email}</span>
              {" · "}
              <Link href="/deals" className="font-medium underline">
                Continue to Find
              </Link>
            </p>
          ) : null}

          <SignInForm
            workspaces={workspaceRows.map((w) => ({ id: w.id, name: w.name, slug: w.slug }))}
          />
        </div>

        <p className="mt-4 text-center text-sm text-stone-500">
          After you sign in, you land on Find — search an address and open the deal.
        </p>
      </div>
    </div>
  );
}
