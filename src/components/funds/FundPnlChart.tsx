import { useMemo, useRef, useState } from "react";
import { formatSinceDate, formatUsdExact } from "@/lib/funds/format";
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
const PAD = { top: 12, right: 12, bottom: 28, left: 52 };

function formatTooltipDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAxisUsd(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `$${value < 0 ? "-" : ""}${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

function yDomain(points: PnlPoint[]) {
  const values = points.map((point) => point.pnl);
  let min = Math.min(...values, 0);
  let max = Math.max(...values, 0);
  if (min === max) {
    min -= 100;
    max += 100;
  }
  const pad = Math.max((max - min) * 0.12, 20);
  return { min: min - pad, max: max + pad };
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

function linePath(
  points: PnlPoint[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
) {
  return points
    .map((point, index) => {
      const cmd = index === 0 ? "M" : "L";
      return `${cmd} ${xScale(point.t).toFixed(2)} ${yScale(point.pnl).toFixed(2)}`;
    })
    .join(" ");
}

function areaPath(
  points: PnlPoint[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
  baseline: number,
) {
  if (points.length === 0) return "";
  const head = linePath(points, xScale, yScale);
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return `${head} L ${xScale(last.t).toFixed(2)} ${baseline.toFixed(2)} L ${xScale(first.t).toFixed(2)} ${baseline.toFixed(2)} Z`;
}

export default function FundPnlChart({
  trades,
  fundCreatedAt,
  embedded = false,
}: Props) {
  const series = useMemo(
    () => buildPnlSeries(trades, fundCreatedAt),
    [trades, fundCreatedAt],
  );
  const [range, setRange] = useState<PnlRange>(() => defaultPnlRange(series));
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const points = useMemo(
    () => filterPnlSeries(series, range),
    [series, range],
  );

  if (series.length < 2) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const { min: yMin, max: yMax } = yDomain(points);
  const xMin = points[0]!.t;
  const xMax = points[points.length - 1]!.t;

  const xScale = (t: number) =>
    scaleLinear(t, [xMin, xMax], [PAD.left, PAD.left + plotW]);
  const yScale = (v: number) =>
    scaleLinear(v, [yMin, yMax], [PAD.top + plotH, PAD.top]);
  const zeroY = yScale(0);

  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = yMin + ((yMax - yMin) * index) / 4;
    return { value, y: yScale(value) };
  });

  const xTickCount = Math.min(6, points.length);
  const xTicks = Array.from({ length: xTickCount }, (_, index) => {
    const t = xMin + ((xMax - xMin) * index) / Math.max(xTickCount - 1, 1);
    return { t, x: xScale(t), label: formatSinceDate(new Date(t).toISOString()) };
  });

  const activeIndex =
    hoverIndex != null
      ? Math.max(0, Math.min(hoverIndex, points.length - 1))
      : null;
  const activePoint = activeIndex != null ? points[activeIndex] : null;

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;

    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let nearestDist = Infinity;

    for (let index = 0; index < points.length; index++) {
      const dist = Math.abs(xScale(points[index]!.t) - x);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = index;
      }
    }

    setHoverIndex(nearest);
  }

  const lineColor = "#34d399";

  const content = (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {!embedded && (
          <span className="bg-[#32BCFF]/15 text-[#32BCFF] rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide">
            P&L
          </span>
        )}

        <div
          className={`text-primary/45 flex items-center gap-1 text-xs ${embedded ? "ml-auto" : ""}`}
        >
          <span className="mr-1">Time:</span>
          {PNL_RANGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={
                range === option
                  ? "bg-[#32BCFF] rounded-full px-2 py-0.5 font-medium text-white"
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
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label="Fund PnL over time"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="fund-pnl-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={tick.y}
                y2={tick.y}
                stroke="currentColor"
                strokeOpacity={0.12}
                strokeDasharray="3 4"
              />
              <text
                x={PAD.left - 8}
                y={tick.y + 4}
                textAnchor="end"
                className="fill-primary/45 font-mono text-[10px] tabular-nums"
              >
                {formatAxisUsd(tick.value)}
              </text>
            </g>
          ))}

          {yMin < 0 && yMax > 0 && (
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={zeroY}
              y2={zeroY}
              stroke="currentColor"
              strokeOpacity={0.2}
            />
          )}

          <path
            d={areaPath(points, xScale, yScale, PAD.top + plotH)}
            fill="url(#fund-pnl-fill)"
          />
          <path
            d={linePath(points, xScale, yScale)}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {xTicks.map((tick) => (
            <text
              key={tick.t}
              x={tick.x}
              y={H - 8}
              textAnchor="middle"
              className="fill-primary/45 font-mono text-[10px] tabular-nums"
            >
              {tick.label}
            </text>
          ))}

          {activePoint && activeIndex != null && (
            <>
              <line
                x1={xScale(activePoint.t)}
                x2={xScale(activePoint.t)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="#32BCFF"
                strokeOpacity={0.55}
                strokeDasharray="4 4"
              />
              <circle
                cx={xScale(activePoint.t)}
                cy={yScale(activePoint.pnl)}
                r={4}
                fill={lineColor}
                stroke="#0f2918"
                strokeWidth={2}
              />
            </>
          )}
        </svg>

        {activePoint && (
          <div
            className="border-primary/10 bg-secondary/90 pointer-events-none absolute z-10 rounded-md border px-2.5 py-1.5 text-xs shadow-sm backdrop-blur-sm"
            style={{
              left: `${(xScale(activePoint.t) / W) * 100}%`,
              top: 8,
              transform: "translateX(-50%)",
            }}
          >
            <p className="text-primary/50">{formatTooltipDate(activePoint.iso)}</p>
            <p
              className={`font-mono tabular-nums ${
                activePoint.pnl >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {formatUsdExact(activePoint.pnl, true)}
            </p>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) return <div>{content}</div>;

  return <div className="border-primary/10 mt-6 border-t pt-4">{content}</div>;
}
