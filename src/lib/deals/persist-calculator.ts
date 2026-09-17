import { ASSUMPTION_UNITS, type AssumptionKey, type AssumptionValue } from "@/dossier";
import { calculatorFromDossierAssumptions, type CalculatorInputs } from "@/deals/calculator";
import { createDossier, loadDossier, reviseDossier } from "@/lib/dossier/run";
import { latestDossierId } from "@/lib/deals/open";

export function calculatorToAssumptionUpdates(
  input: CalculatorInputs,
): Partial<Record<AssumptionKey, number | string | null>> {
  return {
    purchase_price: input.purchasePriceCents,
    monthly_rent: input.monthlyRentCents,
    other_monthly_income: input.otherMonthlyIncomeCents,
    vacancy_rate: input.vacancyRate,
    closing_costs: input.closingCostsCents,
    initial_repairs: input.initialRepairsCents,
    loan_principal: input.loanPrincipalCents,
    loan_interest_rate: input.loanInterestRate,
    loan_term_months: input.loanTermMonths,
    reserve_rate: input.reserveRate,
    downside_rent_shock: -Math.abs(input.downsideRentShock),
    downside_vacancy_delta: input.downsideVacancyDelta,
    downside_expense_shock: input.downsideExpenseShock,
    // Calculator uses a single opex box. Named expense lines are zeroed so
    // the dossier engine's sum matches what the buyer just ran.
    property_tax_annual: 0,
    insurance_annual: 0,
    hoa_annual: 0,
    utilities_annual: 0,
    maintenance_annual: 0,
    management_fee_annual: 0,
    other_expenses_annual: input.annualOperatingExpensesCents,
  };
}

export async function persistCalculatorToDossier(params: {
  workspaceId: string;
  userId: string | null;
  propertyId: string;
  title: string;
  address: string;
  input: CalculatorInputs;
}): Promise<{ dossierId: string }> {
  const existingId = await latestDossierId(params.workspaceId, params.propertyId);
  const updates = calculatorToAssumptionUpdates(params.input);

  if (existingId) {
    await reviseDossier({
      workspaceId: params.workspaceId,
      userId: params.userId,
      dossierId: existingId,
      updates,
    });
    return { dossierId: existingId };
  }

  const provided = new Map<AssumptionKey, AssumptionValue>();
  provided.set("address", {
    key: "address",
    valueNum: null,
    valueText: params.address,
    unit: "text",
    source: "manual",
    confidence: "high",
  });
  for (const [key, value] of Object.entries(updates)) {
    const k = key as AssumptionKey;
    if (typeof value !== "number") continue;
    provided.set(k, {
      key: k,
      valueNum: value,
      valueText: null,
      unit: ASSUMPTION_UNITS[k],
      source: "manual",
      confidence: "high",
    });
  }

  const { dossierId } = await createDossier({
    workspaceId: params.workspaceId,
    userId: params.userId,
    title: params.title,
    propertyId: params.propertyId,
    provided,
  });
  return { dossierId };
}

export async function calculatorInputsForProperty(workspaceId: string, propertyId: string) {
  const dossierId = await latestDossierId(workspaceId, propertyId);
  if (!dossierId) return { dossierId: null, inputs: calculatorFromDossierAssumptions({}) };
  const loaded = await loadDossier(workspaceId, dossierId);
  if (!loaded) return { dossierId, inputs: calculatorFromDossierAssumptions({}) };
  const values: Record<string, number | null> = {};
  for (const row of loaded.assumptions) {
    values[row.key] = row.valueNum;
  }
  return { dossierId, inputs: calculatorFromDossierAssumptions(values) };
}
