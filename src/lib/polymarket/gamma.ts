import { fetchErrorMessage } from "@/lib/fetch-error";

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

export type SearchMarket = {
  gammaMarketId: string;
  question: string;
  conditionId: string;
  clobTokenIds: string;
  outcomes: string;
};

type GammaMarketRow = {
  id: string;
  question: string;
  conditionId: string;
  clobTokenIds?: string;
  outcomes: string;
  active?: boolean;
  closed?: boolean;
};

function toSearchMarket(market: GammaMarketRow): SearchMarket | null {
  if (!market.active || market.closed || !market.clobTokenIds) return null;
  return {
    gammaMarketId: market.id,
    question: market.question,
    conditionId: market.conditionId,
    clobTokenIds: market.clobTokenIds,
    outcomes: market.outcomes,
  };
}

/** Parse polymarket.com/event/… URLs (with optional market slug). */
export function parsePolymarketUrl(
  input: string,
): { eventSlug: string; marketSlug?: string } | null {
  const trimmed = input.trim();
  let path = trimmed;

  try {
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
      const url = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
      if (!url.hostname.replace(/^www\./, "").endsWith("polymarket.com")) {
        return null;
      }
      path = url.pathname;
    } else if (/^(?:www\.)?polymarket\.com\//i.test(trimmed)) {
      path = new URL(`https://${trimmed}`).pathname;
    }
  } catch {
    return null;
  }

  const match = path.match(/\/event\/([^/?#]+)(?:\/([^/?#]+))?/i);
  if (!match?.[1]) return null;
  return { eventSlug: match[1], marketSlug: match[2] };
}

async function fetchMarketsBySlug(slug: string): Promise<SearchMarket[]> {
  const res = await fetch(
    `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`,
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as GammaMarketRow[];
  return rows.map(toSearchMarket).filter((m): m is SearchMarket => m != null);
}

async function fetchEventMarkets(
  eventSlug: string,
  limit: number,
): Promise<SearchMarket[]> {
  const res = await fetch(
    `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(eventSlug)}`,
  );
  if (!res.ok) return [];

  const events = (await res.json()) as Array<{ markets?: GammaMarketRow[] }>;
  const markets: SearchMarket[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    for (const market of event.markets ?? []) {
      const row = toSearchMarket(market);
      if (!row || seen.has(row.gammaMarketId)) continue;
      seen.add(row.gammaMarketId);
      markets.push(row);
      if (markets.length >= limit) return markets;
    }
  }

  return markets;
}

export async function resolvePolymarketSearch(
  query: string,
  limit = 20,
): Promise<SearchMarket[]> {
  const parsed = parsePolymarketUrl(query);
  if (parsed) {
    if (parsed.marketSlug) {
      const markets = await fetchMarketsBySlug(parsed.marketSlug);
      if (markets.length) return markets.slice(0, limit);
    }
    if (parsed.eventSlug) {
      const markets = await fetchEventMarkets(parsed.eventSlug, limit);
      if (markets.length) return markets;
    }
  }

  return searchPolymarketMarkets(query, limit);
}

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
