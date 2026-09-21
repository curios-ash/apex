"use client";

import Link from "next/link";

export default function EvaluateError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-6 sm:p-8">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-red-800 uppercase">Evaluate</p>
      <h2 className="mt-2 font-[family-name:var(--font-heading)] text-3xl text-red-950">
        Couldn’t open this deal
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-red-900">
        {error.message || "The numbers and notes didn’t load. The deal file is still there."}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-14 items-center justify-center rounded-xl bg-red-900 px-6 text-base font-semibold text-white"
        >
          Try again
        </button>
        <Link
          href="/deals"
          className="inline-flex h-14 items-center justify-center rounded-xl border border-red-300 px-6 text-base font-semibold text-red-950"
        >
          Back to Find
        </Link>
      </div>
    </div>
  );
}
