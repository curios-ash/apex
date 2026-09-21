export default function EvaluateLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading this deal">
      <p className="text-sm font-medium text-[#5c5549]">Loading the underwriting…</p>
      <div className="h-40 animate-pulse rounded-3xl bg-[#e2d5be]/80" />
      <div className="h-28 animate-pulse rounded-2xl bg-[#e2d5be]/60" />
      <div className="h-28 animate-pulse rounded-2xl bg-[#e2d5be]/40" />
    </div>
  );
}
