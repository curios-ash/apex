import { applyGeoFilter, parseGrain, rollupByGrain } from "@/geo";
import { loadPortfolioMap } from "@/lib/portfolio/load";
import { getActiveWorkspace } from "@/lib/workspace";

import { GeoMetrics } from "./geo-metrics";
import { PortfolioIngest } from "./portfolio-ingest";
import { PortfolioMap } from "./portfolio-map";

export const dynamic = "force-dynamic";

function noticeCopy(notice: string | null): string | null {
  if (!notice) return null;
  if (notice === "added") return "Property added to the book.";
  if (notice === "already-on-map") return "That address is already on the map.";
  const bulk = /^added-(\d+)-skipped-(\d+)$/.exec(notice);
  if (bulk) {
    return `Added ${bulk[1]} ${bulk[1] === "1" ? "property" : "properties"}, skipped ${bulk[2]} duplicate${bulk[2] === "1" ? "" : "s"}.`;
  }
  return notice;
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const warn = typeof params.warn === "string" ? params.warn : null;
  const notice = noticeCopy(typeof params.notice === "string" ? params.notice : null);
  const grain = parseGrain(typeof params.grain === "string" ? params.grain : null);
  const filter = {
    state: typeof params.state === "string" ? params.state : undefined,
    county: typeof params.county === "string" ? params.county : undefined,
    city: typeof params.city === "string" ? params.city : undefined,
    neighborhood: typeof params.neighborhood === "string" ? params.neighborhood : undefined,
  };

  const workspace = await getActiveWorkspace();
  const { properties, facts } = await loadPortfolioMap(workspace.id);
  const filtered = applyGeoFilter(facts, filter);
  const buckets = rollupByGrain(filtered, grain);
  const unitCount = filtered.reduce((sum, fact) => sum + fact.unitCount, 0);

  return (
    <div className="space-y-8">
      <PortfolioIngest
        initialError={
          error === "empty-search" ? "Type an address or pick a suggestion first." : error
        }
      />
      {notice ? (
        <p className="rounded-xl border border-[#c45c26]/30 bg-[#c45c26]/10 px-3 py-2 text-sm text-[#9a3f12]">
          {notice}
        </p>
      ) : null}
      {warn ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warn}
        </p>
      ) : null}
      <PortfolioMap properties={properties} />
      <GeoMetrics
        grain={grain}
        filter={filter}
        buckets={buckets}
        propertyCount={filtered.length}
        unitCount={unitCount}
      />
    </div>
  );
}
