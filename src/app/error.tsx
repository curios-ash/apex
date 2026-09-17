"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f1e6] px-4 text-[#1c1914]">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-6">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl text-red-950">
          Couldn’t load this page
        </h1>
        <p className="mt-2 text-sm text-red-900">
          {error.message || "A server error occurred. Reload to try again."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-lg bg-red-900 px-3 py-1.5 text-sm text-white"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
