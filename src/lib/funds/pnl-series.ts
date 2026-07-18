import type { MandateTrade } from "@/lib/funds/types";

export type PnlPoint = {
  t: number;
  pnl: number;
  iso: string;
};

export type PnlRange = "1D" | "7D" | "30D" | "90D" | "All";

export const PNL_RANGES: PnlRange[] = ["1D", "7D", "30D", "90D", "All"];

const RANGE_MS: Record<Exclude<PnlRange, "All">, number> = {
  "1D": 86_400_000,
  "7D": 7 * 86_400_000,
  "30D": 30 * 86_400_000,
  "90D": 90 * 86_400_000,
};

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function tradeTime(trade: MandateTrade): number {
  return new Date(trade.filledAt ?? trade.createdAt).getTime();
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
    : tradeTime(filled[0]!) - 86_400_000;

  const points: PnlPoint[] = [
    {
      t: Number.isFinite(originMs) ? originMs : tradeTime(filled[0]!) - 86_400_000,
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

  const last = points[points.length - 1]!;
  if (Date.now() - last.t > 60_000) {
    points.push({
      t: Date.now(),
      pnl: cumulative,
      iso: new Date().toISOString(),
    });
  }

  return points;
}

export function filterPnlSeries(
  points: PnlPoint[],
  range: PnlRange,
): PnlPoint[] {
  if (range === "All" || points.length === 0) return points;

  const cutoff = Date.now() - RANGE_MS[range];
  const inRange = points.filter((point) => point.t >= cutoff);
  if (inRange.length === 0) return points.slice(-2);

  const first = inRange[0]!;
  if (first.t > cutoff) {
    const prior = [...points].reverse().find((point) => point.t <= cutoff);
    const start: PnlPoint = prior ?? { t: cutoff, pnl: first.pnl, iso: first.iso };
    return [{ ...start, t: cutoff }, ...inRange];
  }

  return inRange;
}

export function defaultPnlRange(points: PnlPoint[]): PnlRange {
  if (points.length < 2) return "All";
  const span = points[points.length - 1]!.t - points[0]!.t;
  if (span <= RANGE_MS["1D"]) return "1D";
  if (span <= RANGE_MS["7D"]) return "7D";
  if (span <= RANGE_MS["30D"]) return "30D";
  if (span <= RANGE_MS["90D"]) return "90D";
  return "All";
}
