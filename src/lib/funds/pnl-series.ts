import type { MandateTrade } from "@/lib/funds/types";

export type PnlPoint = {
  t: number;
  pnl: number;
  iso: string;
};

export type PnlRange = "1D" | "1W" | "1M" | "1Y" | "YTD" | "All";

export const PNL_RANGES: PnlRange[] = ["1D", "1W", "1M", "1Y", "YTD", "All"];

export const PNL_RANGE_LABELS: Record<PnlRange, string> = {
  "1D": "Past day",
  "1W": "Past week",
  "1M": "Past month",
  "1Y": "Past year",
  YTD: "Year to date",
  All: "All time",
};

const DAY = 86_400_000;

const RANGE_MS: Record<Exclude<PnlRange, "All" | "YTD">, number> = {
  "1D": DAY,
  "1W": 7 * DAY,
  "1M": 30 * DAY,
  "1Y": 365 * DAY,
};

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function tradeTime(trade: MandateTrade): number {
  return new Date(trade.filledAt ?? trade.createdAt).getTime();
}

function rangeCutoff(range: Exclude<PnlRange, "All">): number {
  if (range === "YTD") {
    const start = new Date();
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  return Date.now() - RANGE_MS[range];
}

type Lot = { shares: number; costUsdc: number };

/**
 * Realized PnL locked in at a fill. Buys open lots (0). Sells consume FIFO cost.
 * Never uses live marks — those belong only on the series tip.
 */
export function realizedPnlAtFill(
  trade: MandateTrade,
  lotsByToken: Map<string, Lot[]>,
): number {
  if (trade.status !== "filled") return 0;
  const orderSide = trade.orderSide ?? "BUY";
  const lots = lotsByToken.get(trade.tokenId) ?? [];
  if (!lotsByToken.has(trade.tokenId)) lotsByToken.set(trade.tokenId, lots);

  if (orderSide !== "SELL") {
    lots.push({ shares: trade.shares, costUsdc: trade.usdcAmount });
    return 0;
  }

  let remaining = trade.shares;
  let cost = 0;
  while (remaining > 1e-9 && lots.length > 0) {
    const lot = lots[0]!;
    const take = Math.min(lot.shares, remaining);
    const frac = lot.shares > 0 ? take / lot.shares : 0;
    cost += lot.costUsdc * frac;
    lot.shares = round(lot.shares - take, 6);
    lot.costUsdc = round(lot.costUsdc * (1 - frac), 6);
    remaining = round(remaining - take, 6);
    if (lot.shares <= 1e-9) lots.shift();
  }
  return round(trade.usdcAmount - cost, 2);
}

/**
 * Pool PnL series: cumulative realized at fills, hold-forward, tip = current mark.
 *
 * Do not plot live MTM on historical fill timestamps — that invents moving peaks.
 * Tip uses currentPnl (fund-list Σ) when provided, else Σ trade.pnlUsdc.
 */
export function buildPnlSeries(
  trades: MandateTrade[],
  fundCreatedAt?: string,
  currentPnl?: number | null,
): PnlPoint[] {
  const filled = trades
    .filter((trade) => trade.status === "filled")
    .sort((a, b) => tradeTime(a) - tradeTime(b));

  if (filled.length === 0) return [];

  const originMs = fundCreatedAt
    ? new Date(fundCreatedAt).getTime()
    : tradeTime(filled[0]!) - DAY;

  const points: PnlPoint[] = [
    {
      t: Number.isFinite(originMs) ? originMs : tradeTime(filled[0]!) - DAY,
      pnl: 0,
      iso: fundCreatedAt ?? filled[0]!.createdAt,
    },
  ];

  const lotsByToken = new Map<string, Lot[]>();
  let realized = 0;
  for (const trade of filled) {
    realized = round(realized + realizedPnlAtFill(trade, lotsByToken), 2);
    const t = tradeTime(trade);
    const last = points[points.length - 1]!;
    if (last.t === t) {
      points[points.length - 1] = {
        t,
        pnl: realized,
        iso: trade.filledAt ?? trade.createdAt,
      };
    } else {
      points.push({
        t,
        pnl: realized,
        iso: trade.filledAt ?? trade.createdAt,
      });
    }
  }

  const marked =
    currentPnl != null && Number.isFinite(currentPnl)
      ? round(currentPnl, 2)
      : round(
          filled.reduce((sum, trade) => sum + (trade.pnlUsdc ?? 0), 0),
          2,
        );

  // Hold last realized level, then tip at now with current fund mark (open MTM).
  const last = points[points.length - 1]!;
  const now = Date.now();
  if (now - last.t > 1_000 || Math.abs(marked - last.pnl) > 1e-9) {
    if (now - last.t > 1_000 && Math.abs(marked - last.pnl) > 1e-9) {
      // Keep a flat realized plateau until "now", then the mark tip.
      points.push({
        t: now - 1,
        pnl: realized,
        iso: last.iso,
      });
    }
    points.push({
      t: now,
      pnl: marked,
      iso: new Date(now).toISOString(),
    });
  }

  return points;
}

function withRangeEnd(points: PnlPoint[], now = Date.now()): PnlPoint[] {
  if (points.length === 0) return points;
  const last = points[points.length - 1]!;
  if (now - last.t <= 1_000) return points;
  return [
    ...points,
    { t: now, pnl: last.pnl, iso: new Date(now).toISOString() },
  ];
}

export function filterPnlSeries(
  points: PnlPoint[],
  range: PnlRange,
): PnlPoint[] {
  if (range === "All" || points.length === 0) return points;

  const cutoff = rangeCutoff(range);
  const now = Date.now();
  const inRange = points.filter((point) => point.t >= cutoff && point.t <= now);
  if (inRange.length === 0) {
    const prior = [...points].reverse().find((point) => point.t <= cutoff);
    if (!prior) return withRangeEnd(points.slice(-2), now);
    return withRangeEnd(
      [
        { ...prior, t: cutoff },
        { t: now, pnl: prior.pnl, iso: new Date(now).toISOString() },
      ],
      now,
    );
  }

  const first = inRange[0]!;
  if (first.t > cutoff) {
    const prior = [...points].reverse().find((point) => point.t <= cutoff);
    const start: PnlPoint = prior ?? { t: cutoff, pnl: first.pnl, iso: first.iso };
    return withRangeEnd([{ ...start, t: cutoff }, ...inRange], now);
  }

  return withRangeEnd(inRange, now);
}

export function defaultPnlRange(points: PnlPoint[]): PnlRange {
  if (points.length < 2) return "All";
  const span = points[points.length - 1]!.t - points[0]!.t;
  if (span <= RANGE_MS["1D"]) return "1D";
  if (span <= RANGE_MS["1W"]) return "1W";
  if (span <= RANGE_MS["1M"]) return "1M";
  if (span <= RANGE_MS["1Y"]) return "1Y";
  return "All";
}

// ponytail: PNL_SERIES_SELFCHECK=1 node --experimental-strip-types --experimental-transform-types src/lib/funds/pnl-series.ts
if (process.env.PNL_SERIES_SELFCHECK === "1") {
  const buy: MandateTrade = {
    id: "b1",
    mandateId: "m1",
    instructionId: "i1",
    fundSlug: "demo",
    investorWallet: "0x1",
    tokenId: "tok",
    question: "q",
    side: "YES",
    orderSide: "BUY",
    usdcAmount: 40,
    price: 0.4,
    shares: 100,
    status: "filled",
    createdAt: "2026-07-20T12:00:00.000Z",
    filledAt: "2026-07-20T12:00:00.000Z",
    // Live mark would invent +$291 on the fill day if plotted historically.
    pnlUsdc: 291.37,
  };
  const series = buildPnlSeries([buy], "2026-07-01T00:00:00.000Z", 291.37);
  const jul20 = series.find((p) => p.iso.startsWith("2026-07-20"));
  const tip = series[series.length - 1]!;
  console.assert(jul20?.pnl === 0, `expected 0 at buy fill, got ${jul20?.pnl}`);
  console.assert(tip.pnl === 291.37, `expected tip mark 291.37, got ${tip.pnl}`);
  console.assert(
    !series.some(
      (p) => p.iso.startsWith("2026-07-20") && Math.abs(p.pnl - 291.37) < 1e-9,
    ),
    "live MTM must not sit on the fill timestamp",
  );
  console.log("pnl-series self-check ok");
}
