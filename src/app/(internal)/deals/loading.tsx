export default function DealsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading deals">
      <div className="h-48 animate-pulse rounded-3xl bg-[#e2d5be]/80" />
      <div className="h-24 animate-pulse rounded-2xl bg-[#e2d5be]/50" />
    </div>
  );
}
