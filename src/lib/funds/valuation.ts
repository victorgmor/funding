import { fetchMarketByTokenId } from "@/lib/polymarket/gamma";
import { fetchTokenMidPrices } from "@/lib/polymarket/clob-prices";
import type { Mandate, MandatePosition } from "@/lib/funds/types";

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Mark-to-market price per outcome token ($/share). */
export async function fetchTokenValuations(
  positions: MandatePosition[],
  depositAddress?: string,
): Promise<Map<string, number>> {
  const unique = [...new Set(positions.map((pos) => pos.tokenId))];
  const prices = new Map<string, number>();
  if (unique.length === 0) return prices;

  const mids = await fetchTokenMidPrices(unique);
  const marketOpts = depositAddress ? { depositAddress } : undefined;

  await Promise.all(
    unique.map(async (tokenId) => {
      const market = await fetchMarketByTokenId(tokenId, marketOpts);
      if (market?.resolved && market.settlementPrice != null) {
        prices.set(tokenId, market.settlementPrice);
        return;
      }
      const mid = mids.get(tokenId);
      if (mid != null) prices.set(tokenId, mid);
    }),
  );

  return prices;
}

export function positionMarkValue(
  position: MandatePosition,
  valuations: Map<string, number>,
): number {
  const price = valuations.get(position.tokenId) ?? position.avgPrice;
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
