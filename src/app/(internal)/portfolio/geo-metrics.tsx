import Link from "next/link";

import { formatCents } from "@/lib/format";
import { GEO_GRAINS, nextGrain, previousGrain, type GeoBucket, type GeoFilter, type GeoGrain } from "@/geo";

function sourcedSum(cents: number | null, sourced: number, total: number): string {
  if (sourced === 0 || cents === null) return "—";
  const suffix = sourced < total ? ` (${sourced}/${total})` : "";
  return `${formatCents(cents)}${suffix}`;
}

function hrefFor(grain: GeoGrain, filter: GeoFilter): string {
  const params = new URLSearchParams();
  params.set("grain", grain);
  if (filter.state) params.set("state", filter.state);
  if (filter.county) params.set("county", filter.county);
  if (filter.city) params.set("city", filter.city);
  if (filter.neighborhood) params.set("neighborhood", filter.neighborhood);
  return `/portfolio?${params.toString()}`;
}

function drillHref(bucket: GeoBucket): string {
  const finer = nextGrain(bucket.grain);
  const filter: GeoFilter = {
    state: bucket.state,
    county: bucket.county ?? undefined,
    city: bucket.city ?? undefined,
    neighborhood: bucket.neighborhood ?? undefined,
  };
  return hrefFor(finer ?? bucket.grain, filter);
}

export function GeoMetrics({
  grain,
  filter,
  buckets,
  propertyCount,
  unitCount,
}: {
  grain: GeoGrain;
  filter: GeoFilter;
  buckets: GeoBucket[];
  propertyCount: number;
  unitCount: number;
}) {
  const crumbs: { label: string; href: string }[] = [{ label: "United States", href: hrefFor("state", {}) }];
  if (filter.state) {
    crumbs.push({ label: filter.state, href: hrefFor("county", { state: filter.state }) });
  }
  if (filter.state && filter.county) {
    crumbs.push({
      label: filter.county,
      href: hrefFor("city", { state: filter.state, county: filter.county }),
    });
  }
  if (filter.state && filter.county && filter.city) {
    crumbs.push({
      label: filter.city,
      href: hrefFor("neighborhood", {
        state: filter.state,
        county: filter.county,
        city: filter.city,
      }),
    });
  }
  if (filter.neighborhood) {
    crumbs.push({
      label: filter.neighborhood,
      href: hrefFor("neighborhood", filter),
    });
  }

  const wider = previousGrain(grain);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-2xl tracking-tight">Geo metrics</h2>
          <p className="mt-1 text-sm text-[#5c5549]">
            Counts and stored cents only — purchase price, current value, and confirmed impact ledger
            sums. Missing values stay blank; nothing is estimated.
          </p>
        </div>
        <p className="text-sm text-[#6b6358]">
          {propertyCount} {propertyCount === 1 ? "property" : "properties"} · {unitCount}{" "}
          {unitCount === 1 ? "unit" : "units"}
        </p>
      </div>

      <nav aria-label="Geo grain" className="flex flex-wrap gap-2">
        {GEO_GRAINS.map((g) => (
          <Link
            key={g}
            href={hrefFor(g, filter)}
            className={`rounded-full px-3 py-1.5 text-sm capitalize ${
              g === grain ? "bg-[#1c1914] text-[#f4e6c8]" : "border border-[#d7cbb8] bg-white text-[#4a4338]"
            }`}
          >
            {g}
          </Link>
        ))}
        {wider ? (
          <Link
            href={hrefFor(
              wider,
              wider === "state"
                ? {}
                : wider === "county"
                  ? { state: filter.state }
                  : wider === "city"
                    ? { state: filter.state, county: filter.county }
                    : filter,
            )}
            className="rounded-full px-3 py-1.5 text-sm text-[#9a3f12] underline"
          >
            Widen
          </Link>
        ) : null}
      </nav>

      <p className="text-xs text-[#6b6358]">
        {crumbs.map((crumb, i) => (
          <span key={crumb.href}>
            {i > 0 ? " / " : null}
            <Link href={crumb.href} className="underline decoration-[#c45c26]/50 underline-offset-2">
              {crumb.label}
            </Link>
          </span>
        ))}
      </p>

      {buckets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#d7cbb8] bg-white/60 p-6 text-sm text-[#6b6358]">
          Nothing to roll up at this grain. Widen the view or add properties.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e2d5be] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#efe4d0] text-[11px] tracking-wide text-[#8a8172] uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">{grain}</th>
                <th className="px-3 py-2 font-medium">Properties</th>
                <th className="px-3 py-2 font-medium">Units</th>
                <th className="px-3 py-2 font-medium">Purchase (DB)</th>
                <th className="px-3 py-2 font-medium">Value (DB)</th>
                <th className="px-3 py-2 font-medium">Impact (confirmed)</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket.key} className="border-b border-[#f3ead8] last:border-0">
                  <td className="px-3 py-2">
                    <Link href={drillHref(bucket)} className="font-medium text-[#9a3f12] underline-offset-2 hover:underline">
                      {bucket.label}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{bucket.propertyCount}</td>
                  <td className="px-3 py-2">{bucket.unitCount}</td>
                  <td className="px-3 py-2">
                    {sourcedSum(bucket.purchasePriceCents, bucket.purchasePricePropertyCount, bucket.propertyCount)}
                  </td>
                  <td className="px-3 py-2">
                    {sourcedSum(bucket.currentValueCents, bucket.currentValuePropertyCount, bucket.propertyCount)}
                  </td>
                  <td className="px-3 py-2">{formatCents(bucket.impactCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
