"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

interface UploadResult {
  ok: boolean;
  message?: string;
  filename?: string;
  status?: string;
  documentType?: string;
  duplicate?: boolean;
}

export function UploadForm({ properties }: { properties: { id: string; name: string }[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [propertyId, setPropertyId] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setResult({ ok: false, message: "Choose a file first." });
      return;
    }
    setPending(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (propertyId) form.set("propertyId", propertyId);
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const json = (await response.json()) as UploadResult;
      setResult(json);
      if (json.ok) {
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Upload failed — network error." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="file" className="text-sm font-medium text-stone-700">
            Document
          </label>
          <input
            id="file"
            ref={fileRef}
            type="file"
            className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-stone-200"
          />
        </div>
        {properties.length > 0 ? (
          <div>
            <label htmlFor="propertyId" className="text-sm font-medium text-stone-700">
              Property <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <select
              id="propertyId"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm sm:w-56"
            >
              <option value="">Unassigned</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="submit" disabled={pending} className="bg-stone-900 text-white hover:bg-stone-700">
          {pending ? "Processing…" : "Upload & process"}
        </Button>
      </div>
      {result ? (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            result.ok
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {result.ok
            ? `${result.duplicate ? "Already on file" : "Stored"}: ${result.filename} — ${result.documentType}, status ${result.status}.`
            : (result.message ?? "Upload failed.")}
        </p>
      ) : null}
    </form>
  );
}
