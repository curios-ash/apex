"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { saveBudgetLines, type BudgetState } from "./actions";

export function BudgetForm(props: {
  propertyId: string;
  propertyName: string;
  month: string;
  categories: string[];
  incomeCategories: string[];
  values: Record<string, number>;
}) {
  const [state, action, pending] = useActionState<BudgetState, FormData>(saveBudgetLines, null);

  const groups = [
    { label: "Income", categories: props.categories.filter((c) => props.incomeCategories.includes(c)) },
    { label: "Expenses", categories: props.categories.filter((c) => !props.incomeCategories.includes(c)) },
  ];

  return (
    <form action={action} className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <input type="hidden" name="propertyId" value={props.propertyId} />
      <input type="hidden" name="month" value={props.month} />
      <h2 className="text-lg font-semibold tracking-tight">
        {props.propertyName} — {props.month.slice(0, 7)}
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        Dollars per month. Leave blank to clear a line. Only categories you fund are tracked.
      </p>

      <div className="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-2">
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className="text-xs font-medium tracking-wide text-stone-500 uppercase">
              {group.label}
            </h3>
            <div className="mt-2 space-y-2">
              {group.categories.map((category) => {
                const cents = props.values[category];
                return (
                  <div key={category} className="flex items-center gap-3">
                    <label
                      htmlFor={`amount:${category}`}
                      className="w-40 text-sm text-stone-700"
                    >
                      {category.replaceAll("_", " ")}
                    </label>
                    <input
                      id={`amount:${category}`}
                      name={`amount:${category}`}
                      inputMode="decimal"
                      placeholder="0.00"
                      defaultValue={cents === undefined ? "" : (cents / 100).toFixed(2)}
                      className="w-32 rounded-md border border-stone-300 px-2 py-1.5 text-right text-sm"
                    />
                  </div>
                );
              })}
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
          {pending ? "Saving…" : "Save budget"}
        </Button>
      </div>
    </form>
  );
}
