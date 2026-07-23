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

/** Cumulative trade PnL over fill time (current marks per slice). */
export function buildPnlSeries(
  trades: MandateTrade[],
  fundCreatedAt?: string,
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

  let cumulative = 0;
  for (const trade of filled) {
    cumulative = round(cumulative + (trade.pnlUsdc ?? 0), 2);
    const t = tradeTime(trade);
    const last = points[points.length - 1]!;
    if (last.t === t) {
      points[points.length - 1] = {
        t,
        pnl: cumulative,
        iso: trade.filledAt ?? trade.createdAt,
      };
    } else {
      points.push({
        t,
        pnl: cumulative,
        iso: trade.filledAt ?? trade.createdAt,
      });
    }
  }

  // Hold last level to now so range windows keep a full time axis.
  // Ending on the last fill glues the step to the right edge (flat → cliff).
  const last = points[points.length - 1]!;
  const now = Date.now();
  if (now - last.t > 1_000) {
    points.push({
      t: now,
      pnl: cumulative,
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
