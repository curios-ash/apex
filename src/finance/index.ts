import type { FinanceEngine } from "./types";
import { FINANCE_V1, financeV1 } from "./v1";

// The formula set is versioned so dossiers and pro formas can pin the exact
// math that produced them. Never mutate a shipped version — add finance-v2.
export const FINANCE_VERSION = FINANCE_V1;

export const financeEngines: Record<string, FinanceEngine> = {
  [FINANCE_V1]: financeV1,
};

export function getFinanceEngine(version: string = FINANCE_VERSION): FinanceEngine {
  const engine = financeEngines[version];
  if (!engine) {
    throw new Error(`Unknown finance engine version: ${version}`);
  }
  return engine;
}

export const finance = financeV1;

export * from "./types";
export { FINANCE_V1, financeV1 };
