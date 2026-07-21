import { useId, useMemo, useRef, useState } from "react";
import { formatUsdExact } from "@/lib/funds/format";
import {
  buildPnlSeries,
  defaultPnlRange,
  filterPnlSeries,
  PNL_RANGES,
  type PnlPoint,
  type PnlRange,
} from "@/lib/funds/pnl-series";
import type { MandateTrade } from "@/lib/funds/types";

type Props = {
  trades: MandateTrade[];
  fundCreatedAt?: string;
  embedded?: boolean;
};

const W = 640;
const H = 200;
const PAD = { top: 10, right: 0, bottom: 10, left: 0 };

function formatTooltipDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function niceStep(range: number, ticks = 4) {
  if (range <= 0) return 1;
  const rough = range / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function buildYScale(points: PnlPoint[]) {
  const values = points.map((point) => point.pnl);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const step = niceStep(
    Math.max(dataMax - dataMin, Math.abs(dataMax), Math.abs(dataMin), 1),
  );

  let min = Math.floor(Math.min(dataMin, 0) / step) * step;
  let max = Math.ceil(Math.max(dataMax, 0) / step) * step;

  if (min === max) {
    min -= step;
    max += step;
  }

  return { min, max };
}

function scaleLinear(
  value: number,
  domain: [number, number],
  range: [number, number],
) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return (r0 + r1) / 2;
  return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/** Step-after path — PnL holds flat until the next trade settles. */
function stepPath(
  points: PnlPoint[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
) {
  if (points.length === 0) return "";
  const first = points[0]!;
  let path = `M ${xScale(first.t).toFixed(2)} ${yScale(first.pnl).toFixed(2)}`;

  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    path += ` H ${xScale(point.t).toFixed(2)} V ${yScale(point.pnl).toFixed(2)}`;
  }

  return path;
}

function stepAreaToZero(
  points: PnlPoint[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
  zeroY: number,
) {
  if (points.length === 0) return "";

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const x0 = xScale(first.t);
  const y0 = yScale(first.pnl);

  let path = `M ${x0.toFixed(2)} ${zeroY.toFixed(2)} L ${x0.toFixed(2)} ${y0.toFixed(2)}`;

  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    path += ` H ${xScale(point.t).toFixed(2)} V ${yScale(point.pnl).toFixed(2)}`;
  }

  path += ` L ${xScale(last.t).toFixed(2)} ${zeroY.toFixed(2)} Z`;
  return path;
}

export default function FundPnlChart({
  trades,
  fundCreatedAt,
  embedded = false,
}: Props) {
  const gradientId = useId().replace(/:/g, "");
  const series = useMemo(
    () => buildPnlSeries(trades, fundCreatedAt),
    [trades, fundCreatedAt],
  );
  const [range, setRange] = useState<PnlRange>(() => defaultPnlRange(series));
  const [hover, setHover] = useState<{ x: number; index: number } | null>(
    null,
  );
  const svgRef = useRef<SVGSVGElement>(null);

  const points = useMemo(
    () => filterPnlSeries(series, range),
    [series, range],
  );

  if (series.length < 2) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const { min: yMin, max: yMax } = buildYScale(points);
  const xMin = points[0]!.t;
  const xMax = points[points.length - 1]!.t;
  const latest = points[points.length - 1]!;

  const xScale = (t: number) =>
    scaleLinear(t, [xMin, xMax], [PAD.left, PAD.left + plotW]);
  const yScale = (v: number) =>
    scaleLinear(v, [yMin, yMax], [PAD.top + plotH, PAD.top]);
  const zeroY = yScale(0);

  const activeIndex = hover?.index ?? null;
  const activePoint = activeIndex != null ? points[activeIndex] : null;
  const displayPoint = activePoint ?? latest;
  const lineColor = "#288cbc";
  const cursorX = hover?.x ?? null;

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;

    const rect = svg.getBoundingClientRect();
    const rawX = ((event.clientX - rect.left) / rect.width) * W;
    const x = Math.max(PAD.left, Math.min(PAD.left + plotW, rawX));
    const t = scaleLinear(x, [PAD.left, PAD.left + plotW], [xMin, xMax]);

    // Step-after: hold the last settled PnL at this time (matches the line).
    let index = 0;
    for (let i = 0; i < points.length; i++) {
      if (points[i]!.t <= t) index = i;
      else break;
    }

    setHover({ x, index });
  }

  const content = (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {!embedded && (
            <span className="bg-[#32BCFF]/15 text-[#32BCFF] shrink-0 rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide">
              P&L
            </span>
          )}
          <div className="min-w-0">
            <p
              className={`font-mono text-2xl tabular-nums tracking-tight ${
                displayPoint.pnl >= 0 ? "text-profit" : "text-red-500"
              }`}
            >
              {formatUsdExact(displayPoint.pnl, true)}
            </p>
            <p className="text-primary/50 text-xs">
              {formatTooltipDate(new Date(displayPoint.t).toISOString())}
            </p>
          </div>
        </div>

        <div className="text-primary/45 flex shrink-0 items-center gap-1 text-xs">
          {PNL_RANGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={
                range === option
                  ? "text-primary px-2 py-0.5 font-medium"
                  : "hover:text-primary/70 px-2 py-0.5 transition-colors"
              }
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-none select-none overflow-visible"
          role="img"
          aria-label="Fund PnL over time"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          <path
            d={stepAreaToZero(points, xScale, yScale, zeroY)}
            fill={`url(#${gradientId})`}
          />
          <path
            d={stepPath(points, xScale, yScale)}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {activePoint && cursorX != null && (
            <>
              <line
                x1={cursorX}
                x2={cursorX}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="#32BCFF"
                strokeOpacity={0.4}
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={cursorX}
                cy={yScale(activePoint.pnl)}
                r={3.5}
                fill={lineColor}
                stroke="#0f2918"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
      </div>
    </>
  );

  if (embedded) return <div>{content}</div>;

  return <div className="border-primary/10 mt-6 border-t pt-4">{content}</div>;
}
