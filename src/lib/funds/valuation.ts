import {
  fetchMarkPriceByTokenId,
  warmGammaMarketsByTokenIds,
} from "@/lib/polymarket/gamma";
import { getTradingSession } from "@/lib/funds/trading-sessions";
import { isDepositWalletDeployed } from "@/lib/polymarket/depositWallet";
import { deriveDepositWalletAddress } from "@/lib/polymarket/positions";
import type { Mandate, MandatePosition, MandateTrade } from "@/lib/funds/types";
import type { Address } from "viem";

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Deposit wallet per investor — session first, then on-chain derivation. */
export async function resolveDepositAddresses(
  fundSlug: string,
  investors: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(investors.map((w) => w.toLowerCase()))];

  await Promise.all(
    unique.map(async (wallet) => {
      const session = await getTradingSession(fundSlug, wallet);
      if (session?.depositAddress) {
        map.set(wallet, session.depositAddress.toLowerCase());
        return;
      }

      const derived = await deriveDepositWalletAddress(wallet as Address);
      if (await isDepositWalletDeployed(derived)) {
        map.set(wallet, derived.toLowerCase());
      }
    }),
  );

  return map;
}

/** Mark-to-market price per outcome token ($/share). */
export async function fetchTokenValuations(
  positions: MandatePosition[],
  depositByInvestor?: Map<string, string>,
  filledTrades: MandateTrade[] = [],
): Promise<Map<string, number>> {
  const unique = new Set([
    ...positions.map((pos) => pos.tokenId),
    ...filledTrades
      .filter((trade) => trade.status === "filled")
      .map((trade) => trade.tokenId),
  ]);
  const prices = new Map<string, number>();
  if (unique.size === 0) return prices;

  const metaByToken = new Map<string, { question: string; side: string }>();
  for (const pos of positions) {
    metaByToken.set(pos.tokenId, {
      question: pos.question,
      side: pos.side,
    });
  }
  for (const trade of filledTrades) {
    if (trade.status !== "filled") continue;
    if (!metaByToken.has(trade.tokenId)) {
      metaByToken.set(trade.tokenId, {
        question: trade.question,
        side: trade.side,
      });
    }
  }

  const depositsByToken = new Map<string, string[]>();
  for (const pos of positions) {
    const deposit = depositByInvestor?.get(pos.investorWallet.toLowerCase());
    if (!deposit) continue;
    const list = depositsByToken.get(pos.tokenId) ?? [];
    if (!list.includes(deposit)) list.push(deposit);
    depositsByToken.set(pos.tokenId, list);
  }
  for (const trade of filledTrades) {
    if (trade.status !== "filled") continue;
    const deposit = depositByInvestor?.get(trade.investorWallet.toLowerCase());
    if (!deposit) continue;
    const list = depositsByToken.get(trade.tokenId) ?? [];
    if (!list.includes(deposit)) list.push(deposit);
    depositsByToken.set(trade.tokenId, list);
  }

  const tokenIds = [...unique];
  await warmGammaMarketsByTokenIds(tokenIds);

  await Promise.all(
    tokenIds.map(async (tokenId) => {
      const meta = metaByToken.get(tokenId);
      for (const depositAddress of depositsByToken.get(tokenId) ?? []) {
        const price = await fetchMarkPriceByTokenId(tokenId, {
          depositAddress,
          question: meta?.question,
          side: meta?.side,
        });
        if (price != null) {
          prices.set(tokenId, price);
          return;
        }
      }

      const price = await fetchMarkPriceByTokenId(tokenId, {
        question: meta?.question,
        side: meta?.side,
      });
      if (price != null) prices.set(tokenId, price);
    }),
  );

  return prices;
}

export function positionMarkValue(
  position: MandatePosition,
  valuations: Map<string, number>,
): number {
  const price = valuations.get(position.tokenId);
  // Unknown mark → 0, not cost. Cost fallback hid losses on resolved markets.
  if (price == null) return 0;
  return round(position.shares * price, 2);
}

export function mandateMarkValue(
  mandate: Mandate,
  positions: MandatePosition[],
  valuations: Map<string, number>,
  _filledTrades: MandateTrade[] = [],
): number {
  void _filledTrades;
  const openValue = positions
    .filter(
      (pos) =>
        pos.mandateId === mandate.id && !pos.redeemedAt && pos.shares > 0,
    )
    .reduce((sum, pos) => sum + positionMarkValue(pos, valuations), 0);

  // Cash already reflects buys/redeems — do not add closed-trade PnL on top.
  return round(mandate.cashUsdc + openValue, 2);
}

/** Per-trade PnL from current/settlement price when available. */
export function tradePnlUsdc(
  trade: MandateTrade,
  valuations: Map<string, number>,
): number | null {
  if (trade.status === "failed") return 0;
  if (trade.status !== "filled") return null;
  const price = valuations.get(trade.tokenId);
  if (price == null) return null;
  return round(trade.shares * price - trade.usdcAmount, 2);
}

export async function enrichTradesWithPnl(
  fundSlug: string,
  trades: MandateTrade[],
  positions: MandatePosition[],
): Promise<MandateTrade[]> {
  const filled = trades.filter((trade) => trade.status === "filled");
  if (filled.length === 0) {
    return trades.map((trade) => ({
      ...trade,
      pnlUsdc: trade.status === "failed" ? 0 : null,
    }));
  }

  const depositByInvestor = await resolveDepositAddresses(fundSlug, [
    ...filled.map((trade) => trade.investorWallet),
    ...positions.map((pos) => pos.investorWallet),
  ]);
  const valuations = await fetchTokenValuations(
    positions,
    depositByInvestor,
    filled,
  );

  return trades.map((trade) => ({
    ...trade,
    pnlUsdc: tradePnlUsdc(trade, valuations),
  }));
}
