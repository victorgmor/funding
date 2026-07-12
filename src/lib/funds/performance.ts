import type { Fund } from "@/lib/funds/types";

export type FundPerformance = {
  roi: number;
  baselineIndex: number;
  currentIndex: number;
};

/** Managed pools track performance via mandate ledger, not static baskets. */
export async function computeFundPerformance(
  _fund: Fund,
): Promise<FundPerformance | null> {
  return null;
}
