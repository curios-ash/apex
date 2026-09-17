"use client";

export default function DealHistoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <h2 className="font-semibold text-red-900">Couldn’t load this deal’s history</h2>
      <p className="mt-1 text-sm text-red-800">
        {error.message || "The timeline query failed. Try again — nothing in the deal was deleted."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-lg bg-red-900 px-3 py-1.5 text-sm text-white"
      >
        Retry
      </button>
    </div>
  );
}
