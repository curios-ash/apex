export default function PortfolioLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading portfolio">
      <div className="h-40 animate-pulse rounded-3xl bg-[#e2d5be]/80" />
      <div className="h-[50vh] animate-pulse rounded-2xl bg-[#e2d5be]/50" />
      <div className="h-32 animate-pulse rounded-2xl bg-[#e2d5be]/40" />
    </div>
  );
}
