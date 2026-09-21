export default function DealsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading Find">
      <p className="text-sm font-medium text-[#5c5549]">Loading addresses…</p>
      <div className="h-64 animate-pulse rounded-3xl bg-[#e2d5be]/80" />
      <div className="h-20 animate-pulse rounded-2xl bg-[#e2d5be]/50" />
    </div>
  );
}
