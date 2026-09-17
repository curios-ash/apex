"use client";

import { useEffect, useState } from "react";
import { MapPin, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { addOwnedFromSearch, bulkAddProperties } from "./actions";

type Suggestion = {
  placeId: string;
  label: string;
  geocoder: string;
  matched: boolean;
};

export function PortfolioIngest({ initialError }: { initialError?: string | null }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<"mock" | "google" | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/places/suggest?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as {
          ok: boolean;
          provider?: "mock" | "google";
          suggestions?: Suggestion[];
        };
        if (!json.ok) throw new Error("lookup");
        setProvider(json.provider ?? "mock");
        setSuggestions(json.suggestions ?? []);
        setStatus("idle");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      }
    }, 220);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="rounded-3xl border border-[#d7cbb8] bg-[#fffaf1] p-5 sm:p-6">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9a3f12] uppercase">Owned book</p>
      <h1 className="mt-2 font-[family-name:var(--font-heading)] text-3xl tracking-tight sm:text-4xl">
        Portfolio map
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5c5549]">
        Every workspace property, including buyer prospects, on one map. Search or paste addresses —
        lookup uses mock Places when <span className="font-medium text-[#1c1914]">GOOGLE_MAPS_API_KEY</span> is
        unset. County and neighborhood come from the mock census parser (optional live Census geocoder).
      </p>

      {initialError ? (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {initialError}
        </p>
      ) : null}

      <form action={addOwnedFromSearch} className="mt-5 space-y-3">
        <label htmlFor="portfolio-query" className="sr-only">
          Add a property by address
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8a8172]" />
            <Input
              id="portfolio-query"
              name="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Maple Austin or paste an address"
              autoComplete="off"
              className="h-12 border-[#d7cbb8] bg-white pl-10 text-base"
            />
          </div>
          <Button type="submit" className="h-12 bg-[#c45c26] px-6 text-white hover:bg-[#9a3f12]">
            Add to book
          </Button>
        </div>
        <input type="hidden" name="placeId" value="" />
      </form>

      <div className="mt-3 min-h-[2.5rem]">
        {status === "loading" ? <p className="text-sm text-[#6b6358]">Looking up addresses…</p> : null}
        {status === "error" ? (
          <p role="alert" className="text-sm text-red-700">
            Lookup failed. You can still submit the address as free text.
          </p>
        ) : null}
        {query.trim().length >= 2 && suggestions.length > 0 ? (
          <ul className="divide-y divide-[#efe4d0] overflow-hidden rounded-2xl border border-[#e2d5be] bg-white">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <form action={addOwnedFromSearch}>
                  <input type="hidden" name="placeId" value={s.placeId} />
                  <input type="hidden" name="query" value={query} />
                  <button type="submit" className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#f7f1e6]">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-[#c45c26]" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium text-[#1c1914]">{s.label}</span>
                      <span className="text-xs text-[#6b6358]">
                        {s.matched ? `${s.geocoder} match` : "Create from this text"}
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {provider ? (
        <p className="mt-2 text-xs text-[#6b6358]">
          Geocoder: {provider === "google" ? "Google Places" : "mock-places-v1 (GOOGLE_MAPS_API_KEY unset)"}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setBulkOpen((v) => !v)}
        className="mt-4 text-sm font-medium text-[#9a3f12] underline"
      >
        {bulkOpen ? "Hide bulk add" : "Bulk add from CSV or pasted addresses"}
      </button>

      {bulkOpen ? (
        <form action={bulkAddProperties} className="mt-3 space-y-3">
          <label htmlFor="bulk" className="block text-sm text-[#5c5549]">
            One address per line, or a CSV with headers{" "}
            <code className="text-xs">address,city,state,zip,units,name,purchase_price</code>.
          </label>
          <textarea
            id="bulk"
            name="bulk"
            rows={8}
            required
            className="w-full rounded-xl border border-[#d7cbb8] bg-white px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder={"421 Maple Street, Austin, TX 78701\n88 Ocean Avenue, Miami Beach, FL 33139"}
          />
          <Button type="submit" variant="outline">
            Ingest addresses
          </Button>
        </form>
      ) : null}
    </div>
  );
}
