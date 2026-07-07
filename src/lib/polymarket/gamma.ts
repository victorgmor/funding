import type { Fund, MarketPosition } from "@/lib/funds/types";
import { fetchErrorMessage } from "@/lib/fetch-error";
import { fetchTokenPriceAt } from "@/lib/polymarket/prices";

/** Parse gamma `clobTokenIds` + outcomes to get YES/NO token ids */
export function tokenIdForSide(
  clobTokenIds: string,
  outcomes: string,
  side: "yes" | "no",
): string {
  const tokens = JSON.parse(clobTokenIds) as string[];
  const labels = JSON.parse(outcomes) as string[];
  const idx = labels.findIndex((o) => o.toLowerCase() === side);
  if (idx === -1) throw new Error(`Side ${side} not in outcomes`);
  return tokens[idx]!;
}

export function marketFromGamma(
  gamma: {
    id: string;
    question: string;
    conditionId: string;
    clobTokenIds: string;
    outcomes: string;
  },
  side: "yes" | "no",
  weight: number,
): MarketPosition {
  return {
    gammaMarketId: gamma.id,
    conditionId: gamma.conditionId,
    tokenId: tokenIdForSide(gamma.clobTokenIds, gamma.outcomes, side),
    question: gamma.question,
    side,
    weight,
  };
}

export type SearchMarket = {
  gammaMarketId: string;
  question: string;
  conditionId: string;
  clobTokenIds: string;
  outcomes: string;
};

export async function searchPolymarketMarkets(
  query: string,
  limit = 20,
): Promise<SearchMarket[]> {
  const params = new URLSearchParams({
    q: query,
    limit_per_type: String(limit),
    search_tags: "false",
    search_profiles: "false",
  });
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/public-search?${params}`,
    );
    if (!res.ok) throw new Error("Polymarket search failed");

    const data = (await res.json()) as {
      events?: Array<{
        markets?: Array<{
          id: string;
          question: string;
          conditionId: string;
          clobTokenIds?: string;
          outcomes: string;
          active?: boolean;
          closed?: boolean;
        }>;
      }>;
    };

    const seen = new Set<string>();
    const markets: SearchMarket[] = [];

    for (const event of data.events ?? []) {
      for (const market of event.markets ?? []) {
        if (!market.active || market.closed || !market.clobTokenIds) continue;
        if (seen.has(market.id)) continue;
        seen.add(market.id);
        markets.push({
          gammaMarketId: market.id,
          question: market.question,
          conditionId: market.conditionId,
          clobTokenIds: market.clobTokenIds,
          outcomes: market.outcomes,
        });
        if (markets.length >= limit) return markets;
      }
    }

    return markets;
  } catch (error) {
    throw new Error(fetchErrorMessage(error, "Polymarket search failed"));
  }
}

export type GammaMarket = {
  id: string;
  question: string;
  conditionId: string;
  clobTokenIds: string;
  outcomes: string;
  outcomePrices: string;
  bestBid?: number;
  bestAsk?: number;
  orderMinSize?: number;
  acceptingOrders?: boolean;
};

export async function fetchGammaMarket(id: string): Promise<GammaMarket> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/markets/${id}`);
    if (!res.ok) throw new Error(`Gamma market ${id} not found`);
    return res.json();
  } catch (error) {
    throw new Error(
      fetchErrorMessage(error, "Polymarket market data unavailable"),
    );
  }
}

export async function enrichFundMarkets(fund: Fund): Promise<Fund> {
  const markets = await Promise.all(
    fund.markets.map(async (m) => {
      if (m.tokenId) return m;
      const gamma = await fetchGammaMarket(m.gammaMarketId);
      return marketFromGamma(gamma, m.side, m.weight);
    }),
  );
  return { ...fund, markets };
}

export function midPrice(gamma: GammaMarket, side: "yes" | "no"): number {
  const prices = JSON.parse(gamma.outcomePrices) as string[];
  const outcomes = JSON.parse(gamma.outcomes) as string[];
  const idx = outcomes.findIndex((o) => o.toLowerCase() === side);
  const fromGamma = parseFloat(prices[idx] ?? "0.5");

  if (gamma.bestBid != null && gamma.bestAsk != null) {
    const mid = (gamma.bestBid + gamma.bestAsk) / 2;
    if (side === "yes") return mid;
    return Math.max(0.01, Math.min(0.99, 1 - mid));
  }

  return fromGamma || 0.5;
}

export type LiveMarket = {
  gammaMarketId: string;
  question: string;
  side: "yes" | "no";
  weight: number;
  price: number;
  bestBid?: number;
  bestAsk?: number;
  acceptingOrders?: boolean;
};

export async function fetchLiveMarkets(
  markets: MarketPosition[],
): Promise<LiveMarket[]> {
  return Promise.all(
    markets.map(async (market) => {
      const gamma = await fetchGammaMarket(market.gammaMarketId);
      return {
        gammaMarketId: market.gammaMarketId,
        question: gamma.question || market.question,
        side: market.side,
        weight: market.weight,
        price: midPrice(gamma, market.side),
        bestBid: gamma.bestBid,
        bestAsk: gamma.bestAsk,
        acceptingOrders: gamma.acceptingOrders,
      };
    }),
  );
}

export async function captureCreationPrices(
  markets: MarketPosition[],
  createdAt: Date,
): Promise<MarketPosition[]> {
  return Promise.all(
    markets.map(async (market) => {
      if (market.entryPrice != null && market.entryPrice > 0) return market;

      const historical = await fetchTokenPriceAt(market.tokenId, createdAt);
      if (historical != null && historical > 0) {
        return { ...market, entryPrice: historical };
      }

      const gamma = await fetchGammaMarket(market.gammaMarketId);
      return {
        ...market,
        entryPrice: midPrice(gamma, market.side),
      };
    }),
  );
}

/** @deprecated use captureCreationPrices */
export async function captureEntryPrices(
  markets: MarketPosition[],
): Promise<MarketPosition[]> {
  return captureCreationPrices(markets, new Date());
}
