import type { Fund } from "@/lib/funds/types";
import { fetchLiveMarkets } from "@/lib/polymarket/gamma";
import { ensureFundBaseline } from "@/lib/funds/store";

export type FundPerformance = {
  roi: number;
  baselineIndex: number;
  currentIndex: number;
};

export function weightedBasketIndex(
  legs: Array<{ weight: number; price: number }>,
): number {
  return legs.reduce((sum, leg) => sum + (leg.weight / 100) * leg.price, 0);
}

export function hasPerformanceBaseline(fund: Fund): boolean {
  return (
    fund.markets.length > 0 &&
    fund.markets.every(
      (market) =>
        market.entryPrice != null &&
        Number.isFinite(market.entryPrice) &&
        market.entryPrice > 0,
    )
  );
}

export async function computeFundPerformance(
  fund: Fund,
): Promise<FundPerformance | null> {
  try {
    const withBaseline = await ensureFundBaseline(fund);
    if (!hasPerformanceBaseline(withBaseline)) return null;

    const live = await fetchLiveMarkets(withBaseline.markets);
    const baselineIndex = weightedBasketIndex(
      withBaseline.markets.map((market) => ({
        weight: market.weight,
        price: market.entryPrice!,
      })),
    );
    const currentIndex = weightedBasketIndex(
      live.map((market) => ({
        weight: market.weight,
        price: market.price,
      })),
    );

    if (baselineIndex <= 0) return null;

    const roi = ((currentIndex / baselineIndex) - 1) * 100;

    return { roi, baselineIndex, currentIndex };
  } catch {
    return null;
  }
}
