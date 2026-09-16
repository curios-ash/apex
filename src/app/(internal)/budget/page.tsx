import { and, eq } from "drizzle-orm";

import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { budgetLines, properties } from "@/lib/db/schema";
import { transactionCategories } from "@/lib/llm/schemas";
import { getActiveWorkspace } from "@/lib/workspace";
import { INCOME_CATEGORIES } from "@/reconcile";

import { BudgetForm } from "./budget-form";

export const dynamic = "force-dynamic";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string; month?: string }>;
}) {
  const { property: propertyParam, month: monthParam } = await searchParams;
  const workspace = await getActiveWorkspace();

  const propertyRows = await db
    .select()
    .from(properties)
    .where(eq(properties.workspaceId, workspace.id))
    .orderBy(properties.name);

  const defaultMonth = new Date().toISOString().slice(0, 7);
  const selectedMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : defaultMonth;
  const selectedProperty =
    propertyRows.find((p) => p.id === propertyParam) ?? propertyRows[0] ?? null;

  const existing =
    selectedProperty === null
      ? []
      : await db
          .select()
          .from(budgetLines)
          .where(
            and(
              eq(budgetLines.workspaceId, workspace.id),
              eq(budgetLines.propertyId, selectedProperty.id),
              eq(budgetLines.month, `${selectedMonth}-01`),
            ),
          );

  const values = Object.fromEntries(existing.map((b) => [b.category, b.amountCents]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          The monthly plan per property and category, in dollars. Reconciliation compares
          statements against these lines — the vacancy and fee-drift rules need a rent budget
          and a PM agreement to work.
        </p>
      </div>

      {propertyRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          No properties yet — run <code className="font-mono">npm run db:seed</code> to create
          the demo property.
        </p>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="property" className="text-sm font-medium text-stone-700">
                Property
              </label>
              <select
                id="property"
                name="property"
                defaultValue={selectedProperty?.id}
                className="mt-1 block w-64 rounded-lg border border-stone-300 px-3 py-2 text-sm"
              >
                {propertyRows.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="month" className="text-sm font-medium text-stone-700">
                Month
              </label>
              <input
                id="month"
                name="month"
                type="month"
                defaultValue={selectedMonth}
                className="mt-1 block rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" variant="outline">
              Load
            </Button>
          </form>

          {selectedProperty ? (
            <BudgetForm
              key={`${selectedProperty.id}:${selectedMonth}`}
              propertyId={selectedProperty.id}
              propertyName={selectedProperty.name}
              month={`${selectedMonth}-01`}
              categories={[...transactionCategories]}
              incomeCategories={[...INCOME_CATEGORIES]}
              values={values}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
