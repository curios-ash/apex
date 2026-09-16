import Link from "next/link";
import type { Metadata } from "next";
import { Landmark, ShieldCheck, Timer, Wallet } from "lucide-react";

import { AuditTool } from "./audit-tool";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Free PM Statement Audit — Apex",
  description:
    "Upload one owner statement and your management fee percentage. Get fee drift, duplicate charges, unexplained fees, and aging work orders — with a dollar total — in under a minute. No signup.",
};

const assurances = [
  {
    icon: ShieldCheck,
    title: "Nothing is stored",
    body: "Your statement is processed in memory for this request and discarded immediately. No account, no document store, no retention.",
  },
  {
    icon: Timer,
    title: "Under a minute",
    body: "Extraction and the full rule set run in one pass. You get a flagged list with a dollar total, not a sales call.",
  },
  {
    icon: Wallet,
    title: "Real dollars",
    body: "Fee drift is checked against your agreement percentage; duplicates and re-billed work orders are cited line by line.",
  },
];

export default function AuditPage() {
  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <Landmark className="size-4" aria-hidden />
            </span>
            Apex
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/#how-it-works"
              className="hidden text-sm font-medium text-stone-600 hover:text-stone-900 sm:block"
            >
              How it works
            </Link>
            <Link
              href="/#waitlist"
              className="rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Join the waitlist
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-stone-200 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-emerald-100/60 via-stone-50 to-stone-50">
          <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-800 uppercase">
              Free tool · no signup
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Audit your property manager&apos;s statement.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-stone-600">
              Upload one owner statement and enter your management fee percentage. We flag fee
              drift, duplicate charges, unexplained fees, and aging work orders — with a total
              dollar figure — in under a minute.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
          <AuditTool />
        </section>

        <section className="border-t border-stone-200 bg-white">
          <div className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-12 sm:grid-cols-3 sm:px-6">
            {assurances.map((a) => (
              <div key={a.title} className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
                  <a.icon className="size-4" aria-hidden />
                </span>
                <h2 className="mt-3 text-sm font-semibold">{a.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-stone-600">{a.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-stone-500 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2 font-medium text-stone-700">
            <span className="flex size-6 items-center justify-center rounded-md bg-emerald-700 text-white">
              <Landmark className="size-3" aria-hidden />
            </span>
            Apex
          </div>
          <p>Owner-side audit and asset management for small landlords.</p>
          <p>© {new Date().getFullYear()} Apex. Built in public by an aspiring investor.</p>
        </div>
      </footer>
    </div>
  );
}
