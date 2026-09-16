import { FINANCE_V1, financeV1 } from "@/finance";

import {
  downsideParamsFrom,
  applyDownside,
  missingRequiredInputs,
  toDealInputs,
} from "./assumptions";
import { buildChecklist } from "./checklist";
import type { AssumptionKey, AssumptionValue, DossierPayload } from "./types";
import { DOSSIER_SCHEMA_VERSION } from "./types";

// Builds the dossier payload from a set of assumptions. All finance outputs
// come from the versioned engine (`finance-v1` today) — this function never
// computes a number itself beyond mapping and shocking inputs. The clock is
// injected so the output is fully reproducible in tests.
export function buildDossierPayload(input: {
  assumptions: ReadonlyMap<AssumptionKey, AssumptionValue>;
  assumptionVersion: number;
  now: Date;
}): DossierPayload {
  const assumptions = input.assumptions;

  const missing = missingRequiredInputs(assumptions);
  const computable = missing.length === 0;
  const address = assumptions.get("address")?.valueText ?? null;

  if (!computable) {
    return {
      schemaVersion: DOSSIER_SCHEMA_VERSION,
      assumptionVersion: input.assumptionVersion,
      generatedAt: input.now.toISOString(),
      address,
      computable: false,
      missingInputs: missing,
      inputs: null,
      base: null,
      downside: null,
      checklist: buildChecklist({ assumptions, missingInputs: missing, base: null, downside: null }),
    };
  }

  const inputs = toDealInputs(assumptions);
  const base = financeV1.analyzeDeal(inputs);

  const params = downsideParamsFrom(assumptions);
  const downsideInputs = applyDownside(inputs, params);
  const downsideAnalysis = financeV1.analyzeDeal(downsideInputs);

  const downside = { params, inputs: downsideInputs, analysis: downsideAnalysis };

  return {
    schemaVersion: DOSSIER_SCHEMA_VERSION,
    assumptionVersion: input.assumptionVersion,
    generatedAt: input.now.toISOString(),
    address,
    computable: true,
    missingInputs: [],
    inputs,
    base,
    downside,
    checklist: buildChecklist({ assumptions, missingInputs: [], base, downside }),
  };
}

export { FINANCE_V1 };
export * from "./types";
export {
  ASSUMPTION_UNITS,
  applyDownside,
  defaultDownsideParams,
  defaultValueFor,
  downsideParamsFrom,
  missingRequiredInputs,
  numValue,
  toDealInputs,
} from "./assumptions";
export { buildChecklist } from "./checklist";
