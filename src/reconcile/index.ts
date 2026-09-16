import { computeActualLines, computeVariances, selectWorkingTransactions } from "./match";
import { RULES, type RuleContext } from "./rules";
import type { ReconcilePropertyMonthInput, ReconcilePropertyMonthOutput } from "./types";

// Reconciles one property-month: match transactions to budget lines, compute
// variances, run the Part 3 rule set. Pure — the DB runner in
// src/lib/reconcile/run.ts loads and persists; tests call this directly.
export function reconcilePropertyMonth(
  input: ReconcilePropertyMonthInput,
): ReconcilePropertyMonthOutput {
  const working = selectWorkingTransactions(input.transactions);
  const actualLines = computeActualLines(working, input.propertyId, input.month);
  const variances = computeVariances(input.budgetLines, actualLines, input.propertyId, input.month);

  const ctx: RuleContext = {
    propertyId: input.propertyId,
    propertyName: input.propertyName,
    month: input.month,
    working,
    budgetLines: input.budgetLines,
    pmAgreement: input.pmAgreement,
  };
  const exceptions = RULES.flatMap((rule) => rule(ctx));

  return {
    propertyId: input.propertyId,
    month: input.month,
    actualLines,
    variances,
    exceptions,
  };
}

export * from "./types";
export { computeActualLines, computeVariances, preferredSource, selectWorkingTransactions } from "./match";
export {
  RULES,
  normalizeDescription,
  workOrderRef,
  FEE_DRIFT_MIN_CENTS,
  FEE_DRIFT_MIN_RELATIVE,
  DUPLICATE_WINDOW_DAYS,
  REPEAT_REPAIR_WINDOW_DAYS,
  REPEAT_REPAIR_MIN_COUNT,
  JUMP_BASELINE_MONTHS,
  JUMP_MIN_CENTS,
  JUMP_MIN_RELATIVE,
  VACANCY_TOLERANCE,
  WORK_ORDER_AGING_DAYS,
} from "./rules";
