"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function DealUpload({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setOk(false);
      setMessage("Choose a listing PDF, rent roll, or inspection first.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("propertyId", propertyId);
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const json = (await response.json()) as {
        ok: boolean;
        message?: string;
        filename?: string;
        status?: string;
        documentType?: string;
        duplicate?: boolean;
      };
      setOk(json.ok);
      setMessage(
        json.ok
          ? `${json.duplicate ? "Already on file" : "Captured"}: ${json.filename} (${json.documentType}, ${json.status}).`
          : (json.message ?? "Upload failed."),
      );
      if (json.ok) {
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setOk(false);
      setMessage("Upload failed — network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        className="block w-full rounded-lg border border-[#d7cbb8] bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#f3ead8] file:px-3 file:py-1.5"
      />
      <Button type="submit" disabled={pending} className="bg-[#1c1914] text-[#f4e6c8] hover:bg-[#3a3329]">
        {pending ? "Processing…" : "Upload into this deal"}
      </Button>
      {message ? (
        <p className={`text-sm ${ok ? "text-emerald-800" : "text-red-700"}`}>{message}</p>
      ) : null}
    </form>
  );
}
