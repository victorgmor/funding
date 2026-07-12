import { resolveLifecycleStage } from "@/lib/funds/lifecycle";
import { listMandatesByFund } from "@/lib/funds/mandates";
import { listPositionsByFund } from "@/lib/funds/mandate-positions";
import { getFundSettlement } from "@/lib/funds/settlement";
import { fetchTokenMidPrices } from "@/lib/polymarket/clob-prices";
import type { Fund, Mandate, MandatePosition } from "@/lib/funds/types";

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

function mandateAum(
  mandate: Mandate,
  positions: MandatePosition[],
  mids: Map<string, number>,
): number {
  const positionsValue = positions
    .filter((p) => p.mandateId === mandate.id)
    .reduce(
      (sum, pos) => sum + pos.shares * (mids.get(pos.tokenId) ?? pos.avgPrice),
      0,
    );
  return mandate.cashUsdc + positionsValue;
}

/** Mark-to-market pool P&L — null during deposit stage or with no commitments. */
export async function computeFundPoolPerformance(
  fund: Fund,
): Promise<FundPoolPerformance | null> {
  const stage = resolveLifecycleStage(fund);
  if (stage === "deposit") return null;

  const mandates = await listMandatesByFund(fund.slug);
  const depositedUsdc = round(
    mandates.reduce((sum, m) => sum + m.notionalUsdc, 0),
    2,
  );
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
  const mids = await fetchTokenMidPrices(positions.map((p) => p.tokenId));
  const aumUsdc = round(
    mandates.reduce((sum, m) => sum + mandateAum(m, positions, mids), 0),
    2,
  );
  const profitUsdc = round(aumUsdc - depositedUsdc, 2);
  const roi = round((profitUsdc / depositedUsdc) * 100, 2);

  return { roi, profitUsdc, aumUsdc, depositedUsdc };
}

/** @deprecated alias — use computeFundPoolPerformance */
export async function computeFundPerformance(
  fund: Fund,
): Promise<FundPerformance | null> {
  const perf = await computeFundPoolPerformance(fund);
  if (!perf) return null;
  return perf;
}
