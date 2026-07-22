import { saveMandateRecord } from "@/lib/funds/mandates";
import { readDepositWalletBalanceUsdc } from "@/lib/polymarket/deposit-balance";
import {
  fetchPolymarketPositions,
  positionCostUsdc,
  positionMarkUsdc,
  positionPnlUsdc,
} from "@/lib/polymarket/portfolio";
import { tradePnlUsdc } from "@/lib/funds/valuation";
import type { Mandate, MandateTrade } from "@/lib/funds/types";
import type { Address } from "viem";

export type LiveMandateBooks = {
  depositedUsdc: number;
  deployableUsdc: number;
  profitUsdc: number;
  openCostUsdc: number;
  openValueUsdc: number;
  cashUsdc: number;
};

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/**
 * Live books from Polymarket positions + deposit-wallet USDC.
 * Does not trust Dynamo depositedUsdc (may be corrupted by old heals).
 *
 * deposited  = deployable − profit
 * deployable = open position marks + cash still attributable to this mandate
 * profit     = open cashPnl (Polymarket) + closed-trade PnL (our fills + marks)
 */
export async function liveMandateBooks(
  mandate: Mandate,
  filledTrades: MandateTrade[],
  depositAddress: string | undefined,
  valuations: Map<string, number>,
): Promise<LiveMandateBooks | null> {
  const mandateTrades = filledTrades.filter(
    (trade) => trade.mandateId === mandate.id && trade.status === "filled",
  );
  const tokenIds = new Set(mandateTrades.map((trade) => trade.tokenId));

  // Committed but not yet traded — trust the commit amount, not wallet balance.
  if (tokenIds.size === 0) {
    const deposited = round(
      mandate.depositedUsdc ?? mandate.notionalUsdc ?? 0,
      2,
    );
    if (deposited <= 0) return null;
    return {
      depositedUsdc: deposited,
      deployableUsdc: deposited,
      profitUsdc: 0,
      openCostUsdc: 0,
      openValueUsdc: 0,
      cashUsdc: deposited,
    };
  }

  let openCostUsdc = 0;
  let openValueUsdc = 0;
  let openPnlUsdc = 0;
  const openTokens = new Set<string>();

  if (depositAddress) {
    const positions = await fetchPolymarketPositions(depositAddress);
    for (const pos of positions) {
      if (!tokenIds.has(pos.asset)) continue;
      if ((pos.size ?? 0) <= 0 && !pos.redeemable) continue;
      openTokens.add(pos.asset);
      openCostUsdc = round(openCostUsdc + positionCostUsdc(pos), 2);
      openValueUsdc = round(openValueUsdc + positionMarkUsdc(pos), 2);
      openPnlUsdc = round(openPnlUsdc + positionPnlUsdc(pos), 2);
    }
  }

  let closedPnlUsdc = 0;
  for (const trade of mandateTrades) {
    if (openTokens.has(trade.tokenId)) continue;
    const pnl = tradePnlUsdc(trade, valuations);
    if (pnl != null) closedPnlUsdc = round(closedPnlUsdc + pnl, 2);
  }

  // Fallback when Polymarket has no rows yet: mark open trades ourselves.
  if (openTokens.size === 0) {
    for (const trade of mandateTrades) {
      const pnl = tradePnlUsdc(trade, valuations);
      if (pnl == null) continue;
      openPnlUsdc = round(openPnlUsdc + pnl, 2);
      openCostUsdc = round(openCostUsdc + trade.usdcAmount, 2);
      openValueUsdc = round(openValueUsdc + trade.usdcAmount + pnl, 2);
      openTokens.add(trade.tokenId);
    }
    closedPnlUsdc = 0;
  }

  const profitUsdc = round(openPnlUsdc + closedPnlUsdc, 2);
  const totalBought = round(
    mandateTrades.reduce((sum, trade) => sum + trade.usdcAmount, 0),
    2,
  );

  let liquidUsdc = 0;
  try {
    liquidUsdc = await readDepositWalletBalanceUsdc(
      mandate.investorWallet as Address,
    );
  } catch {
    liquidUsdc = 0;
  }

  // Only count wallet cash that this mandate's trades can explain
  // (avoids treating uncommitted deposit-wallet balances as mandate capital).
  const cashUsdc = round(
    Math.min(liquidUsdc, Math.max(0, totalBought + closedPnlUsdc - openCostUsdc)),
    2,
  );
  const deployableUsdc = round(Math.max(0, openValueUsdc + cashUsdc), 2);
  const depositedUsdc = round(Math.max(0, deployableUsdc - profitUsdc), 2);

  return {
    depositedUsdc,
    deployableUsdc,
    profitUsdc,
    openCostUsdc,
    openValueUsdc,
    cashUsdc,
  };
}

/** Persist live deposited/cash/notional so Dynamo stops serving corrupted books. */
export async function healMandateFromLive(
  mandate: Mandate,
  live: LiveMandateBooks,
): Promise<Mandate> {
  const next: Mandate = {
    ...mandate,
    depositedUsdc: live.depositedUsdc,
    // Notional tracks live deployable so fanout shares match marked capital.
    notionalUsdc: live.deployableUsdc,
    cashUsdc: live.cashUsdc,
    updatedAt: new Date().toISOString(),
  };

  if (
    next.depositedUsdc !== mandate.depositedUsdc ||
    next.notionalUsdc !== mandate.notionalUsdc ||
    Math.abs(next.cashUsdc - mandate.cashUsdc) >= 0.01
  ) {
    await saveMandateRecord(next);
  }

  return next;
}
