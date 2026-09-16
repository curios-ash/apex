import {
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  ClipboardCheck,
  FileSearch,
  Inbox,
  Landmark,
  MailCheck,
  Scale,
  ShieldCheck,
} from "lucide-react";

import { WaitlistForm } from "@/components/waitlist-form";

const steps = [
  {
    icon: Inbox,
    title: "Forward your statements",
    body: "Send your PM statement and bank statement to your Apex address, or upload the PDFs. Ten seconds, once a month.",
  },
  {
    icon: FileSearch,
    title: "We reconcile every line",
    body: "Every charge is matched against your budget and your management agreement. Fee drift, duplicates, and aging work orders get flagged — with the source page cited.",
  },
  {
    icon: MailCheck,
    title: "You approve every action",
    body: "Findings land in your monthly owner review with the follow-up already drafted. Nothing is ever sent without your yes.",
  },
];

const features = [
  {
    icon: ClipboardCheck,
    title: "Monthly owner review",
    body: "One page per property: budget vs. actual, every exception, and what changed since last month.",
  },
  {
    icon: FileSearch,
    title: "PM statement audit",
    body: "Fee drift, duplicate charges, and unexplained fees — flagged with dollar amounts and evidence.",
  },
  {
    icon: BadgeDollarSign,
    title: "Impact ledger",
    body: "A running total of dollars recovered or avoided. The receipt for what Apex earns you.",
  },
  {
    icon: CalendarClock,
    title: "Renewal calendar",
    body: "Lease expirations, insurance renewals, and ARM resets — surfaced 60 days before they cost you.",
  },
  {
    icon: ShieldCheck,
    title: "Approval queue",
    body: "Drafted emails and quote requests wait for your approval, with a full audit log behind every action.",
  },
  {
    icon: Scale,
    title: "Deal dossiers",
    body: "Sourced pro formas with a downside case for your next purchase — computed by a deterministic engine, never guessed by a model.",
  },
];

const faqs = [
  {
    question: "Does Apex replace my property manager?",
    answer:
      "No. Apex sits on your side of the table. Your PM keeps running operations; we check their math every month and help you hold them to the agreement you signed.",
  },
  {
    question: "Do I need to switch banks or software?",
    answer:
      "No. Statements arrive by email forwarding or PDF upload, and Apex builds your property record from them. There is nothing to migrate and nothing for your PM to install.",
  },
  {
    question: "Who computes the numbers?",
    answer:
      "A deterministic finance engine — not an AI model. The AI extracts and classifies documents and drafts explanations; it never calculates NOI, DSCR, cash-on-cash, or IRR. Every figure links back to its source document.",
  },
  {
    question: "What does it cost?",
    answer:
      "Free for founding members during the concierge beta. Planned pricing is $19/month plus $9 per door — a fraction of one percent of the rent your manager already collects on.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <Landmark className="size-4" aria-hidden />
            </span>
            Apex
          </a>
          <nav className="flex items-center gap-6">
            <a
              href="#how-it-works"
              className="hidden text-sm font-medium text-stone-600 hover:text-stone-900 sm:block"
            >
              How it works
            </a>
            <a
              href="#faq"
              className="hidden text-sm font-medium text-stone-600 hover:text-stone-900 sm:block"
            >
              FAQ
            </a>
            <a
              href="#waitlist"
              className="rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Join the waitlist
            </a>
          </nav>
        </div>
      </header>

      <main id="top" className="flex-1">
        <section className="border-b border-stone-200 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-emerald-100/60 via-stone-50 to-stone-50">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                Owner-side audit &amp; asset management
              </p>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Your rentals, audited monthly.
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-stone-600">
                Every number sourced, every action approved. Apex reconciles your property
                manager&apos;s statements against your budget, flags the dollars you&apos;re owed,
                and drafts the follow-up — you stay in control.
              </p>
              <div id="waitlist" className="mt-8 max-w-md scroll-mt-24">
                <WaitlistForm />
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
                The 8–10% question
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-balance">
                Your manager charges 8–10% of rent. We check their work for a fraction of one
                percent.
              </p>
              <dl className="mt-6 space-y-4 text-sm">
                <div className="flex justify-between gap-4 border-b border-stone-100 pb-3">
                  <dt className="text-stone-600">$2,000/month rent</dt>
                  <dd className="font-medium">$160–$200 to your PM</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-stone-100 pb-3">
                  <dt className="text-stone-600">Statements verified by anyone, ever</dt>
                  <dd className="font-medium text-red-600">Usually never</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-600">Fee drift, duplicates, markups found</dt>
                  <dd className="font-medium text-emerald-700">Flagged, sourced, drafted</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 border-b border-stone-200">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
            <p className="mt-3 max-w-2xl text-stone-600">
              Built for owners with 1–20 doors who manage their manager — not for another
              operations dashboard.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <step.icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-sm font-semibold text-stone-300">
                      Step {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-stone-200 bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <h2 className="text-3xl font-semibold tracking-tight">What you get</h2>
            <p className="mt-3 max-w-2xl text-stone-600">
              The property record, the reconciliation loop, and the impact ledger — the three
              things a chat window can&apos;t give you.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-6"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
                    <feature.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-b border-stone-200">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
            <h2 className="text-3xl font-semibold tracking-tight">Questions, answered</h2>
            <div className="mt-8 space-y-6">
              {faqs.map((faq) => (
                <div key={faq.question} className="rounded-2xl border border-stone-200 bg-white p-6">
                  <h3 className="font-semibold">{faq.question}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-stone-900 text-stone-50">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 sm:py-20">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance">
              Your next statement is worth auditing.
            </h2>
            <p className="max-w-xl text-stone-300">
              Join the waitlist and be one of the first owners with a monthly audit trail — and
              the dollars it recovers.
            </p>
            <a
              href="#waitlist"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white hover:bg-emerald-500"
            >
              Join the waitlist
              <ArrowRight className="size-4" aria-hidden />
            </a>
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
