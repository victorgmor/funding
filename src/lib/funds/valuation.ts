import { fetchMarkPriceByTokenId } from "@/lib/polymarket/gamma";
import { getTradingSession } from "@/lib/funds/trading-sessions";
import { isDepositWalletDeployed } from "@/lib/polymarket/depositWallet";
import { deriveDepositWalletAddress } from "@/lib/polymarket/positions";
import type { Mandate, MandatePosition } from "@/lib/funds/types";
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
): Promise<Map<string, number>> {
  const unique = [...new Set(positions.map((pos) => pos.tokenId))];
  const prices = new Map<string, number>();
  if (unique.length === 0) return prices;

  const depositsByToken = new Map<string, string[]>();
  for (const pos of positions) {
    const deposit = depositByInvestor?.get(pos.investorWallet.toLowerCase());
    if (!deposit) continue;
    const list = depositsByToken.get(pos.tokenId) ?? [];
    if (!list.includes(deposit)) list.push(deposit);
    depositsByToken.set(pos.tokenId, list);
  }

  await Promise.all(
    unique.map(async (tokenId) => {
      for (const depositAddress of depositsByToken.get(tokenId) ?? []) {
        const price = await fetchMarkPriceByTokenId(tokenId, { depositAddress });
        if (price != null) {
          prices.set(tokenId, price);
          return;
        }
      }

      const price = await fetchMarkPriceByTokenId(tokenId);
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

export function mandateMarkValue(
  mandate: Mandate,
  positions: MandatePosition[],
  valuations: Map<string, number>,
): number {
  const positionsValue = positions
    .filter((pos) => pos.mandateId === mandate.id)
    .reduce((sum, pos) => sum + positionMarkValue(pos, valuations), 0);
  return round(mandate.cashUsdc + positionsValue, 2);
}
