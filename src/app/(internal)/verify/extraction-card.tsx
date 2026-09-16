"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";

import { approveExtraction, correctExtraction, rejectExtraction } from "./actions";

interface LineItem {
  date?: string | null;
  description?: string;
  amountCents?: number;
  category?: string | null;
}

export function ExtractionCard(props: {
  extractionId: string;
  documentId: string;
  filename: string;
  schemaVersion: string;
  extractor: string;
  confidence: number | null;
  fields: Record<string, unknown>;
  fieldConfidence: Record<string, number>;
  lowFields: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [correctState, correctAction, correctPending] = useActionState(correctExtraction, null);

  const scalarEntries = Object.entries(props.fields).filter(
    ([, v]) => !Array.isArray(v) && (v === null || typeof v !== "object"),
  );
  const lineEntries = Object.entries(props.fields).filter(([, v]) => Array.isArray(v));

  function displayValue(name: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (name.endsWith("Cents") && typeof value === "number") return formatCents(value);
    return String(value);
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div>
          <a
            href={`/api/documents/${props.documentId}/file`}
            target="_blank"
            className="font-medium text-emerald-800 hover:underline"
          >
            {props.filename}
          </a>
          <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
            {props.schemaVersion}
          </span>
          <span className="ml-2 text-xs text-stone-400">{props.extractor}</span>
        </div>
        <div className="text-sm text-stone-500">
          overall confidence{" "}
          <span className="font-semibold text-stone-800">
            {props.confidence !== null ? `${Math.round(props.confidence * 100)}%` : "—"}
          </span>
        </div>
      </div>

      <form action={correctAction} className="px-5 py-4">
        <input type="hidden" name="extractionId" value={props.extractionId} />
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs tracking-wide text-stone-500 uppercase">
              <th className="py-1 pr-4 font-medium">Field</th>
              <th className="py-1 pr-4 font-medium">Value</th>
              <th className="py-1 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {scalarEntries.map(([name, value]) => {
              const confidence = props.fieldConfidence[name];
              const low = props.lowFields.includes(name);
              return (
                <tr key={name} className={low ? "bg-amber-50" : undefined}>
                  <td className="py-1.5 pr-4 font-medium text-stone-700">{name}</td>
                  <td className="w-1/2 py-1.5 pr-4">
                    {editing ? (
                      <input
                        name={`field:${name}`}
                        defaultValue={value === null || value === undefined ? "" : String(value)}
                        className="w-full rounded-md border border-stone-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="text-stone-800">{displayValue(name, value)}</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <span
                      className={`text-xs font-medium ${low ? "text-amber-700" : "text-stone-500"}`}
                    >
                      {confidence !== undefined ? `${Math.round(confidence * 100)}%` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {lineEntries.map(([name, value]) => {
          const lines = value as LineItem[];
          return (
            <div key={name} className="mt-4">
              <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
                {name} ({lines.length}) — confidence{" "}
                {props.fieldConfidence[name] !== undefined
                  ? `${Math.round(props.fieldConfidence[name] * 100)}%`
                  : "—"}
              </p>
              <div className="mt-1 overflow-x-auto rounded-lg border border-stone-100">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-100 text-stone-400">
                      <th className="px-3 py-1.5 font-medium">Date</th>
                      <th className="px-3 py-1.5 font-medium">Description</th>
                      <th className="px-3 py-1.5 font-medium">Category</th>
                      <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={i} className="border-b border-stone-50 last:border-0">
                        <td className="px-3 py-1.5 text-stone-500">{line.date ?? "—"}</td>
                        <td className="px-3 py-1.5 text-stone-700">{line.description}</td>
                        <td className="px-3 py-1.5 text-stone-500">{line.category ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-stone-800">
                          {formatCents(line.amountCents ?? null)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {correctState ? (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              correctState.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
            }`}
          >
            {correctState.message}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button
                type="submit"
                disabled={correctPending}
                className="bg-emerald-700 text-white hover:bg-emerald-600"
              >
                {correctPending ? "Saving…" : "Save corrections & verify"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                formAction={approveExtraction}
                className="bg-emerald-700 text-white hover:bg-emerald-600"
              >
                Approve
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                Correct
              </Button>
              <Button formAction={rejectExtraction} variant="destructive">
                Reject
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
