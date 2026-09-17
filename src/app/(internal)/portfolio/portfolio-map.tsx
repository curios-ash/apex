"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type MapProperty = {
  id: string;
  name: string;
  address: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
};

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function PortfolioMap({ properties }: { properties: MapProperty[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const mapped = properties.filter(
    (p) => p.latitude !== null && p.longitude !== null && Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
  );
  const mappedKey = mapped.map((p) => `${p.id}:${p.latitude}:${p.longitude}`).join("|");
  const unmapped = properties.filter((p) => !mapped.some((m) => m.id === p.id));

  useEffect(() => {
    if (!containerRef.current || mapped.length === 0) {
      setStatus("ready");
      return;
    }

    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;

    async function mount() {
      setStatus("loading");
      try {
        const maplibregl = await import("maplibre-gl");
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (cancelled || !containerRef.current) return;

        map = new maplibregl.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [mapped[0].longitude as number, mapped[0].latitude as number],
          zoom: 3.2,
          attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        map.on("error", (event) => {
          if (map?.isStyleLoaded()) return;
          const err = event.error;
          setMessage(err?.message ?? "Map failed to load tiles.");
          setStatus("error");
        });

        map.on("load", () => {
          if (!map) return;
          map.addSource("properties", {
            type: "geojson",
            cluster: true,
            clusterMaxZoom: 12,
            clusterRadius: 48,
            data: {
              type: "FeatureCollection",
              features: mapped.map((p) => ({
                type: "Feature" as const,
                geometry: {
                  type: "Point" as const,
                  coordinates: [p.longitude as number, p.latitude as number],
                },
                properties: {
                  id: p.id,
                  name: p.name,
                  address: p.address,
                  status: p.status,
                },
              })),
            },
          });

          map.addLayer({
            id: "clusters",
            type: "circle",
            source: "properties",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#c45c26",
              "circle-radius": ["step", ["get", "point_count"], 16, 4, 20, 10, 26],
              "circle-opacity": 0.9,
            },
          });
          map.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "properties",
            filter: ["has", "point_count"],
            layout: {
              "text-field": "{point_count_abbreviated}",
              "text-size": 12,
            },
            paint: { "text-color": "#fffaf1" },
          });
          map.addLayer({
            id: "points",
            type: "circle",
            source: "properties",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": [
                "case",
                ["==", ["get", "status"], "prospecting"],
                "#4a7c9b",
                "#1c1914",
              ],
              "circle-radius": 7,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#fffaf1",
            },
          });

          map.on("click", "clusters", (e) => {
            const feature = e.features?.[0];
            const source = map?.getSource("properties") as import("maplibre-gl").GeoJSONSource | undefined;
            if (!feature || !source || !map) return;
            const clusterId = feature.properties?.cluster_id as number;
            source.getClusterExpansionZoom(clusterId).then((zoom) => {
              const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
              map?.easeTo({ center: coords, zoom });
            });
          });

          map.on("click", "points", (e) => {
            const feature = e.features?.[0];
            if (!feature || !map) return;
            const coords = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
            const id = String(feature.properties?.id ?? "").replace(/[^a-zA-Z0-9-]/g, "");
            const name = escapeHtml(String(feature.properties?.name ?? ""));
            const address = escapeHtml(String(feature.properties?.address ?? ""));
            new maplibregl.Popup({ closeButton: true, maxWidth: "240px" })
              .setLngLat(coords)
              .setHTML(
                `<a href="/deals/${id}" style="color:#9a3f12;font-weight:600;text-decoration:underline">${name}</a><div style="font-size:12px;color:#5c5549;margin-top:4px">${address}</div>`,
              )
              .addTo(map);
          });

          map.on("mouseenter", "clusters", () => {
            if (map) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "clusters", () => {
            if (map) map.getCanvas().style.cursor = "";
          });
          map.on("mouseenter", "points", () => {
            if (map) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "points", () => {
            if (map) map.getCanvas().style.cursor = "";
          });

          const bounds = new maplibregl.LngLatBounds();
          for (const p of mapped) {
            bounds.extend([p.longitude as number, p.latitude as number]);
          }
          if (mapped.length === 1) {
            map.jumpTo({ center: [mapped[0].longitude as number, mapped[0].latitude as number], zoom: 12 });
          } else {
            map.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: 0 });
          }
          setStatus("ready");
        });
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Map failed to start.");
        setStatus("error");
      }
    }

    void mount();
    return () => {
      cancelled = true;
      map?.remove();
    };
    // mappedKey captures pin identity; mapped is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappedKey]);

  if (properties.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7cbb8] bg-white/60 p-6 text-sm text-[#6b6358]">
        No properties in this workspace yet. Paste a list of addresses or search Maple Austin to put the first pin on
        the map.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-[#d7cbb8] bg-[#efe4d0]">
        {mapped.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center p-6 text-center text-sm text-[#6b6358] sm:min-h-[24rem]">
            Every property is missing coordinates. Add addresses the mock geocoder knows (Maple Austin, Houston Main,
            Ocean Avenue) or enable a live geocoder.
          </div>
        ) : (
          <div
            ref={containerRef}
            className="h-[50vh] min-h-[16rem] w-full sm:h-[min(70vh,36rem)]"
            role="region"
            aria-label="Portfolio map"
          />
        )}
        {status === "loading" && mapped.length > 0 ? (
          <p className="pointer-events-none absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs text-[#6b6358]">
            Loading map…
          </p>
        ) : null}
        {status === "error" ? (
          <div role="alert" className="absolute inset-x-3 bottom-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {message ?? "The map tiles failed. Pins are still listed below."}
          </div>
        ) : null}
      </div>
      {unmapped.length > 0 ? (
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-[#9a3f12] uppercase">Unmapped ({unmapped.length})</p>
          <ul className="mt-2 divide-y divide-[#efe4d0] overflow-hidden rounded-xl border border-[#e2d5be] bg-white">
            {unmapped.map((p) => (
              <li key={p.id}>
                <Link href={`/deals/${p.id}`} className="block px-3 py-2 text-sm hover:bg-[#f7f1e6]">
                  <span className="font-medium text-[#1c1914]">{p.name}</span>
                  <span className="mt-0.5 block text-xs text-[#6b6358]">{p.address}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
