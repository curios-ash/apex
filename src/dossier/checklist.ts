import { formatCents } from "@/lib/format";

import type { AssumptionValue, ChecklistItem, DownsideParams } from "./types";
import type { AssumptionKey } from "./types";
import type { DealAnalysis } from "@/finance/types";

// The diligence checklist is generated from the deal's own gaps: every
// assumption that is missing, defaulted, or unverified becomes an item, and
// the downside case contributes financing-risk items. Deterministic — same
// assumptions and outputs always produce the same checklist.

const DOWNSIDE_DSCR_FLOOR = 1.2;
const BASE_DSCR_FLOOR = 1.25;

function item(
  id: string,
  severity: ChecklistItem["severity"],
  label: string,
  detail: string,
): ChecklistItem {
  return { id, severity, label, detail };
}

export function buildChecklist(input: {
  assumptions: ReadonlyMap<AssumptionKey, AssumptionValue>;
  missingInputs: AssumptionKey[];
  base: DealAnalysis | null;
  downside: { params: DownsideParams; analysis: DealAnalysis } | null;
}): ChecklistItem[] {
  const { assumptions, missingInputs, base, downside } = input;
  const items: ChecklistItem[] = [];

  const sourceOf = (key: AssumptionKey) => assumptions.get(key)?.source ?? "default";
  const numOf = (key: AssumptionKey) => assumptions.get(key)?.valueNum ?? null;

  // --- Gaps: missing or unverified numbers --------------------------------
  if (missingInputs.includes("purchase_price")) {
    items.push(
      item(
        "missing-price",
        "critical",
        "Add the asking price",
        "The pro forma cannot be computed without a purchase price.",
      ),
    );
  }
  if (missingInputs.includes("monthly_rent")) {
    items.push(
      item(
        "missing-rent",
        "critical",
        "Add a rent estimate",
        "Pull 3 comparable rentals within a mile and enter the median rent. The pro forma cannot be computed without it.",
      ),
    );
  } else if (sourceOf("monthly_rent") !== "manual") {
    items.push(
      item(
        "verify-rent",
        "important",
        "Verify the rent with comps",
        "The rent figure comes from the listing or a default, not your own comps. Check 3 comparable rentals before trusting the pro forma.",
      ),
    );
  }

  if (sourceOf("property_tax_annual") === "default") {
    items.push(
      item(
        "verify-taxes",
        "important",
        "Pull the county tax record",
        "Property tax is a placeholder (1.1% of price). The county appraisal district has the actual assessment — and check for reassessment on sale.",
      ),
    );
  }
  if (sourceOf("insurance_annual") === "default") {
    items.push(
      item(
        "verify-insurance",
        "important",
        "Get a landlord policy quote",
        "Insurance is a placeholder (0.5% of price). Quote an actual landlord dwelling policy before removing contingencies.",
      ),
    );
  }

  const hoaAnnual = numOf("hoa_annual") ?? 0;
  if (hoaAnnual > 0) {
    items.push(
      item(
        "hoa-docs",
        "important",
        "Request the HOA documents",
        `Dues run ${formatCents(hoaAnnual)}/yr. Get the CC&Rs, reserve study, meeting minutes, and confirm rentals are allowed.`,
      ),
    );
  }

  if (numOf("year_built") === null) {
    items.push(
      item(
        "verify-year-built",
        "standard",
        "Confirm the year built",
        "Not stated in the listing. The county record has it — it drives insurance cost and capex expectations.",
      ),
    );
  }
  if (numOf("sqft") === null) {
    items.push(
      item(
        "verify-sqft",
        "standard",
        "Confirm the square footage",
        "Not stated in the listing. Cross-check the county record against the listing before offering.",
      ),
    );
  }
  if ((numOf("tenant_occupied") ?? 0) === 1) {
    items.push(
      item(
        "tenant-docs",
        "important",
        "Request the lease and rent roll",
        "The listing indicates a tenant in place. Get the lease, payment history, deposit ledger, and a signed estoppel letter before close.",
      ),
    );
  }

  // --- Financing risk from the engine outputs ------------------------------
  const baseDscr = base?.year1.dscr ?? null;
  if (baseDscr !== null && baseDscr < BASE_DSCR_FLOOR) {
    items.push(
      item(
        "base-dscr",
        "important",
        "Base-case DSCR is tight",
        `Year-1 DSCR is ${baseDscr.toFixed(2)} — below the ${BASE_DSCR_FLOOR.toFixed(2)} most investor lenders want to see. Expect pricing or reserve requirements to reflect it.`,
      ),
    );
  }
  const downsideAnalysis = downside?.analysis ?? null;
  if (downsideAnalysis) {
    const dDscr = downsideAnalysis.year1.dscr;
    if (dDscr !== null && dDscr < DOWNSIDE_DSCR_FLOOR) {
      items.push(
        item(
          "downside-dscr",
          "critical",
          "Downside DSCR below lender floor",
          `In the downside case (rent ${Math.round((downside?.params.rentShockRate ?? 0) * 100)}%, vacancy +${Math.round((downside?.params.vacancyDelta ?? 0) * 100)}pp, expenses +${Math.round((downside?.params.expenseShockRate ?? 0) * 100)}%) DSCR falls to ${dDscr.toFixed(2)}, below ${DOWNSIDE_DSCR_FLOOR.toFixed(2)}. Renegotiate price, bring more cash, or walk.`,
        ),
      );
    }
    if (downsideAnalysis.year1.cashFlowBeforeTaxCents < 0) {
      items.push(
        item(
          "downside-cashflow",
          "critical",
          "Negative cash flow in the downside case",
          `The downside case loses ${formatCents(Math.abs(downsideAnalysis.year1.cashFlowBeforeTaxCents))}/yr before tax. Decide now whether reserves cover it.`,
        ),
      );
    }
  }

  // --- Standard diligence ---------------------------------------------------
  items.push(
    item(
      "inspection",
      "standard",
      "Order an independent inspection",
      "General inspection plus sewer scope and roof/HVAC specialists as indicated. Tie repair credits to the report.",
    ),
    item(
      "title",
      "standard",
      "Order title work",
      "Confirm liens, easements, and vesting. Buy an owner's title policy.",
    ),
    item(
      "insurance-binding",
      "standard",
      "Confirm insurance is bindable",
      "Get a binding quote before removing contingencies — some roofs, panels, and zip codes are hard to place.",
    ),
  );

  const order = { critical: 0, important: 1, standard: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}
