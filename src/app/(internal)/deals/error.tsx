"use client";

export default function DealsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-6 sm:p-8">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-red-800 uppercase">Find</p>
      <h1 className="mt-2 font-[family-name:var(--font-heading)] text-3xl text-red-950">
        Couldn’t load the address search
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-red-900">
        {error.message || "The deal list failed to load. Your search wasn’t saved."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 inline-flex h-14 w-full items-center justify-center rounded-xl bg-red-900 text-base font-semibold text-white sm:w-auto sm:px-8"
      >
        Try again
      </button>
    </div>
  );
}
