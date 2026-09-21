"use client";

import { useMemo, useState } from "react";

import { runCalculator, type CalculatorInputs } from "@/deals/calculator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, formatMultiple, formatPercent } from "@/lib/format";

import { saveCalculator } from "../../actions";

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function Field({
  name,
  label,
  value,
  onChange,
  hint,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="mt-1.5 h-12 bg-white text-base md:text-base"
      />
      {hint ? <p className="mt-1 text-xs text-[#8a8172]">{hint}</p> : null}
    </div>
  );
}

export function CalculatorForm({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: CalculatorInputs;
}) {
  const [purchasePrice, setPurchasePrice] = useState(centsToDollars(initial.purchasePriceCents));
  const [monthlyRent, setMonthlyRent] = useState(centsToDollars(initial.monthlyRentCents));
  const [otherMonthlyIncome, setOtherMonthlyIncome] = useState(
    centsToDollars(initial.otherMonthlyIncomeCents),
  );
  const [vacancyPercent, setVacancyPercent] = useState(String(initial.vacancyRate * 100));
  const [annualOperatingExpenses, setAnnualOperatingExpenses] = useState(
    centsToDollars(initial.annualOperatingExpensesCents),
  );
  const [closingCosts, setClosingCosts] = useState(centsToDollars(initial.closingCostsCents));
  const [initialRepairs, setInitialRepairs] = useState(centsToDollars(initial.initialRepairsCents));
  const [loanPrincipal, setLoanPrincipal] = useState(centsToDollars(initial.loanPrincipalCents));
  const [interestPercent, setInterestPercent] = useState(String(initial.loanInterestRate * 100));
  const [loanTermMonths, setLoanTermMonths] = useState(String(initial.loanTermMonths));
  const [reservePercent, setReservePercent] = useState(String(initial.reserveRate * 100));
  const [downsideRentPercent, setDownsideRentPercent] = useState(
    String(initial.downsideRentShock * 100),
  );
  const [downsideVacancyPoints, setDownsideVacancyPoints] = useState(
    String(initial.downsideVacancyDelta * 100),
  );
  const [downsideExpensePercent, setDownsideExpensePercent] = useState(
    String(initial.downsideExpenseShock * 100),
  );

  const result = useMemo(
    () =>
      runCalculator({
        purchasePriceCents: Math.round(Number(purchasePrice || 0) * 100) || 0,
        monthlyRentCents: Math.round(Number(monthlyRent || 0) * 100) || 0,
        otherMonthlyIncomeCents: Math.round(Number(otherMonthlyIncome || 0) * 100) || 0,
        vacancyRate: Number(vacancyPercent || 0) / 100,
        annualOperatingExpensesCents: Math.round(Number(annualOperatingExpenses || 0) * 100) || 0,
        closingCostsCents: Math.round(Number(closingCosts || 0) * 100) || 0,
        initialRepairsCents: Math.round(Number(initialRepairs || 0) * 100) || 0,
        loanPrincipalCents: Math.round(Number(loanPrincipal || 0) * 100) || 0,
        loanInterestRate: Number(interestPercent || 0) / 100,
        loanTermMonths: Number(loanTermMonths || 360) || 360,
        reserveRate: Number(reservePercent || 0) / 100,
        downsideRentShock: Number(downsideRentPercent || 0) / 100,
        downsideVacancyDelta: Number(downsideVacancyPoints || 0) / 100,
        downsideExpenseShock: Number(downsideExpensePercent || 0) / 100,
      }),
    [
      purchasePrice,
      monthlyRent,
      otherMonthlyIncome,
      vacancyPercent,
      annualOperatingExpenses,
      closingCosts,
      initialRepairs,
      loanPrincipal,
      interestPercent,
      loanTermMonths,
      reservePercent,
      downsideRentPercent,
      downsideVacancyPoints,
      downsideExpensePercent,
    ],
  );

  const base = result.base?.year1;
  const down = result.downside?.year1;

  return (
    <form action={saveCalculator} className="flex flex-col gap-6">
      <input type="hidden" name="propertyId" value={propertyId} />
      <aside className="space-y-4 rounded-2xl border border-[#1c1914] bg-[#1c1914] p-5 text-[#f4e6c8] sm:p-6">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#c45c26] uppercase">
          finance-v1 · live
        </p>
        {!result.computable ? (
          <p className="text-sm leading-relaxed text-[#d7cbb8]">
            Enter a purchase price and monthly rent. Still missing: {result.missing.join(", ")}.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Output label="Year-1 NOI" value={formatCents(base?.noiCents)} large />
            <Output label="DSCR" value={formatMultiple(base?.dscr ?? null)} large />
            <Output label="Cash-on-cash" value={formatPercent(base?.cashOnCashReturn ?? null, 1)} large />
            <Output
              label="Downside cash flow"
              value={formatCents(down?.cashFlowBeforeTaxCents)}
              warn={(down?.cashFlowBeforeTaxCents ?? 0) < 0}
              large
            />
          </div>
        )}
        {result.computable ? (
          <div className="grid gap-2 border-t border-white/10 pt-4 text-sm sm:grid-cols-2">
            <Output label="Monthly mortgage" value={formatCents(result.monthlyMortgageCents)} />
            <Output label="Year-1 cash flow" value={formatCents(base?.cashFlowBeforeTaxCents)} />
            <Output label="Downside NOI" value={formatCents(down?.noiCents)} />
            <Output label="Downside DSCR" value={formatMultiple(down?.dscr ?? null)} />
          </div>
        ) : null}
      </aside>

      <div className="space-y-6 rounded-2xl border border-[#e2d5be] bg-white p-5 sm:p-6">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-2xl">Price, rent, and the loan</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#5c5549]">
            Change a number and the panel above recomputes. Save underwriting when the case is the
            one you want to keep.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="purchasePrice" label="Purchase price ($)" value={purchasePrice} onChange={setPurchasePrice} />
          <Field name="monthlyRent" label="Monthly rent ($)" value={monthlyRent} onChange={setMonthlyRent} />
          <Field
            name="otherMonthlyIncome"
            label="Other monthly income ($)"
            value={otherMonthlyIncome}
            onChange={setOtherMonthlyIncome}
          />
          <Field name="vacancyPercent" label="Vacancy (%)" value={vacancyPercent} onChange={setVacancyPercent} />
          <Field
            name="annualOperatingExpenses"
            label="Annual operating expenses ($)"
            value={annualOperatingExpenses}
            onChange={setAnnualOperatingExpenses}
            hint="Taxes, insurance, HOA, maintenance, management — one box on purpose."
          />
          <Field name="closingCosts" label="Closing costs ($)" value={closingCosts} onChange={setClosingCosts} />
          <Field name="initialRepairs" label="Initial repairs ($)" value={initialRepairs} onChange={setInitialRepairs} />
          <Field name="loanPrincipal" label="Loan amount ($)" value={loanPrincipal} onChange={setLoanPrincipal} />
          <Field name="interestPercent" label="Interest rate (%)" value={interestPercent} onChange={setInterestPercent} />
          <Field name="loanTermMonths" label="Term (months)" value={loanTermMonths} onChange={setLoanTermMonths} />
          <Field name="reservePercent" label="Reserves (% of EGI)" value={reservePercent} onChange={setReservePercent} />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Downside case</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field
              name="downsideRentPercent"
              label="Rent shock (%)"
              value={downsideRentPercent}
              onChange={setDownsideRentPercent}
            />
            <Field
              name="downsideVacancyPoints"
              label="Vacancy + (pp)"
              value={downsideVacancyPoints}
              onChange={setDownsideVacancyPoints}
            />
            <Field
              name="downsideExpensePercent"
              label="Expense shock (%)"
              value={downsideExpensePercent}
              onChange={setDownsideExpensePercent}
            />
          </div>
        </div>
        <Button
          type="submit"
          className="h-14 w-full bg-[#c45c26] text-base font-semibold text-white hover:bg-[#9a3f12]"
        >
          Save underwriting
        </Button>
      </div>
    </form>
  );
}

function Output({
  label,
  value,
  warn,
  large,
}: {
  label: string;
  value: string;
  warn?: boolean;
  large?: boolean;
}) {
  return (
    <div className={large ? "" : "flex items-baseline justify-between gap-4"}>
      <p className="text-sm text-[#d7cbb8]">{label}</p>
      <p
        className={`font-[family-name:var(--font-heading)] ${large ? "mt-1 text-3xl" : "text-lg"} ${warn ? "text-red-300" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
