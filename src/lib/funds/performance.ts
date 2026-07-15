import { resolveLifecycleStage } from "@/lib/funds/lifecycle";
import { listPositionsByFund } from "@/lib/funds/mandate-positions";
import { listTradesByFund } from "@/lib/funds/mandate-trades";
import { buildVirtualPool } from "@/lib/funds/pool";
import { getFundSettlement } from "@/lib/funds/settlement";
import {
  fetchTokenValuations,
  mandateMarkValue,
  resolveDepositAddresses,
} from "@/lib/funds/valuation";
import type { Fund } from "@/lib/funds/types";

export type FundPerformance = {
  roi: number;
  profitUsdc: number;
  aumUsdc: number;
  depositedUsdc: number;
};

export type FundPoolPerformance = FundPerformance;

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Mark-to-market pool P&L — null with no commitments. */
export async function computeFundPoolPerformance(
  fund: Fund,
): Promise<FundPoolPerformance | null> {
  const stage = resolveLifecycleStage(fund);

  const pool = await buildVirtualPool(fund);
  const depositedUsdc = round(pool.totalNotional, 2);
  if (depositedUsdc <= 0) return null;

  if (stage === "closed") {
    const settlement = await getFundSettlement(fund.slug);
    if (settlement) {
      const aumUsdc = round(
        settlement.mandates.reduce((sum, row) => sum + row.finalValueUsdc, 0),
        2,
      );
      const profitUsdc = round(aumUsdc - depositedUsdc, 2);
      const roi = round((profitUsdc / depositedUsdc) * 100, 2);
      return { roi, profitUsdc, aumUsdc, depositedUsdc };
    }
  }

  const positions = await listPositionsByFund(fund.slug);
  const filledTrades = (await listTradesByFund(fund.slug)).filter(
    (trade) => trade.status === "filled",
  );
  const depositByInvestor = await resolveDepositAddresses(
    fund.slug,
    [
      ...pool.mandates.map((mandate) => mandate.investorWallet),
      ...filledTrades.map((trade) => trade.investorWallet),
    ],
  );
  const valuations = await fetchTokenValuations(
    positions,
    depositByInvestor,
    filledTrades,
  );
  const aumUsdc = round(
    pool.mandates.reduce(
      (sum, mandate) =>
        sum +
        mandateMarkValue(mandate, positions, valuations, filledTrades),
      0,
    ),
    2,
  );
  const profitUsdc = round(aumUsdc - depositedUsdc, 2);
  const roi = round((profitUsdc / depositedUsdc) * 100, 2);

  return { roi, profitUsdc, aumUsdc, depositedUsdc };
}

/** Pool P&L per fund slug — 0 during deposit or with no commitments; losses are negative. */
export async function computeProfitByFundSlug(
  funds: Fund[],
): Promise<Record<string, number>> {
  return Object.fromEntries(
    await Promise.all(
      funds.map(async (fund) => {
        const performance = await computeFundPoolPerformance(fund);
        return [fund.slug, performance?.profitUsdc ?? 0] as const;
      }),
    ),
  );
}

/** @deprecated alias — use computeFundPoolPerformance */
export async function computeFundPerformance(
  fund: Fund,
): Promise<FundPerformance | null> {
  const perf = await computeFundPoolPerformance(fund);
  if (!perf) return null;
  return perf;
}
