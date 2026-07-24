import { createTtlCache } from "@/lib/cache/ttl";
import { knownCommitUsdc } from "@/lib/funds/live-mandate";
import { totalPoolDeposited } from "@/lib/funds/fanout";
import { listMandatesByFund } from "@/lib/funds/mandates";
import { listPositionsByFund } from "@/lib/funds/mandate-positions";
import { listTradesByFund } from "@/lib/funds/mandate-trades";
import { buildVirtualPool } from "@/lib/funds/pool";
import { enrichTradesWithPnl } from "@/lib/funds/valuation";
import type { Fund, Mandate } from "@/lib/funds/types";

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

/** External capital committed to this fund slug (any mandate status). */
function poolDepositedUsdc(mandates: Mandate[]): number {
  const fromField = round(
    mandates.reduce((sum, m) => sum + (m.depositedUsdc ?? 0), 0),
    2,
  );
  if (fromField > 0) return fromField;

  const fromKnown = round(
    mandates.reduce(
      (sum, m) => sum + (knownCommitUsdc(m.investorWallet) ?? 0),
      0,
    ),
    2,
  );
  if (fromKnown > 0) return fromKnown;

  return 0;
}

/**
 * Mark-to-market pool P&L for one fund slug.
 *
 * Boundary: profit = Σ pnl of this slug's recorded pool trades only.
 * Never wallet-wide Polymarket equity, never other funds on the same deposit
 * wallet, never external CLOB activity outside fund fan-out. Closed funds
 * with no pool trades → $0 (not live wallet marks).
 */
async function computeFundPoolPerformanceUncached(
  fund: Fund,
  prebuiltPool?: Awaited<ReturnType<typeof buildVirtualPool>>,
): Promise<FundPoolPerformance | null> {
  void prebuiltPool; // pool.totalNotional may be heal-poisoned — do not use it
  const mandates = await listMandatesByFund(fund.slug);
  const depositedUsdc = poolDepositedUsdc(mandates);
  if (depositedUsdc <= 0) return null;

  const [trades, positions] = await Promise.all([
    listTradesByFund(fund.slug),
    listPositionsByFund(fund.slug),
  ]);
  const enriched = await enrichTradesWithPnl(fund.slug, trades, positions);
  const profitUsdc = round(
    enriched.reduce((sum, trade) => sum + (trade.pnlUsdc ?? 0), 0),
    2,
  );
  const aumUsdc = round(depositedUsdc + profitUsdc, 2);
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
