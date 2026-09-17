"use client";

export default function InternalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = error.message || "The server hit an unexpected error.";
  const looksLikeDb =
    /DATABASE_URL|postgres|neon|ECONNREFUSED|does not exist|connect/i.test(message);

  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <h1 className="font-[family-name:var(--font-heading)] text-2xl text-red-950">
        Couldn’t load this page
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-red-900">
        {looksLikeDb
          ? "Apex couldn’t reach Postgres (missing DATABASE_URL, unapplied migrations, or a Neon pooler error). Check Storage → Neon and run npm run db:migrate."
          : message}
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
