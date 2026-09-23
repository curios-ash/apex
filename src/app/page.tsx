import Link from "next/link";
import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";

import { getSession, type ApexSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  let session: ApexSession | null = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }
  if (session) redirect("/deals");

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f1e6] text-[#1c1914]">
      <header className="border-b border-[#d7cbb8]">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-[#1c1914] text-[#f4e6c8]">
              <Landmark className="size-4" aria-hidden />
            </span>
            <span className="font-[family-name:var(--font-heading)] text-lg">Apex</span>
          </span>
          <Link
            href="/sign-in"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[#9a3f12]"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-20">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9a3f12] uppercase">
          Deal #1
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-heading)] text-4xl tracking-tight text-balance sm:text-5xl">
          Apex scores a small rental you already found against your Deal #1 line.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-[#5c5549]">
          $19 a month, cancel any time. The first address is free.
        </p>

        <Link
          href="/deal-1"
          className="mt-8 inline-flex h-14 w-full items-center justify-center rounded-xl bg-[#c45c26] text-base font-semibold text-white hover:bg-[#9a3f12] sm:w-auto sm:px-10"
        >
          Score the first address
        </Link>
        <Link
          href="/deals"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[#9a3f12]"
        >
          Find and evaluate an address you already opened
        </Link>
      </main>

      <footer className="border-t border-[#d7cbb8] px-4 py-6 text-center text-xs text-[#6b6358]">
        Signed-in Apex starts on Find. The engine is finance-v1.
      </footer>
    </div>
  );
}
