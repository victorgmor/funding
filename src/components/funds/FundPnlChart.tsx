import { useId, useMemo, useRef, useState } from "react";
import { formatUsdExact } from "@/lib/funds/format";
import {
  buildPnlSeries,
  defaultPnlRange,
  filterPnlSeries,
  PNL_RANGE_LABELS,
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
const LINE_COLOR = "#288cbc";

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

type ScreenPoint = { x: number; y: number };

function toScreen(
  points: PnlPoint[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
): ScreenPoint[] {
  return points.map((point) => ({
    x: xScale(point.t),
    y: yScale(point.pnl),
  }));
}

/** Monotone cubic — smooth without overshooting flat PnL segments. */
function smoothLine(pts: ScreenPoint[]) {
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    return `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  }

  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dxi = pts[i + 1]!.x - pts[i]!.x;
    dx[i] = dxi;
    m[i] = dxi === 0 ? 0 : (pts[i + 1]!.y - pts[i]!.y) / dxi;
  }

  const slopes = new Array<number>(n);
  slopes[0] = m[0]!;
  slopes[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    slopes[i] =
      m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]!) < 1e-12) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
      continue;
    }
    const a = slopes[i]! / m[i]!;
    const b = slopes[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      slopes[i] = t * a * m[i]!;
      slopes[i + 1] = t * b * m[i]!;
    }
  }

  let path = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i]!;
    const p1 = pts[i + 1]!;
    const d = dx[i]!;
    path += ` C ${(p0.x + d / 3).toFixed(2)} ${(p0.y + (slopes[i]! * d) / 3).toFixed(2)}, ${(p1.x - d / 3).toFixed(2)} ${(p1.y - (slopes[i + 1]! * d) / 3).toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return path;
}

function smoothArea(pts: ScreenPoint[], zeroY: number) {
  if (pts.length === 0) return "";
  const line = smoothLine(pts);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return `${line} L ${last.x.toFixed(2)} ${zeroY.toFixed(2)} L ${first.x.toFixed(2)} ${zeroY.toFixed(2)} Z`;
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
  const screen = toScreen(points, xScale, yScale);

  const activeIndex = hover?.index ?? null;
  const activePoint = activeIndex != null ? points[activeIndex] : null;
  const displayPoint = activePoint ?? latest;
  const cursorX = hover?.x ?? null;
  const dateLabel = activePoint
    ? formatTooltipDate(new Date(displayPoint.t).toISOString())
    : PNL_RANGE_LABELS[range];

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;

    const rect = svg.getBoundingClientRect();
    const rawX = ((event.clientX - rect.left) / rect.width) * W;
    const x = Math.max(PAD.left, Math.min(PAD.left + plotW, rawX));
    const t = scaleLinear(x, [PAD.left, PAD.left + plotW], [xMin, xMax]);

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
            <span className="bg-[#288cbc]/15 text-[#288cbc] shrink-0 rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide">
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
            <p className="text-primary/50 text-xs">{dateLabel}</p>
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
              <stop offset="0%" stopColor={LINE_COLOR} stopOpacity="0.22" />
              <stop offset="100%" stopColor={LINE_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={smoothArea(screen, zeroY)} fill={`url(#${gradientId})`} />
          <path
            d={smoothLine(screen)}
            fill="none"
            stroke={LINE_COLOR}
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
                stroke={LINE_COLOR}
                strokeOpacity={0.4}
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={cursorX}
                cy={yScale(activePoint.pnl)}
                r={3.5}
                fill={LINE_COLOR}
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
