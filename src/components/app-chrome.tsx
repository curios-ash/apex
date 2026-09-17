"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Compass, Landmark, MapPinned, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const BUYER = [
  { href: "/deals", label: "Find a deal" },
];

const BOOK = [
  { href: "/portfolio", label: "Portfolio" },
];

const OWNER = [
  { href: "/review", label: "Reviews" },
  { href: "/upload", label: "Uploads" },
  { href: "/verify", label: "Verify" },
  { href: "/exceptions", label: "Exceptions" },
  { href: "/actions", label: "Actions" },
  { href: "/calendar", label: "Calendar" },
  { href: "/ledger", label: "Ledger" },
  { href: "/budget", label: "Budget" },
  { href: "/dossiers", label: "Dossiers" },
  { href: "/evidence", label: "Evidence" },
  { href: "/export", label: "Export" },
  { href: "/activity", label: "Activity" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/billing", label: "Billing" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
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
  const [opsOpen, setOpsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-[#d7cbb8] bg-[#f7f1e6]/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/deals" className="flex items-center gap-2 font-semibold tracking-tight text-[#1c1914]">
            <span className="flex size-8 items-center justify-center rounded-md bg-[#1c1914] text-[#f4e6c8]">
              <Landmark className="size-3.5" aria-hidden />
            </span>
            <span className="font-[family-name:var(--font-heading)] text-lg">Apex</span>
            <span className="hidden rounded-full border border-[#c45c26]/40 bg-[#c45c26]/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-[#9a3f12] uppercase sm:inline">
              Buyer
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {BUYER.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                  isActive(pathname, item.href)
                    ? "bg-[#1c1914] text-[#f4e6c8]"
                    : "text-[#4a4338] hover:bg-[#1c1914]/5"
                }`}
              >
                <Compass className="size-3.5" aria-hidden />
                {item.label}
              </Link>
            ))}
            {BOOK.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                  isActive(pathname, item.href)
                    ? "bg-[#1c1914] text-[#f4e6c8]"
                    : "text-[#4a4338] hover:bg-[#1c1914]/5"
                }`}
              >
                <MapPinned className="size-3.5" aria-hidden />
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setOpsOpen((v) => !v)}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-[#4a4338] hover:bg-[#1c1914]/5"
            >
              Owner ops
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {workspaceName ? (
            <span className="hidden max-w-[10rem] truncate text-xs text-[#6b6358] sm:inline">
              {workspaceName}
            </span>
          ) : null}
          {sessionEmail ? (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="max-w-[12rem] truncate text-xs font-medium text-[#1c1914]">{sessionEmail}</span>
              {signOut}
            </div>
          ) : signInHref ? (
            <Link href={signInHref} className="text-sm font-medium text-[#9a3f12] hover:underline">
              {signInLabel}
            </Link>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {opsOpen ? (
        <div className="hidden border-t border-[#d7cbb8] bg-[#f3ead8] md:block">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
            {OWNER.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm ${
                  isActive(pathname, item.href) ? "font-semibold text-[#9a3f12]" : "text-[#4a4338] hover:text-[#1c1914]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {open ? (
        <div className="border-t border-[#d7cbb8] bg-[#f3ead8] px-4 py-4 md:hidden">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9a3f12] uppercase">Buyer path</p>
          <div className="mt-2 flex flex-col gap-1">
            {BUYER.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2 text-sm font-medium text-[#1c1914]"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <p className="mt-4 text-[10px] font-semibold tracking-[0.16em] text-[#9a3f12] uppercase">Owner book</p>
          <div className="mt-2 flex flex-col gap-1">
            {BOOK.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2 text-sm font-medium text-[#1c1914]"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <p className="mt-4 text-[10px] font-semibold tracking-[0.16em] text-[#9a3f12] uppercase">Owner ops</p>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {OWNER.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2 text-sm text-[#4a4338]"
              >
                {item.label}
              </Link>
            ))}
          </div>
          {sessionEmail ? <div className="mt-4 border-t border-[#d7cbb8] pt-3 text-xs">{signOut}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
