import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssumptionKey, AssumptionValue } from "@/dossier";

// The editable assumption grid, shared by the manual-create form and the
// dossier revise form. Money renders as dollars, rates as percents; the
// server action converts back to cents/ratios. Blank fields are left
// unchanged (on revise) or defaulted (on create).

interface FieldSpec {
  key: AssumptionKey;
  label: string;
  kind: "money" | "percent" | "count" | "text";
  hint?: string;
  step?: string;
}

const GROUPS: { title: string; fields: FieldSpec[] }[] = [
  {
    title: "Deal",
    fields: [
      { key: "address", label: "Address", kind: "text" },
      { key: "purchase_price", label: "Purchase price", kind: "money", hint: "$" },
      { key: "closing_costs", label: "Closing costs", kind: "money", hint: "$" },
      { key: "initial_repairs", label: "Initial repairs", kind: "money", hint: "$" },
      { key: "bedrooms", label: "Bedrooms", kind: "count" },
      { key: "bathrooms", label: "Bathrooms", kind: "count", step: "0.5" },
      { key: "sqft", label: "Square feet", kind: "count" },
      { key: "year_built", label: "Year built", kind: "count" },
    ],
  },
  {
    title: "Income",
    fields: [
      { key: "monthly_rent", label: "Rent (monthly)", kind: "money", hint: "$" },
      { key: "other_monthly_income", label: "Other income (monthly)", kind: "money", hint: "$" },
      { key: "vacancy_rate", label: "Vacancy", kind: "percent", hint: "%" },
      { key: "rent_growth_rate", label: "Rent growth (annual)", kind: "percent", hint: "%" },
    ],
  },
  {
    title: "Operating expenses (annual)",
    fields: [
      { key: "property_tax_annual", label: "Property tax", kind: "money", hint: "$" },
      { key: "insurance_annual", label: "Insurance", kind: "money", hint: "$" },
      { key: "hoa_annual", label: "HOA", kind: "money", hint: "$" },
      { key: "utilities_annual", label: "Utilities", kind: "money", hint: "$" },
      { key: "maintenance_annual", label: "Maintenance", kind: "money", hint: "$" },
      { key: "management_fee_annual", label: "Management fee", kind: "money", hint: "$" },
      { key: "other_expenses_annual", label: "Other", kind: "money", hint: "$" },
      { key: "expense_growth_rate", label: "Expense growth", kind: "percent", hint: "%" },
    ],
  },
  {
    title: "Financing & exit",
    fields: [
      { key: "loan_principal", label: "Loan amount (0 = all cash)", kind: "money", hint: "$" },
      { key: "loan_interest_rate", label: "Interest rate", kind: "percent", hint: "%" },
      { key: "loan_term_months", label: "Term (months)", kind: "count" },
      { key: "appreciation_rate", label: "Appreciation (annual)", kind: "percent", hint: "%" },
      { key: "selling_cost_rate", label: "Selling costs", kind: "percent", hint: "%" },
      { key: "reserve_rate", label: "Capital reserves (% of EGI)", kind: "percent", hint: "%" },
      { key: "holding_years", label: "Holding period (years)", kind: "count" },
    ],
  },
  {
    title: "Downside case",
    fields: [
      { key: "downside_rent_shock", label: "Rent shock", kind: "percent", hint: "%" },
      { key: "downside_vacancy_delta", label: "Vacancy increase (pp)", kind: "percent", hint: "%" },
      { key: "downside_expense_shock", label: "Expense shock", kind: "percent", hint: "%" },
    ],
  },
];

function displayValue(spec: FieldSpec, value: AssumptionValue | undefined): string {
  if (!value) return "";
  if (spec.kind === "text") return value.valueText ?? "";
  if (value.valueNum === null) return "";
  if (spec.kind === "money") return (value.valueNum / 100).toFixed(0);
  // Round to 4 decimal places of percent so binary float noise (0.15 * 100 =
  // 15.000000000000002) doesn't round-trip into a spurious "manual" edit.
  if (spec.kind === "percent") return String(Math.round(value.valueNum * 100 * 1e4) / 1e4);
  return value.valueNum.toString();
}

export function AssumptionFields({
  values,
}: {
  values: Map<AssumptionKey, AssumptionValue> | null;
}) {
  return (
    <div className="space-y-6">
      {GROUPS.map((group) => (
        <fieldset key={group.title}>
          <legend className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
            {group.title}
          </legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {group.fields.map((spec) => (
              <div key={spec.key} className={spec.kind === "text" ? "sm:col-span-2" : ""}>
                <Label htmlFor={`f-${spec.key}`}>{spec.label}</Label>
                <div className="relative mt-1.5">
                  {spec.hint ? (
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-stone-400">
                      {spec.hint}
                    </span>
                  ) : null}
                  <Input
                    id={`f-${spec.key}`}
                    name={spec.key}
                    type={spec.kind === "text" ? "text" : "number"}
                    inputMode={spec.kind === "text" ? undefined : "decimal"}
                    step={spec.step ?? "any"}
                    defaultValue={displayValue(spec, values?.get(spec.key))}
                    className={`bg-white ${spec.hint ? "pl-7" : ""}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
