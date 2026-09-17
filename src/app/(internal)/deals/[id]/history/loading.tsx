export default function DealHistoryLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading deal history">
      <div className="h-4 w-40 animate-pulse rounded bg-[#e2d5be]" />
      <div className="h-24 animate-pulse rounded-2xl bg-[#e2d5be]/70" />
      <div className="h-24 animate-pulse rounded-2xl bg-[#e2d5be]/50" />
    </div>
  );
}
