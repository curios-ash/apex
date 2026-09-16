"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";

import { saveOnboardingBudget, type OnboardingBudgetState } from "./actions";

type Amounts = Record<string, number>;

function toDollars(amounts: Amounts): Record<string, string> {
  return Object.fromEntries(
    Object.entries(amounts).map(([category, cents]) => [category, (cents / 100).toFixed(2)]),
  );
}

// The budget step's two starting points. Both prefill the same editable
// form; the numbers are deterministic suggestions (purchase model = property
// record or dossier assumptions, history = averaged actual_lines), never
// LLM output.
export function BudgetWizard(props: {
  propertyId: string;
  categories: string[];
  incomeCategories: string[];
  purchase: { amounts: Amounts; notes: string[] };
  history: { amounts: Amounts; notes: string[]; months: string[] };
}) {
  const historyAvailable = Object.keys(props.history.amounts).length > 0;
  const [path, setPath] = useState<"purchase" | "history">("purchase");
  const [values, setValues] = useState<Record<string, string>>(() =>
    toDollars(props.purchase.amounts),
  );
  const [state, action, pending] = useActionState<OnboardingBudgetState, FormData>(
    saveOnboardingBudget,
    null,
  );

  function selectPath(next: "purchase" | "history") {
    setPath(next);
    setValues(toDollars(next === "purchase" ? props.purchase.amounts : props.history.amounts));
  }

  const notes = path === "purchase" ? props.purchase.notes : props.history.notes;
  const groups = [
    { label: "Income", categories: props.categories.filter((c) => props.incomeCategories.includes(c)) },
    { label: "Expenses", categories: props.categories.filter((c) => !props.incomeCategories.includes(c)) },
  ];

  return (
    <div className="mt-5">
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Budget starting point">
        <button
          type="button"
          onClick={() => selectPath("purchase")}
          aria-pressed={path === "purchase"}
          className={`rounded-xl border p-4 text-left text-sm transition-colors ${
            path === "purchase"
              ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600"
              : "border-stone-200 bg-white hover:bg-stone-50"
          }`}
        >
          <span className="font-semibold text-stone-900">From the purchase model</span>
          <span className="mt-1 block text-stone-500">
            Rent from the property record, management fee from the agreement %, expenses from the
            dossier when one exists.
          </span>
        </button>
        <button
          type="button"
          onClick={() => historyAvailable && selectPath("history")}
          aria-pressed={path === "history"}
          disabled={!historyAvailable}
          className={`rounded-xl border p-4 text-left text-sm transition-colors ${
            path === "history"
              ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600"
              : "border-stone-200 bg-white hover:bg-stone-50"
          } ${historyAvailable ? "" : "cursor-not-allowed opacity-50"}`}
        >
          <span className="font-semibold text-stone-900">From 3 months of history</span>
          <span className="mt-1 block text-stone-500">
            {historyAvailable
              ? `Averages your actuals from ${props.history.months[0].slice(0, 7)} – ${props.history.months[2].slice(0, 7)}.`
              : "No reconciled statements yet — this unlocks once actuals exist."}
          </span>
        </button>
      </div>

      {notes.length > 0 ? (
        <ul className="mt-3 space-y-0.5 text-xs text-stone-500">
          {notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      ) : null}

      <form action={action} className="mt-5">
        <input type="hidden" name="propertyId" value={props.propertyId} />
        <input type="hidden" name="source" value={path} />
        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="text-xs font-medium tracking-wide text-stone-500 uppercase">
                {group.label}
              </h3>
              <div className="mt-2 space-y-2">
                {group.categories.map((category) => (
                  <div key={category} className="flex items-center gap-3">
                    <label htmlFor={`wizard:${category}`} className="w-40 text-sm text-stone-700">
                      {category.replaceAll("_", " ")}
                    </label>
                    <input
                      id={`wizard:${category}`}
                      name={`amount:${category}`}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={values[category] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [category]: event.target.value }))
                      }
                      className="w-32 rounded-md border border-stone-300 px-2 py-1.5 text-right text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {state ? (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
            }`}
          >
            {state.message}
          </p>
        ) : null}

        <div className="mt-5">
          <Button
            type="submit"
            disabled={pending}
            className="bg-emerald-700 text-white hover:bg-emerald-600"
          >
            {pending ? "Saving…" : "Save budget and open the review"}
          </Button>
        </div>
      </form>
    </div>
  );
}
