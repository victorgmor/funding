import { createTtlCache } from "@/lib/cache/ttl";

export type PolymarketPosition = {
  asset: string;
  size?: number;
  avgPrice?: number;
  curPrice?: number;
  initialValue?: number;
  currentValue?: number;
  cashPnl?: number;
  realizedPnl?: number;
  redeemable?: boolean;
  conditionId?: string;
  negativeRisk?: boolean;
};

const TTL_MS = 5_000;
const positionsCache = createTtlCache<PolymarketPosition[]>(TTL_MS);
const valueCache = createTtlCache<number>(TTL_MS);

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Live positions for a Polymarket deposit/proxy wallet. */
export async function fetchPolymarketPositions(
  depositAddress: string,
): Promise<PolymarketPosition[]> {
  const key = depositAddress.toLowerCase();
  return positionsCache.getOrSet(key, async () => {
    try {
      const res = await fetch(
        `https://data-api.polymarket.com/positions?user=${encodeURIComponent(key)}`,
      );
      if (!res.ok) return [];
      const rows = (await res.json()) as PolymarketPosition[];
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  });
}

/** Mark-to-market value of all positions (excludes idle USDC). */
export async function fetchPolymarketPositionsValue(
  depositAddress: string,
): Promise<number> {
  const key = depositAddress.toLowerCase();
  return valueCache.getOrSet(key, async () => {
    try {
      const res = await fetch(
        `https://data-api.polymarket.com/value?user=${encodeURIComponent(key)}`,
      );
      if (!res.ok) return 0;
      const rows = (await res.json()) as Array<{ value?: number }>;
      const value = rows[0]?.value;
      return typeof value === "number" ? round(value, 2) : 0;
    } catch {
      return 0;
    }
  });
}

export function positionCostUsdc(pos: PolymarketPosition): number {
  if (typeof pos.initialValue === "number") return pos.initialValue;
  if (typeof pos.size === "number" && typeof pos.avgPrice === "number") {
    return pos.size * pos.avgPrice;
  }
  return 0;
}

export function positionMarkUsdc(pos: PolymarketPosition): number {
  if (typeof pos.currentValue === "number") return pos.currentValue;
  if (typeof pos.size === "number" && typeof pos.curPrice === "number") {
    return pos.size * pos.curPrice;
  }
  return 0;
}

export function positionPnlUsdc(pos: PolymarketPosition): number {
  if (typeof pos.cashPnl === "number") return pos.cashPnl;
  return round(positionMarkUsdc(pos) - positionCostUsdc(pos), 2);
}
