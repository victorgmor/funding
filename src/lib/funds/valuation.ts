import { fetchMarkPriceByTokenId } from "@/lib/polymarket/gamma";
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

function filledTradesByToken(
  trades: MandateTrade[],
  mandateId: string,
): Map<string, { shares: number; costUsdc: number }> {
  const map = new Map<string, { shares: number; costUsdc: number }>();
  for (const trade of trades) {
    if (trade.mandateId !== mandateId || trade.status !== "filled") continue;
    const current = map.get(trade.tokenId) ?? { shares: 0, costUsdc: 0 };
    current.shares = round(current.shares + trade.shares, 4);
    current.costUsdc = round(current.costUsdc + trade.usdcAmount, 2);
    map.set(trade.tokenId, current);
  }
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

  await Promise.all(
    [...unique].map(async (tokenId) => {
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
  if (price == null) return position.costUsdc;
  return round(position.shares * price, 2);
}

/** Realized/unrealized PnL from filled trades whose tokens are no longer open. */
function closedTradePnl(
  filledByToken: Map<string, { shares: number; costUsdc: number }>,
  openTokens: Set<string>,
  valuations: Map<string, number>,
): number {
  let pnl = 0;
  for (const [tokenId, agg] of filledByToken) {
    if (openTokens.has(tokenId)) continue;
    const price = valuations.get(tokenId);
    if (price == null) continue;
    pnl += round(agg.shares * price - agg.costUsdc, 2);
  }
  return pnl;
}

export function mandateMarkValue(
  mandate: Mandate,
  positions: MandatePosition[],
  valuations: Map<string, number>,
  filledTrades: MandateTrade[] = [],
): number {
  const mandateOpen = positions.filter(
    (pos) =>
      pos.mandateId === mandate.id && !pos.redeemedAt && pos.shares > 0,
  );
  const openTokens = new Set(mandateOpen.map((pos) => pos.tokenId));
  const openValue = mandateOpen.reduce(
    (sum, pos) => sum + positionMarkValue(pos, valuations),
    0,
  );

  const filledByToken = filledTradesByToken(filledTrades, mandate.id);
  const realizedPnl = closedTradePnl(filledByToken, openTokens, valuations);

  return round(mandate.cashUsdc + openValue + realizedPnl, 2);
}
