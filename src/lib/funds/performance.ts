import { createTtlCache } from "@/lib/cache/ttl";
import { resolveLifecycleStage } from "@/lib/funds/lifecycle";
import { totalPoolDeposited } from "@/lib/funds/fanout";
import { listMandatesByFund } from "@/lib/funds/mandates";
import { buildVirtualPool } from "@/lib/funds/pool";
import { getFundSettlement } from "@/lib/funds/settlement";
import type { Fund } from "@/lib/funds/types";

export type FundPerformance = {
  roi: number;
  profitUsdc: number;
  /** deposited + profit — capital available in the pool. */
  aumUsdc: number;
  depositedUsdc: number;
};

export type FundPoolPerformance = FundPerformance;

export type PoolTotalEntry = {
  deposited: number;
  profitUsdc: number | null;
  roiPct: number | null;
};

const PERF_TTL_MS = 5_000;
const perfCache = createTtlCache<FundPoolPerformance | null>(PERF_TTL_MS);

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

async function computeFundPoolPerformanceUncached(
  fund: Fund,
  prebuiltPool?: Awaited<ReturnType<typeof buildVirtualPool>>,
): Promise<FundPoolPerformance | null> {
  const stage = resolveLifecycleStage(fund);

  // buildVirtualPool reconciles from live Polymarket books first.
  const pool = prebuiltPool ?? (await buildVirtualPool(fund));
  const depositedUsdc = round(pool.totalDeposited, 2);
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

  // After live heal, notional == deployable and deposited is reconstructed.
  const aumUsdc = round(pool.totalNotional, 2);
  const profitUsdc = round(aumUsdc - depositedUsdc, 2);
  const roi = round((profitUsdc / depositedUsdc) * 100, 2);

  return { roi, profitUsdc, aumUsdc, depositedUsdc };
}

/** Mark-to-market pool P&L — null with no commitments. */
export async function computeFundPoolPerformance(
  fund: Fund,
  prebuiltPool?: Awaited<ReturnType<typeof buildVirtualPool>>,
): Promise<FundPoolPerformance | null> {
  return perfCache.getOrSet(fund.slug, () =>
    computeFundPoolPerformanceUncached(fund, prebuiltPool),
  );
}

/** Homepage / API pool totals (deposited + P&L + ROI). */
export async function computePoolTotalsBySlug(
  funds: Fund[],
): Promise<Record<string, PoolTotalEntry>> {
  return Object.fromEntries(
    await Promise.all(
      funds.map(async (fund) => {
        const performance = await computeFundPoolPerformance(fund);
        return [
          fund.slug,
          {
            deposited: performance?.depositedUsdc ?? 0,
            profitUsdc: performance?.profitUsdc ?? null,
            roiPct: performance?.roi ?? null,
          },
        ] as const;
      }),
    ),
  );
}

/** Committed capital per fund slug (sum of mandate notionals). */
export async function computeDepositedByFundSlug(
  funds: Fund[],
): Promise<Record<string, number>> {
  return Object.fromEntries(
    await Promise.all(
      funds.map(async (fund) => {
        const mandates = await listMandatesByFund(fund.slug);
        return [fund.slug, round(totalPoolDeposited(mandates), 2)] as const;
      }),
    ),
  );
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
