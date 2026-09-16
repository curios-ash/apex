import { ClipboardPaste, FileUp, Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createFromFile, createFromText, createManual } from "../actions";
import { AssumptionFields } from "../assumption-fields";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "text-too-short": "Paste the full listing text (at least a few lines) so we can extract from it.",
  "no-file": "Choose a listing PDF or text file first.",
  "file-too-large": "That file is over the 10 MB limit.",
};

export default async function NewDossierPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : null;
  const error = errorKey ? (ERRORS[errorKey] ?? "Something went wrong.") : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New dossier</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Start from a listing (pasted text or PDF) or enter the numbers yourself. Whatever the
          listing states becomes a sourced assumption; everything else gets a flagged default you
          can edit on the dossier page.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <ClipboardPaste className="size-4" aria-hidden />
            </span>
            <h2 className="text-lg font-semibold">Paste listing text</h2>
          </div>
          <p className="mt-2 text-sm text-stone-600">
            Copy the listing page text (address, price, beds/baths, rent, taxes) and paste it here.
          </p>
          <form action={createFromText} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="listingText">Listing text</Label>
              <textarea
                id="listingText"
                name="listingText"
                required
                rows={8}
                placeholder={"For Sale: 421 Maple Street, Austin TX 78701\nAsking price: $289,000\n4 bed / 2 bath duplex, 1,920 sq ft, built 1985\nCurrently leased at $1,850/mo…"}
                className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <div>
              <Label htmlFor="pasteListingUrl">Listing URL (optional)</Label>
              <Input
                id="pasteListingUrl"
                name="listingUrl"
                type="url"
                placeholder="https://…"
                className="mt-1.5 bg-white"
              />
            </div>
            <Button type="submit" className="bg-stone-900 text-white hover:bg-stone-700">
              Build dossier from text
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <FileUp className="size-4" aria-hidden />
            </span>
            <h2 className="text-lg font-semibold">Upload the listing PDF</h2>
          </div>
          <p className="mt-2 text-sm text-stone-600">
            The saved listing or MLS sheet as a PDF. Text is extracted locally; the capture is
            stored privately as the source for every extracted assumption.
          </p>
          <form action={createFromFile} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="file">Listing file</Label>
              <Input
                id="file"
                name="file"
                type="file"
                accept=".pdf,.txt,text/plain,application/pdf"
                required
                className="mt-1.5 bg-white"
              />
            </div>
            <div>
              <Label htmlFor="fileListingUrl">Listing URL (optional)</Label>
              <Input
                id="fileListingUrl"
                name="listingUrl"
                type="url"
                placeholder="https://…"
                className="mt-1.5 bg-white"
              />
            </div>
            <Button type="submit" className="bg-stone-900 text-white hover:bg-stone-700">
              Build dossier from PDF
            </Button>
          </form>
        </section>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Keyboard className="size-4" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold">Enter the numbers yourself</h2>
        </div>
        <p className="mt-2 text-sm text-stone-600">
          Manual entries are stored as high-confidence, manually sourced assumptions. Leave a
          field blank to use the flagged default.
        </p>
        <form action={createManual} className="mt-4 space-y-6">
          <div className="max-w-md">
            <Label htmlFor="title">Deal name (optional)</Label>
            <Input id="title" name="title" placeholder="Maple Street duplex" className="mt-1.5 bg-white" />
          </div>
          <AssumptionFields values={null} />
          <Button type="submit" className="bg-stone-900 text-white hover:bg-stone-700">
            Build dossier
          </Button>
        </form>
      </section>
    </div>
  );
}
