import { listInstructionsByFund } from "@/lib/funds/instructions";
import { reconcileFundMandates } from "@/lib/funds/mandate-reconcile";
import { listPositionsByFund } from "@/lib/funds/mandate-positions";
import { listTradesByFund } from "@/lib/funds/mandate-trades";
import { runRedemptionsForFund } from "@/lib/funds/redeem-positions";
import { totalPoolCash, totalPoolNotional } from "@/lib/funds/fanout";
import type { Fund, Mandate, VirtualPool } from "@/lib/funds/types";
import { serverSigningEnabled } from "@/lib/privy/server";

export async function buildVirtualPool(fund: Fund): Promise<VirtualPool> {
  if (serverSigningEnabled()) {
    try {
      await runRedemptionsForFund(fund.slug);
    } catch {
      /* best-effort — pool read must not fail */
    }
  }

  const mandates = await reconcileFundMandates(fund.slug);
  const [instructions, trades, positions] = await Promise.all([
    listInstructionsByFund(fund.slug),
    listTradesByFund(fund.slug),
    listPositionsByFund(fund.slug),
  ]);

  return {
    fundSlug: fund.slug,
    totalNotional: totalPoolNotional(mandates),
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
    recentInstructions: pool.recentInstructions,
    recentTrades: pool.recentTrades.filter(
      (t) => t.investorWallet === normalized,
    ),
  };
}

export function maskMandateWallet(mandate: Mandate): Mandate {
  const w = mandate.investorWallet;
  const masked =
    w.length > 10 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
  return { ...mandate, investorWallet: masked };
}

export function poolRaiseOpen(fund: Fund): boolean {
  if (fund.status === "closed") return false;
  if (!fund.raiseEndsAt) return true;
  return Date.parse(fund.raiseEndsAt) >= Date.now();
}

export function poolTradingOpen(fund: Fund): boolean {
  if (fund.status === "closed") return false;
  if (!fund.tradingEndsAt) return true;
  return Date.parse(fund.tradingEndsAt) >= Date.now();
}

export function poolCapRemaining(fund: Fund, totalNotional: number): number | null {
  if (fund.capUsdc == null || fund.capUsdc <= 0) return null;
  return Math.max(0, round(fund.capUsdc - totalNotional, 2));
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
