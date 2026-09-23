import {
  DEAL1_ESTIMATES,
  type Deal1Gates,
  type Deal1Underwriting,
  type Sourced,
} from "./gates";

export type ParseError =
  | "address"
  | "price"
  | "rent"
  | "expenses"
  | "vacancy"
  | "rate"
  | "units"
  | "leased"
  | "rehab"
  | "place"
  | "ceiling"
  | "line"
  | "unit-range"
  | "down"
  | "gate-rate"
  | "dscr";

export function normalizeAddress(address: string): string {
  return address.trim().replace(/\s+/g, " ").toLowerCase();
}

export function dollarsInput(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export function percentInput(ratio: number): string {
  const pct = ratio * 100;
  const rounded = Math.round(pct * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function textOf(raw: FormDataEntryValue | null): string {
  return String(raw ?? "").trim();
}

function dollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function optionalMoney(
  raw: FormDataEntryValue | null,
  estimateCents: number,
): Sourced<number> | { error: ParseError } {
  const text = textOf(raw);
  if (!text) return { value: estimateCents, source: "estimate" };
  const cents = dollarsToCents(text);
  if (cents === null) return { error: "price" };
  return { value: cents, source: "entered" };
}

function optionalPercentRatio(
  raw: FormDataEntryValue | null,
  estimate: number,
  error: ParseError,
): Sourced<number> | { error: ParseError } {
  const text = textOf(raw).replace(/%/g, "");
  if (!text) return { value: estimate, source: "estimate" };
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { error };
  return { value: n / 100, source: "entered" };
}

export function gatesFromForm(
  form: FormData,
): { ok: true; gates: Deal1Gates } | { ok: false; error: ParseError } {
  const place = textOf(form.get("place"));
  if (place.length < 2) return { ok: false, error: "place" };

  const ceiling = dollarsToCents(textOf(form.get("wideCeiling")));
  if (ceiling === null || ceiling <= 0) return { ok: false, error: "ceiling" };
  const passLine = dollarsToCents(textOf(form.get("passLine")));
  if (passLine === null || passLine <= 0) return { ok: false, error: "line" };

  const minUnits = Number(textOf(form.get("minUnits")));
  const maxUnits = Number(textOf(form.get("maxUnits")));
  if (!Number.isInteger(minUnits) || !Number.isInteger(maxUnits) || minUnits < 1 || maxUnits < minUnits) {
    return { ok: false, error: "unit-range" };
  }

  const downText = textOf(form.get("downPaymentPercent")).replace(/%/g, "");
  const downPct = Number(downText);
  if (!Number.isFinite(downPct) || downPct <= 0 || downPct >= 100) return { ok: false, error: "down" };

  const rateText = textOf(form.get("annualRatePercent")).replace(/%/g, "");
  const ratePct = Number(rateText);
  if (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct >= 100) return { ok: false, error: "gate-rate" };

  const dscrGate = Number(textOf(form.get("dscrGate")));
  if (!Number.isFinite(dscrGate) || dscrGate <= 0) return { ok: false, error: "dscr" };

  return {
    ok: true,
    gates: {
      place,
      wideCeilingCents: ceiling,
      passLineCents: passLine,
      minUnits,
      maxUnits,
      fullyLeasedRequired: form.get("fullyLeasedRequired") === "on",
      noHeavyRehabRequired: form.get("noHeavyRehabRequired") === "on",
      downPaymentRate: downPct / 100,
      annualRate: ratePct / 100,
      dscrGate,
    },
  };
}

export function underwritingFromForm(
  form: FormData,
  gates: Deal1Gates,
): { ok: true; address: string; input: Deal1Underwriting } | { ok: false; error: ParseError } {
  const address = textOf(form.get("address")).replace(/\s+/g, " ");
  if (address.length < 5) return { ok: false, error: "address" };

  const price = optionalMoney(form.get("purchasePrice"), gates.passLineCents);
  if ("error" in price) return { ok: false, error: "price" };
  if (price.value <= 0) return { ok: false, error: "price" };

  const rentRaw = textOf(form.get("monthlyRent"));
  let rent: Sourced<number>;
  if (!rentRaw) rent = { value: DEAL1_ESTIMATES.monthlyRentCents, source: "estimate" };
  else {
    const cents = dollarsToCents(rentRaw);
    if (cents === null) return { ok: false, error: "rent" };
    rent = { value: cents, source: "entered" };
  }

  const expensesRaw = textOf(form.get("operatingExpenses"));
  let expenses: Sourced<number>;
  if (!expensesRaw) {
    expenses = { value: DEAL1_ESTIMATES.annualOperatingExpensesCents, source: "estimate" };
  } else {
    const cents = dollarsToCents(expensesRaw);
    if (cents === null) return { ok: false, error: "expenses" };
    expenses = { value: cents, source: "entered" };
  }

  const vacancy = optionalPercentRatio(form.get("vacancyPercent"), DEAL1_ESTIMATES.vacancyRate, "vacancy");
  if ("error" in vacancy) return { ok: false, error: "vacancy" };

  const rate = optionalPercentRatio(form.get("interestPercent"), gates.annualRate, "rate");
  if ("error" in rate) return { ok: false, error: "rate" };
  if (rate.source === "entered" && (rate.value <= 0 || rate.value >= 1)) {
    return { ok: false, error: "rate" };
  }

  const unitsRaw = textOf(form.get("units"));
  let units: Sourced<number>;
  if (!unitsRaw) units = { value: DEAL1_ESTIMATES.units, source: "estimate" };
  else {
    const n = Number(unitsRaw);
    if (!Number.isInteger(n) || n < 1 || n > 20) return { ok: false, error: "units" };
    units = { value: n, source: "entered" };
  }

  const leasedRaw = textOf(form.get("fullyLeased")).toLowerCase();
  let fullyLeased: Sourced<boolean>;
  if (!leasedRaw) fullyLeased = { value: DEAL1_ESTIMATES.fullyLeased, source: "estimate" };
  else if (leasedRaw === "yes") fullyLeased = { value: true, source: "entered" };
  else if (leasedRaw === "no") fullyLeased = { value: false, source: "entered" };
  else return { ok: false, error: "leased" };

  const rehabRaw = textOf(form.get("heavyRehab")).toLowerCase();
  let heavyRehab: Sourced<boolean>;
  if (!rehabRaw) heavyRehab = { value: DEAL1_ESTIMATES.heavyRehab, source: "estimate" };
  else if (rehabRaw === "yes") heavyRehab = { value: true, source: "entered" };
  else if (rehabRaw === "no") heavyRehab = { value: false, source: "entered" };
  else return { ok: false, error: "rehab" };

  return {
    ok: true,
    address,
    input: {
      purchasePriceCents: price,
      monthlyRentCents: rent,
      vacancyRate: vacancy,
      annualOperatingExpensesCents: expenses,
      annualRate: rate,
      units,
      fullyLeased,
      heavyRehab,
    },
  };
}
