import type {
  BasketQuote,
  ExitQuote,
  Fund,
  FundInvestment,
  OrderLeg,
} from "@/lib/funds/types";
import { resolvePositionWallets } from "@/lib/polymarket/positions";
import { fetchGammaMarket, midPrice } from "@/lib/polymarket/gamma";
import type { Address } from "viem";

export async function buildBuyQuote(
  fund: Fund,
  totalUsdc: number,
): Promise<BasketQuote> {
  if (totalUsdc <= 0) throw new Error("Amount must be positive");
  if (fund.status === "closed") throw new Error("Fund is closed");

  const weightSum = fund.markets.reduce((s, m) => s + m.weight, 0);
  const legs: OrderLeg[] = [];

  for (const market of fund.markets) {
    const gamma = await fetchGammaMarket(market.gammaMarketId);
    const price = Math.min(0.99, Math.max(0.01, midPrice(gamma, market.side)));
    const usdcAmount = (totalUsdc * market.weight) / weightSum;
    const shares = usdcAmount / price;

    legs.push({
      tokenId: market.tokenId,
      question: market.question,
      side: market.side,
      usdcAmount: round(usdcAmount, 2),
      price: round(price, 4),
      shares: round(shares, 4),
      weight: market.weight,
    });
  }

  return { fundSlug: fund.slug, totalUsdc, legs };
}

export type UserPosition = {
  asset: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  initialValue: number;
};

export async function fetchUserPositions(
  address: string,
): Promise<UserPosition[]> {
  const url = `https://data-api.polymarket.com/positions?user=${address}&sizeThreshold=0`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    asset: string;
    size: number;
    avgPrice: number;
    currentValue: number;
    initialValue?: number;
  }>;
  return data
    .map((p) => {
      const size = Number(p.size);
      const avgPrice = Number(p.avgPrice);
      const currentValue = Number(p.currentValue);
      const initialValue = Number(p.initialValue ?? size * avgPrice);
      return {
        asset: normalizeTokenId(p.asset),
        size,
        avgPrice,
        currentValue,
        initialValue,
      };
    })
    .filter((p) => p.size > 0);
}

async function fetchAllUserPositions(owner: string): Promise<UserPosition[]> {
  const wallets = await resolvePositionWallets(owner as Address);
  const lists = await Promise.all(wallets.map((w) => fetchUserPositions(w)));
  const byToken = new Map<string, UserPosition>();

  for (const list of lists) {
    for (const pos of list) {
      const existing = byToken.get(pos.asset);
      if (!existing || pos.size > existing.size) {
        byToken.set(pos.asset, pos);
      }
    }
  }

  return [...byToken.values()];
}

function normalizeTokenId(id: string) {
  try {
    return BigInt(id).toString();
  } catch {
    return id;
  }
}

export async function buildExitQuote(
  fund: Fund,
  userAddress: string,
): Promise<ExitQuote> {
  const positions = await fetchAllUserPositions(userAddress);
  const byToken = new Map(positions.map((p) => [p.asset, p]));
  const legs = [];

  for (const market of fund.markets) {
    const tokenId = normalizeTokenId(market.tokenId);
    const pos = byToken.get(tokenId);
    if (!pos || pos.size <= 0) continue;
    legs.push({
      tokenId: market.tokenId,
      question: market.question,
      side: market.side,
      shares: round(pos.size, 4),
      estUsdc: round(pos.currentValue, 2),
    });
  }

  const totalEstUsdc = round(
    legs.reduce((s, l) => s + l.estUsdc, 0),
    2,
  );

  return { fundSlug: fund.slug, legs, totalEstUsdc };
}

export async function buildFundInvestment(
  fund: Fund,
  userAddress: string,
): Promise<FundInvestment> {
  const positions = await fetchAllUserPositions(userAddress);
  const byToken = new Map(positions.map((p) => [p.asset, p]));
  const legs = [];

  for (const market of fund.markets) {
    const tokenId = normalizeTokenId(market.tokenId);
    const pos = byToken.get(tokenId);
    if (!pos || pos.size <= 0) continue;
    legs.push({
      tokenId: market.tokenId,
      question: market.question,
      side: market.side,
      shares: round(pos.size, 4),
      investedUsdc: round(pos.initialValue, 2),
      currentUsdc: round(pos.currentValue, 2),
    });
  }

  const totalInvested = round(
    legs.reduce((s, l) => s + l.investedUsdc, 0),
    2,
  );
  const totalCurrent = round(
    legs.reduce((s, l) => s + l.currentUsdc, 0),
    2,
  );

  return { fundSlug: fund.slug, totalInvested, totalCurrent, legs };
}

export async function hasFundPositions(
  fund: Fund,
  userAddress: string,
): Promise<boolean> {
  const quote = await buildExitQuote(fund, userAddress);
  return quote.legs.length > 0;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
