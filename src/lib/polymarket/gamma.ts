import { fetchErrorMessage } from "@/lib/fetch-error";

/** Parse gamma `outcomes` JSON to outcome labels (e.g. Yes/No, Up/Down). */
export function parseOutcomes(outcomes: string): string[] {
  return JSON.parse(outcomes) as string[];
}

export function outcomeIndex(outcomes: string[], label: string): number {
  return outcomes.findIndex((o) => o.toLowerCase() === label.toLowerCase());
}

/** Resolve CLOB token id for an outcome label. */
export function tokenIdForSide(
  clobTokenIds: string,
  outcomes: string,
  side: string,
): string {
  const tokens = JSON.parse(clobTokenIds) as string[];
  const labels = parseOutcomes(outcomes);
  const idx = outcomeIndex(labels, side);
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
  outcomePrices?: string;
  active?: boolean;
  closed?: boolean;
  negRisk?: boolean;
  umaResolutionStatus?: string;
  umaResolutionStatuses?: string;
};

type DataApiPosition = {
  asset: string;
  conditionId: string;
  redeemable?: boolean;
  curPrice?: number;
  negativeRisk?: boolean;
};

type ClobMarket = {
  condition_id: string;
  neg_risk: boolean;
  closed: boolean;
  tokens?: Array<{
    token_id: string;
    price: number;
    winner: boolean;
  }>;
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

export function midPrice(gamma: GammaMarket, side: string): number {
  const prices = JSON.parse(gamma.outcomePrices) as string[];
  const outcomes = parseOutcomes(gamma.outcomes);
  const idx = outcomeIndex(outcomes, side);
  if (idx === -1) throw new Error(`Side ${side} not in outcomes`);

  const fromGamma = parseFloat(prices[idx] ?? "0.5");
  if (fromGamma > 0 && fromGamma < 1) return fromGamma;

  if (gamma.bestBid != null && gamma.bestAsk != null && outcomes.length === 2) {
    const mid = (gamma.bestBid + gamma.bestAsk) / 2;
    if (idx === 0) return mid;
    return Math.max(0.01, Math.min(0.99, 1 - mid));
  }

  return fromGamma || 0.5;
}

export type ResolvedMarketMeta = {
  conditionId: `0x${string}`;
  negRisk: boolean;
  resolved: boolean;
  /** $/share payout when resolved (0 or 1 for binary markets). */
  settlementPrice?: number;
};

export function isMarketResolved(market: GammaMarketRow): boolean {
  try {
    const prices = (JSON.parse(market.outcomePrices ?? "[]") as string[]).map(
      (price) => parseFloat(price),
    );
    if (prices.length >= 2) {
      const max = Math.max(...prices);
      const min = Math.min(...prices);
      // Decisive outcome prices — redeemable even before Gamma marks closed.
      if (max >= 0.95 && min <= 0.05) return true;
    }
  } catch {
    /* ignore */
  }

  if (/resolved/i.test(market.umaResolutionStatus ?? "")) return true;

  if (!market.closed) return false;

  try {
    const statuses = JSON.parse(market.umaResolutionStatuses ?? "[]") as string[];
    if (statuses.some((status) => /resolved/i.test(status))) return true;
  } catch {
    /* ignore */
  }

  return false;
}

function settlementPriceForToken(
  market: GammaMarketRow,
  tokenId: string,
): number | undefined {
  try {
    const tokens = JSON.parse(market.clobTokenIds ?? "[]") as string[];
    const prices = JSON.parse(market.outcomePrices ?? "[]") as string[];
    const idx = tokens.indexOf(tokenId);
    if (idx === -1) return undefined;
    const price = parseFloat(prices[idx] ?? "");
    if (!Number.isFinite(price)) return undefined;
    return Math.max(0, Math.min(1, price));
  } catch {
    return undefined;
  }
}

async function fetchGammaMarketByTokenId(
  tokenId: string,
): Promise<ResolvedMarketMeta | null> {
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/markets?clob_token_ids=${encodeURIComponent(tokenId)}`,
    );
    if (!res.ok) return null;

    const rows = (await res.json()) as GammaMarketRow[];
    const market = rows[0];
    if (!market?.conditionId) return null;

    const conditionId = market.conditionId.startsWith("0x")
      ? market.conditionId
      : `0x${market.conditionId}`;

    const resolved = isMarketResolved(market);

    return {
      conditionId: conditionId as `0x${string}`,
      negRisk: market.negRisk === true,
      resolved,
      settlementPrice: resolved
        ? settlementPriceForToken(market, tokenId)
        : undefined,
    };
  } catch {
    return null;
  }
}

async function fetchDataApiPosition(
  depositAddress: string,
  tokenId: string,
): Promise<DataApiPosition | null> {
  try {
    const res = await fetch(
      `https://data-api.polymarket.com/positions?user=${depositAddress.toLowerCase()}`,
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as DataApiPosition[];
    return rows.find((row) => row.asset === tokenId) ?? null;
  } catch {
    return null;
  }
}

