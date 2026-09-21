"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Landmark, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";

function dealIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/deals\/([^/]+)/);
  return match?.[1] ?? null;
}

export function AppChrome({
  workspaceName,
  sessionEmail,
  signInHref,
  signInLabel,
  signOut,
}: {
  workspaceName: string | null;
  sessionEmail: string | null;
  signInHref: string | null;
  signInLabel: string | null;
  signOut: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dealId = dealIdFromPath(pathname);
  const onFind = pathname === "/deals";
  const onEvaluate = Boolean(dealId);

  const findClass = onFind
    ? "bg-[#1c1914] text-[#f4e6c8]"
    : "text-[#1c1914] hover:bg-[#1c1914]/5";
  const evaluateClass = onEvaluate
    ? "bg-[#1c1914] text-[#f4e6c8]"
    : "text-[#1c1914] hover:bg-[#1c1914]/5";

  return (
    <header className="sticky top-0 z-20 border-b border-[#d7cbb8] bg-[#f7f1e6]/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/deals"
          className="flex min-h-12 items-center gap-2 font-semibold tracking-tight text-[#1c1914]"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#1c1914] text-[#f4e6c8]">
            <Landmark className="size-4" aria-hidden />
          </span>
          <span className="font-[family-name:var(--font-heading)] text-lg">Apex</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Launch">
          <Link
            href="/deals"
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${findClass}`}
            aria-current={onFind ? "page" : undefined}
          >
            Find
          </Link>
          {dealId ? (
            <Link
              href={`/deals/${dealId}`}
              className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${evaluateClass}`}
              aria-current={onEvaluate ? "page" : undefined}
            >
              Evaluate
            </Link>
          ) : null}
        </nav>

        <div className="flex items-center gap-2">
          {workspaceName ? (
            <span className="hidden max-w-[8rem] truncate text-xs text-[#6b6358] md:inline">
              {workspaceName}
            </span>
          ) : null}
          {sessionEmail ? (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="max-w-[10rem] truncate text-xs font-medium text-[#1c1914]">
                {sessionEmail}
              </span>
              {signOut}
            </div>
          ) : signInHref ? (
            <Link
              href={signInHref}
              className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[#9a3f12]"
            >
              {signInLabel}
            </Link>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 sm:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-[#d7cbb8] bg-[#f3ead8] px-4 py-3 sm:hidden" aria-label="Launch">
          <Link
            href="/deals"
            onClick={() => setOpen(false)}
            className="flex min-h-14 items-center rounded-xl px-3 text-base font-semibold text-[#1c1914]"
          >
            Find a deal
          </Link>
          {dealId ? (
            <Link
              href={`/deals/${dealId}`}
              onClick={() => setOpen(false)}
              className="flex min-h-14 items-center rounded-xl px-3 text-base font-semibold text-[#1c1914]"
            >
              Evaluate this deal
            </Link>
          ) : (
            <p className="px-3 py-3 text-sm text-[#6b6358]">
              Open an address to evaluate it.
            </p>
          )}
          {sessionEmail ? (
            <div className="mt-2 border-t border-[#d7cbb8] px-3 pt-3 text-sm">{signOut}</div>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
