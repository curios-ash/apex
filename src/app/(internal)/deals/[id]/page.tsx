import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChecklistItem } from "@/dossier";
import { calculatorInputsForProperty } from "@/lib/deals/persist-calculator";
import { getDeal, latestDossierId } from "@/lib/deals/open";
import { loadDossier } from "@/lib/dossier/run";
import { db } from "@/lib/db";
import { dealNotes } from "@/lib/db/schema";
import { getActiveWorkspace } from "@/lib/workspace";

import { addDealNote } from "../actions";
import { CalculatorForm } from "./calculator/calculator-form";
import { DealUpload } from "./capture/upload";

export const dynamic = "force-dynamic";

const SEVERITY: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-950",
  important: "border-amber-200 bg-amber-50 text-amber-950",
  standard: "border-[#e2d5be] bg-white text-[#1c1914]",
};

export default async function EvaluatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const workspace = await getActiveWorkspace();
  const deal = await getDeal(workspace.id, id);
  if (!deal) notFound();

  const { inputs } = await calculatorInputsForProperty(workspace.id, id);
  const dossierId = await latestDossierId(workspace.id, id);
  const loaded = dossierId ? await loadDossier(workspace.id, dossierId) : null;
  const checklist: ChecklistItem[] = loaded?.payload.checklist ?? [];
  const notes = await db
    .select()
    .from(dealNotes)
    .where(eq(dealNotes.propertyId, id))
    .orderBy(desc(dealNotes.createdAt))
    .limit(8);
  const emptyNote = query.error === "empty-note";

  return (
    <div className="space-y-8">
      <section id="inputs" className="space-y-3">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9a3f12] uppercase">1</p>
        <CalculatorForm propertyId={id} initial={inputs} />
      </section>

      <section id="checklist" aria-labelledby="checklist-heading">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9a3f12] uppercase">2</p>
        <h2
          id="checklist-heading"
          className="mt-1 font-[family-name:var(--font-heading)] text-2xl tracking-tight"
        >
          Checklist
        </h2>
        {!loaded ? (
          <p className="mt-3 rounded-2xl border border-dashed border-[#d7cbb8] bg-white/70 p-5 text-sm leading-relaxed text-[#5c5549]">
            Nothing to check yet. Save the numbers above. The list is built from gaps in those
            inputs — missing taxes, unverified rent, a thin downside — after finance-v1 runs.
          </p>
        ) : checklist.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-relaxed text-emerald-950">
            This version has no gaps the engine can see. Still walk the property before you write
            an offer.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {checklist.map((item) => (
              <li key={item.id} className={`rounded-2xl border p-4 ${SEVERITY[item.severity]}`}>
                <p className="text-[11px] font-semibold tracking-[0.12em] uppercase">{item.severity}</p>
                <h3 className="mt-1 text-base font-semibold">{item.label}</h3>
                <p className="mt-1 text-sm leading-relaxed">{item.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card id="notes" className="border-[#e2d5be] bg-white shadow-none ring-[#e2d5be]">
        <CardHeader>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9a3f12] uppercase">3</p>
          <CardTitle className="font-[family-name:var(--font-heading)] text-2xl">Notes</CardTitle>
          <CardDescription className="text-sm leading-relaxed text-[#5c5549]">
            Roof age, a lease that rolls soon, a seller who sounded rushed. Write it before you
            forget.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {emptyNote ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Write at least a sentence, then save the note.
            </p>
          ) : null}
          <form action={addDealNote} className="space-y-3">
            <input type="hidden" name="propertyId" value={id} />
            <label htmlFor="deal-note" className="text-sm font-semibold text-[#1c1914]">
              What did you notice?
            </label>
            <textarea
              id="deal-note"
              name="body"
              rows={4}
              placeholder="Walked it Tuesday. Roof is about 12 years. Unit B’s lease ends in 90 days."
              className="w-full rounded-xl border border-[#d7cbb8] bg-[#fffaf1] px-4 py-3 text-base"
            />
            <Button
              type="submit"
              className="h-14 w-full bg-[#1c1914] text-base font-semibold text-[#f4e6c8] hover:bg-[#3a3329]"
            >
              Save note
            </Button>
          </form>
          {notes.length === 0 ? (
            <p className="text-sm text-[#6b6358]">No notes on this deal yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((note) => (
                <li key={note.id} className="rounded-xl bg-[#f7f1e6] px-4 py-3 text-sm leading-relaxed">
                  {note.body}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card id="upload" className="border-[#e2d5be] bg-white shadow-none ring-[#e2d5be]">
        <CardHeader>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9a3f12] uppercase">4</p>
          <CardTitle className="font-[family-name:var(--font-heading)] text-2xl">Upload</CardTitle>
          <CardDescription className="text-sm leading-relaxed text-[#5c5549]">
            Listing PDF, rent roll, or inspection. It stays on this deal. Extraction classifies
            the file; it does not recompute the returns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DealUpload propertyId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