async function fetchClobMarket(conditionId: string): Promise<ClobMarket | null> {
  try {
    const id = conditionId.startsWith("0x") ? conditionId : `0x${conditionId}`;
    const res = await fetch(`https://clob.polymarket.com/markets/${id}`);
    if (!res.ok) return null;
    return res.json() as Promise<ClobMarket>;
  } catch {
    return null;
  }
}

function metaFromClobMarket(
  market: ClobMarket,
  tokenId: string,
): ResolvedMarketMeta {
  const conditionId = (
    market.condition_id.startsWith("0x")
      ? market.condition_id
      : `0x${market.condition_id}`
  ) as `0x${string}`;
  const token = market.tokens?.find((row) => row.token_id === tokenId);
  const settlementPrice =
    token != null ? Math.max(0, Math.min(1, token.price)) : undefined;

  const prices = market.tokens?.map((row) => row.price) ?? [];
  const resolved =
    token?.winner === true ||
    (prices.length >= 2 &&
      Math.max(...prices) >= 0.95 &&
      Math.min(...prices) <= 0.05) ||
    settlementPrice === 0 ||
    settlementPrice === 1;

  return {
    conditionId,
    negRisk: market.neg_risk === true,
    resolved,
    settlementPrice: resolved ? settlementPrice : undefined,
  };
}

/** Resolve market metadata for redemption / valuation (gamma → data-api → CLOB). */
export async function fetchMarketByTokenId(
  tokenId: string,
  opts?: { depositAddress?: string },
): Promise<ResolvedMarketMeta | null> {
  const gamma = await fetchGammaMarketByTokenId(tokenId);
  if (gamma?.resolved) return gamma;

  if (opts?.depositAddress) {
    const dataPos = await fetchDataApiPosition(opts.depositAddress, tokenId);
    if (dataPos?.conditionId) {
      const clob = await fetchClobMarket(dataPos.conditionId);
      if (clob) {
        const meta = metaFromClobMarket(clob, tokenId);
        if (meta.resolved) return meta;
      }

      if (dataPos.redeemable && dataPos.curPrice != null) {
        const conditionId = (
          dataPos.conditionId.startsWith("0x")
            ? dataPos.conditionId
            : `0x${dataPos.conditionId}`
        ) as `0x${string}`;
        return {
          conditionId,
          negRisk: dataPos.negativeRisk === true,
          resolved: true,
          settlementPrice: Math.max(0, Math.min(1, dataPos.curPrice)),
        };
      }
    }
  }

  return gamma;
}

/** Mark-to-market $/share — settlement price when resolved, else live mid. */
export async function fetchMarkPriceByTokenId(
  tokenId: string,
  opts?: { depositAddress?: string },
): Promise<number | null> {
  if (opts?.depositAddress) {
    const dataPos = await fetchDataApiPosition(opts.depositAddress, tokenId);
    if (dataPos?.curPrice != null && Number.isFinite(dataPos.curPrice)) {
      return Math.max(0, Math.min(1, dataPos.curPrice));
    }
  }

  const market = await fetchMarketByTokenId(tokenId, opts);
  if (market?.settlementPrice != null) {
    return market.settlementPrice;
  }

  const { fetchTokenMidPrice } = await import("@/lib/polymarket/clob-prices");
  return fetchTokenMidPrice(tokenId);
}
