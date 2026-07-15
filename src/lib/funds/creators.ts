import type { Fund } from "@/lib/funds/types";

export const TOP_MANAGERS_CAROUSEL_LIMIT = 15;

export type TopCreator = {
  id: string;
  name: string;
  verified: boolean;
  fundCount: number;
  /** Sum of committed capital across all published funds. */
  totalDepositedUsdc: number;
  /** Sum of pool P&L across all published funds (gains and losses). */
  totalProfitUsdc: number;
};

type Options = {
  limit?: number;
  profitByFundSlug?: Record<string, number>;
  depositedByFundSlug?: Record<string, number>;
};

export function sumCreatorProfit(
  funds: Fund[],
  creatorId: string,
  profitByFundSlug: Record<string, number>,
): number {
  const id = creatorId.toLowerCase();
  return funds
    .filter((fund) => fund.manager.id.toLowerCase() === id)
    .reduce((sum, fund) => sum + (profitByFundSlug[fund.slug] ?? 0), 0);
}

export function getTopCreators(funds: Fund[], options: Options = {}): TopCreator[] {
  const {
    limit = 12,
    profitByFundSlug = {},
    depositedByFundSlug = {},
  } = options;
  const byId = new Map<string, TopCreator>();

  for (const fund of funds) {
    const profit = profitByFundSlug[fund.slug] ?? 0;
    const deposited = depositedByFundSlug[fund.slug] ?? 0;
    const existing = byId.get(fund.manager.id);

    if (!existing) {
      byId.set(fund.manager.id, {
        id: fund.manager.id,
        name: fund.manager.name,
        verified: fund.manager.verified,
        fundCount: 1,
        totalDepositedUsdc: deposited,
        totalProfitUsdc: profit,
      });
      continue;
    }

    existing.fundCount += 1;
    existing.totalDepositedUsdc += deposited;
    existing.totalProfitUsdc += profit;
  }

  return [...byId.values()]
    .sort((a, b) => {
      if (b.totalProfitUsdc !== a.totalProfitUsdc) {
        return b.totalProfitUsdc - a.totalProfitUsdc;
      }
      if (b.fundCount !== a.fundCount) return b.fundCount - a.fundCount;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
