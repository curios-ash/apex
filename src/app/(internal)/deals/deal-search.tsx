"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { MapPin, Search } from "lucide-react";

import { Input } from "@/components/ui/input";

type Suggestion = {
  placeId: string;
  label: string;
  geocoder: string;
  matched: boolean;
  query: string;
};

function OpenDealSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 shrink-0 items-center justify-center rounded-lg bg-[#c45c26] px-6 text-sm font-medium text-white hover:bg-[#9a3f12] disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? "Opening…" : "Open deal"}
    </button>
  );
}

const ERROR_COPY: Record<string, string> = {
  "empty-search": "Type an address or pick a suggestion first.",
  "open-failed": "Could not open that deal. Try again or pick a suggestion.",
};

export function DealSearch({ initialError }: { initialError?: string | null }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<"mock" | "google" | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

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

  const errorCopy = initialError ? (ERROR_COPY[initialError] ?? ERROR_COPY["empty-search"]) : null;

  return (
    <div className="rounded-3xl border border-[#d7cbb8] bg-[#fffaf1] p-5 shadow-[0_20px_50px_-28px_rgba(28,25,20,0.45)] sm:p-8">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9a3f12] uppercase">
        Start with an address
      </p>
      <h2 className="mt-2 font-[family-name:var(--font-heading)] text-3xl tracking-tight text-[#1c1914] sm:text-4xl">
        Look up the listing. Open a deal.
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5c5549]">
        Search like you would in Maps. We open a deal file — not a paste box — so capture,
        underwriting, and the timeline live in one place. Without a Google key we use a mock
        geocoder (try <span className="font-medium text-[#1c1914]">Maple Austin</span>).
      </p>

      {errorCopy ? (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errorCopy}
        </p>
      ) : null}

      <form id="deal-open-form" action="/api/deals/open" method="post" className="mt-6 space-y-3">
        <label htmlFor="deal-query" className="sr-only">
          Property address or listing
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8a8172]" />
            <Input
              id="deal-query"
              name="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="421 Maple Street, Austin…"
              autoComplete="off"
              className="h-12 border-[#d7cbb8] bg-white pl-10 text-base"
            />
          </div>
          <OpenDealSubmit />
        </div>
      </form>

      <div className="mt-4 min-h-[3rem]">
        {status === "loading" ? (
          <p className="text-sm text-[#6b6358]">Looking up addresses…</p>
        ) : null}
        {status === "error" ? (
          <p role="alert" className="text-sm text-red-700">
            Lookup failed. You can still submit the address as free text.
          </p>
        ) : null}
        {query.trim().length >= 2 && suggestions.length > 0 ? (
          <ul className="divide-y divide-[#efe4d0] overflow-hidden rounded-2xl border border-[#e2d5be] bg-white">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="submit"
                  form="deal-open-form"
                  name="placeId"
                  value={s.placeId}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#f7f1e6]"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-[#c45c26]" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium text-[#1c1914]">{s.label}</span>
                    <span className="text-xs text-[#6b6358]">
                      {s.matched ? `${s.geocoder} match` : "Create from this text"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {provider ? (
        <p className="mt-3 text-xs text-[#6b6358]">
          Geocoder: {provider === "google" ? "Google Places" : "mock-places-v1 (GOOGLE_MAPS_API_KEY unset)"}
        </p>
      ) : null}
    </div>
  );
}
