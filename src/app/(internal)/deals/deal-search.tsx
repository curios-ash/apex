"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { MapPin, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <Button
      type="submit"
      disabled={pending}
      className="h-14 w-full bg-[#c45c26] text-base font-semibold text-white hover:bg-[#9a3f12]"
    >
      {pending ? "Opening the deal…" : "Open deal"}
    </Button>
  );
}

const ERROR_COPY: Record<string, string> = {
  "empty-search": "Type an address, or pick one from the list, then open the deal.",
  "open-failed": "That address didn’t open. Try Maple Austin, or pick a suggestion.",
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
  const trimmed = query.trim();

  return (
    <div className="rounded-3xl border border-[#d7cbb8] bg-[#fffaf1] p-5 shadow-[0_20px_50px_-28px_rgba(28,25,20,0.45)] sm:p-8">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9a3f12] uppercase">
        Step 1 · Find
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-heading)] text-3xl tracking-tight text-[#1c1914] sm:text-4xl">
        Look up the listing. Open a deal.
      </h1>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-[#5c5549]">
        Type the street address. One button opens the file so you can run the numbers. Try{" "}
        <span className="font-semibold text-[#1c1914]">Maple Austin</span> if you want the demo
        duplex at 421 Maple Street.
      </p>

      {errorCopy ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {errorCopy}
        </p>
      ) : null}

      <form id="deal-open-form" action="/api/deals/open" method="post" className="mt-6 space-y-3">
        <label htmlFor="deal-query" className="text-sm font-semibold text-[#1c1914]">
          Property address
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-[#8a8172]"
            aria-hidden
          />
          <Input
            id="deal-query"
            name="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="421 Maple Street, Austin"
            autoComplete="off"
            className="h-14 border-[#d7cbb8] bg-white pl-12 text-base md:text-base"
          />
        </div>
        <OpenDealSubmit />
      </form>

      <div className="mt-4 min-h-12" aria-live="polite">
        {trimmed.length < 2 ? (
          <p className="text-sm text-[#6b6358]">
            Start typing. Suggestions appear after two characters.
          </p>
        ) : null}
        {status === "loading" ? (
          <p className="text-sm text-[#6b6358]">Looking up addresses…</p>
        ) : null}
        {status === "error" ? (
          <p role="alert" className="text-sm text-red-700">
            Lookup failed. You can still press Open deal and we’ll use the text you typed.
          </p>
        ) : null}
        {status !== "loading" && trimmed.length >= 2 && suggestions.length === 0 ? (
          <p className="text-sm text-[#6b6358]">
            No matches yet. Open deal will create a file from “{trimmed}”.
          </p>
        ) : null}
        {trimmed.length >= 2 && suggestions.length > 0 ? (
          <ul className="divide-y divide-[#efe4d0] overflow-hidden rounded-2xl border border-[#e2d5be] bg-white">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="submit"
                  form="deal-open-form"
                  name="placeId"
                  value={s.placeId}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f7f1e6] active:bg-[#efe4d0]"
                >
                  <MapPin className="size-5 shrink-0 text-[#c45c26]" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-[#1c1914]">{s.label}</span>
                    <span className="text-xs text-[#6b6358]">
                      {s.matched ? "Opens this address" : "Creates a deal from this text"}
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
          Geocoder:{" "}
          {provider === "google" ? "Google Places" : "mock list (no Google key on this machine)"}
        </p>
      ) : null}
    </div>
  );
}
