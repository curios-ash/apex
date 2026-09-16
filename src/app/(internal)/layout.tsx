import Link from "next/link";
import { Landmark } from "lucide-react";

import { getActiveWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  let workspaceName: string | null = null;
  try {
    workspaceName = (await getActiveWorkspace()).name;
  } catch {
    workspaceName = null;
  }

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
            </nav>
          </div>
          {workspaceName ? (
            <span className="text-xs text-stone-500">
              Workspace: <span className="font-medium text-stone-700">{workspaceName}</span>
            </span>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
