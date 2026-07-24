import { depositPhaseActive } from "@/lib/funds/lifecycle";
import { listInstructionsByFund } from "@/lib/funds/instructions";
import { reconcileFundMandates } from "@/lib/funds/mandate-reconcile";
import {
  filterTradablePositions,
  listPositionsByFund,
} from "@/lib/funds/mandate-positions";
import { listTradesByFund } from "@/lib/funds/mandate-trades";
import {
  totalPoolCash,
  totalPoolDeposited,
  totalPoolNotional,
} from "@/lib/funds/fanout";
import type { Fund, Mandate, VirtualPool } from "@/lib/funds/types";

export async function buildVirtualPool(fund: Fund): Promise<VirtualPool> {
  const mandates = await reconcileFundMandates(fund.slug);
  const [instructions, trades, rawPositions] = await Promise.all([
    listInstructionsByFund(fund.slug),
    listTradesByFund(fund.slug),
    listPositionsByFund(fund.slug),
  ]);
  // Positions tab only — History uses recentTrades; ledger keeps raw until redeem.
  const positions = await filterTradablePositions(rawPositions);

  return {
    fundSlug: fund.slug,
    totalNotional: totalPoolNotional(mandates),
    totalDeposited: totalPoolDeposited(mandates),
    totalCash: totalPoolCash(mandates),
    mandateCount: mandates.filter((m) => m.status === "active").length,
    mandates,
    recentInstructions: instructions.slice(0, 20),
    recentTrades: trades.slice(0, 50),
    positions: positions.slice(0, 100),
  };
}

export function redactPoolForInvestor(
  pool: VirtualPool,
  wallet: string,
): VirtualPool {
  const normalized = wallet.toLowerCase();
  const own = pool.mandates.filter(
    (m) => m.investorWallet === normalized,
  );

  return {
    ...pool,
    mandates: own,
    // recentTrades stay fund-wide — Performance chart is pool PnL, not one mandate.
  };
}

export function maskMandateWallet(mandate: Mandate): Mandate {
  const w = mandate.investorWallet;
  const masked =
    w.length > 10 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
  return { ...mandate, investorWallet: masked };
}

export function poolRaiseOpen(
  fund: Fund,
  totalNotional = 0,
  now = Date.now(),
): boolean {
  return depositPhaseActive(fund, totalNotional, now);
}

export function poolTradingOpen(
  fund: Fund,
  totalNotional = 0,
  now = Date.now(),
): boolean {
  if (fund.status === "closed" || fund.closedAt) return false;
  if (fund.tradingEndsAt && Date.parse(fund.tradingEndsAt) < now) return false;
  return !depositPhaseActive(fund, totalNotional, now);
}

export function poolCapRemaining(fund: Fund, totalNotional: number): number | null {
  if (fund.capUsdc == null || fund.capUsdc <= 0) return null;
  return Math.max(0, round(fund.capUsdc - totalNotional, 2));
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
